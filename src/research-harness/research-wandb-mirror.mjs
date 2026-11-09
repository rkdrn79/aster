import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import os from 'node:os'
import path from 'node:path'
import {
  WANDB_TAG,
  findWandbPython,
  readWandbSettings,
  wandbChildEnvironment,
  wandbRunId
} from './research-wandb.mjs'
import { WANDB_MIRROR_SCRIPT } from './research-wandb-mirror-script.mjs'

/** How long `run exec` waits after the command ends for the W&B upload before leaving it. */
export const WANDB_FINISH_WAIT_MS = 60_000
const MAX_WARNING_LENGTH = 300

function sidecarEnvironment() {
  // Why: the sidecar's own output is ignored, so wandb has nothing to print it for.
  return { ...process.env, WANDB_SILENT: 'true', WANDB_CONSOLE: 'off', PYTHONUNBUFFERED: '1' }
}

async function writeMirrorScript() {
  // Why mkdtemp: a private, fresh folder, so another user on a shared server cannot plant the file.
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aster-wandb-'))
  const script = path.join(directory, 'wandb_mirror.py')
  await writeFile(script, WANDB_MIRROR_SCRIPT, { mode: 0o600 })
  return { script, remove: () => rm(directory, { recursive: true, force: true }).catch(() => {}) }
}

function delay(ms) {
  let timer
  const promise = new Promise((resolve) => {
    timer = setTimeout(resolve, ms)
    timer.unref?.()
  })
  return { promise, cancel: () => clearTimeout(timer) }
}

/**
 * One Run's W&B mirror. `record` goes into run.json at launch; `start` finds Python and starts
 * the sidecar in the background; `finish` tells it the Run ended and resolves the record to keep.
 * Nothing here throws: every failure becomes `record.warning`.
 */
export function createRunWandbMirror(settings, run, { notice = () => {}, findPython } = {}) {
  const record = {
    entity: settings.entity,
    project: settings.project,
    group: run.experiment,
    runId: wandbRunId({ project: settings.project, experiment: run.experiment, run: run.runId }),
    url: null,
    status: 'mirroring'
  }
  let child = null
  let exited = null
  let abandoned = false
  let removeScript = async () => {}
  const warn = (message) => {
    const text = String(message).slice(0, MAX_WARNING_LENGTH)
    record.warning ??= text
    notice(`W&B: ${text}`)
  }
  const onStatus = (line) => {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    void removeScript()
    if (message?.type === 'started') {
      const url = typeof message.url === 'string' ? message.url : null
      record.url = url
      record.entity = typeof message.entity === 'string' ? message.entity : record.entity
      notice(`mirroring metrics to W&B ${url ?? settings.project}`)
    } else if (message?.type === 'finished') {
      record.status = 'synced'
      record.url = typeof message.url === 'string' ? message.url : record.url
    } else if (message?.type === 'warning' || message?.type === 'error') {
      warn(message.message)
    }
  }

  const launch = async () => {
    const python = await (findPython ?? findWandbPython)(settings.python)
    if (abandoned) {
      return
    }
    if (!python) {
      warn('no Python with the wandb package was found; set "wandb.python" in the catalog')
      return
    }
    const written = await writeMirrorScript()
    removeScript = written.remove
    const args = [
      written.script,
      '--metrics',
      run.paths.metrics,
      '--project',
      settings.project,
      '--group',
      run.experiment,
      '--name',
      run.runId,
      '--id',
      record.runId,
      '--tags',
      WANDB_TAG,
      ...(settings.entity ? ['--entity', settings.entity] : []),
      ...(run.config ? ['--config', run.config] : []),
      ...(run.meta ? ['--meta', JSON.stringify(run.meta)] : [])
    ]
    child = spawn(python, args, {
      cwd: run.cwd,
      env: sidecarEnvironment(),
      stdio: ['pipe', 'pipe', 'ignore'],
      // Why detached: a terminal Ctrl-C must reach the command, not cut the upload short.
      detached: process.platform !== 'win32',
      windowsHide: true
    })
    child.stdin.on('error', () => {})
    exited = new Promise((resolve) => {
      child.once('error', (error) => {
        warn(`could not start ${python}: ${error.message}`)
        resolve(null)
      })
      child.once('close', (code) => resolve(code))
    })
    createInterface({ input: child.stdout }).on('line', onStatus)
  }
  let ready = null

  return {
    record,
    childEnvironment: wandbChildEnvironment(settings, run.experiment),
    start() {
      ready ??= launch().catch((error) => warn(error.message))
      return ready
    },
    /** Sends the end of the Run and waits up to `waitMs` for the upload; null when never started. */
    async finish({ state, exitCode }, { waitMs = WANDB_FINISH_WAIT_MS } = {}) {
      if (!ready) {
        return null
      }
      const timeout = delay(waitMs)
      const started = await Promise.race([ready.then(() => true), timeout.promise])
      if (!started) {
        abandoned = true
        warn('Python discovery did not finish in time; this Run was not mirrored')
        record.status = 'failed'
        return { ...record }
      }
      if (!child) {
        timeout.cancel()
        record.status = 'failed'
        return { ...record }
      }
      child.stdin.end(`${JSON.stringify({ type: 'end', state, exitCode: exitCode ?? null })}\n`)
      const code = await Promise.race([exited, timeout.promise.then(() => undefined)])
      timeout.cancel()
      if (code === undefined) {
        // Why: the Run is over; the upload may finish on its own after the harness exits.
        child.stdout.destroy()
        child.unref()
        record.status = 'uploading'
        notice('W&B upload is still running in the background')
      } else if (record.status !== 'synced') {
        record.status = 'failed'
        if (!record.warning) {
          warn(`the mirror exited with code ${code}`)
        }
      }
      await removeScript()
      return { ...record }
    },
    /** For a launch that failed before `finish`: lets the sidecar end on stdin EOF by itself. */
    release() {
      abandoned = true
      if (child && exited) {
        child.stdin.end()
        child.stdout.destroy()
        child.unref()
      }
      void removeScript()
    }
  }
}

/** The mirror for a `run exec` launch, or null when the project's W&B setting is off. */
export async function prepareRunWandbMirror(project, run, notice) {
  const settings = await readWandbSettings(project)
  if (!settings) {
    return null
  }
  if (settings.error) {
    notice(`W&B mirroring is off for this Run: ${settings.error}`)
    return null
  }
  return createRunWandbMirror(settings, run, { notice })
}
