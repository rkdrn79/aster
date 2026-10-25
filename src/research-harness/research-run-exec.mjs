import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { lstat, realpath } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { agentIdentityFromEnvironment } from './research-agent-identity.mjs'
import { CODE_PATCH_FILE, captureLaunchCode } from './research-code-capture.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { experimentPaths, experimentSlug } from './research-layout.mjs'
import {
  MAX_METRIC_LINE_BYTES,
  metricCandidateFromLine,
  metricEvent
} from './research-metric-events.mjs'
import { createRun } from './research-project.mjs'
import { researchPreflight } from './research-preflight.mjs'
import { MEDIA_LINE_PREFIX, appendRunMedia, mediaRowFromLine } from './research-run-media.mjs'
import {
  HARNESS_SOURCE,
  HEARTBEAT_INTERVAL_MS,
  updateRunManifest
} from './research-run-manifest.mjs'
import { organizeEndedRun } from './research-run-summary.mjs'

const forwardedSignals = ['SIGINT', 'SIGTERM', 'SIGHUP']

export function shellQuotedCommand(argv) {
  return argv
    .map((part) => (/^[\w@%+=:,./-]+$/u.test(part) ? part : `'${part.replaceAll("'", `'\\''`)}'`))
    .join(' ')
}

/** Splits a byte stream into lines, dropping any line longer than the metric line limit. */
function lineReader(onLine) {
  const decoder = new StringDecoder('utf8')
  let pending = ''
  let overflow = false
  return {
    push(chunk) {
      const parts = (pending + decoder.write(chunk)).split('\n')
      pending = parts.pop()
      for (const line of parts) {
        if (!overflow) {
          onLine(line.replace(/\r$/u, ''))
        }
        overflow = false
      }
      if (pending.length > MAX_METRIC_LINE_BYTES) {
        pending = ''
        overflow = true
      }
    },
    flush() {
      if (pending && !overflow) {
        onLine(pending.replace(/\r$/u, ''))
      }
      pending = ''
    }
  }
}

function closeStream(stream) {
  if (stream.destroyed) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    stream.once('error', resolve)
    stream.end(resolve)
  })
}

async function assertExperimentExists(project, experiment) {
  const slug = experimentSlug(experiment)
  const metadata = path.join(experimentPaths(project, slug).experiment, 'experiment.json')
  const found = await lstat(metadata).then(
    (details) => details.isFile(),
    () => false
  )
  if (!found) {
    throw new HarnessError(
      'experiment_not_found',
      `Experiment ${slug} does not exist; create it with: experiment --name "<name>"`
    )
  }
}

function finalState({ spawnError, cancelSignal, exitCode }) {
  if (spawnError) {
    return 'failed'
  }
  if (cancelSignal) {
    return 'cancelled'
  }
  return exitCode === 0 ? 'succeeded' : 'failed'
}

/**
 * Launches one Run: captures launch-time code, tees output into train.log, turns metric lines
 * into metrics.jsonl events and media lines into media.jsonl rows, records the observed exit in
 * run.json, and writes summary.json.
 */
export async function execRun(projectPath, options, io) {
  const argv = options.argv ?? []
  if (argv.length === 0) {
    throw new HarnessError('usage', 'run exec needs a command after --')
  }
  const project = await realpath(projectPath)
  const cwd = await realpath(path.resolve(options.cwd ?? process.cwd()))
  await assertExperimentExists(project, options.experiment)
  if (options.preflight) {
    const readiness = await researchPreflight(project, options.experiment, {
      loop: options.preflight === 'loop'
    })
    if (!readiness.ready) {
      throw new HarnessError(
        'preflight_blocked',
        `Run was not created; resolve: ${readiness.blockers.map((item) => item.id).join(', ')}`
      )
    }
  }
  const startedAt = new Date().toISOString()
  const captured = await captureLaunchCode(cwd, project, startedAt)
  const command = shellQuotedCommand(argv)
  const launch = {
    startedAt,
    finishedAt: null,
    durationMs: null,
    host: os.hostname(),
    platform: process.platform,
    pid: null,
    harnessPid: process.pid,
    signal: null,
    argv,
    cwd,
    by: HARNESS_SOURCE
  }
  const created = await createRun(
    project,
    { ...options, name: options.name ?? command.slice(0, 120), command },
    {
      execution: {
        state: 'running',
        reportedBy: 'manifest',
        observedAt: startedAt,
        exitCode: null,
        source: HARNESS_SOURCE
      },
      code: captured.code,
      launch,
      agent: agentIdentityFromEnvironment(),
      files: captured.patch ? { [CODE_PATCH_FILE]: captured.patch } : {}
    }
  )
  const { paths, runId, ref } = created
  const log = createWriteStream(paths.log, { flags: 'a' })
  const metrics = createWriteStream(paths.metrics, { flags: 'a' })
  // Why: a full disk or a closed reader (`| head`) must not kill the harness before it records the exit.
  const reportWriteError = (target) => (error) =>
    io.notice(`cannot write ${target}: ${error.message}`)
  log.on('error', reportWriteError(paths.log))
  metrics.on('error', reportWriteError(paths.metrics))
  const ignoreClosedReader = () => {}
  io.stdout.on('error', ignoreClosedReader)
  io.stderr.on('error', ignoreClosedReader)
  let metricEvents = 0
  let mediaItems = 0
  // Why a chain: media lines are checked on disk asynchronously but must land in output order.
  let mediaWrites = Promise.resolve()
  const recordMedia = async (line) => {
    try {
      await appendRunMedia(paths.run, await mediaRowFromLine(project, line, { cwd }))
      mediaItems += 1
    } catch (error) {
      io.notice(`ignored ASTER_MEDIA line: ${error.message}`)
    }
  }
  const recordLine = (allowBareJson) => (line) => {
    if (line.startsWith(MEDIA_LINE_PREFIX)) {
      mediaWrites = mediaWrites.then(() => recordMedia(line))
      return
    }
    const candidate = metricCandidateFromLine(line, { allowBareJson })
    const event = candidate && metricEvent(runId, candidate, new Date().toISOString())
    if (event) {
      metrics.write(`${JSON.stringify(event)}\n`)
      metricEvents += 1
    }
  }
  const stdoutLines = lineReader(recordLine(true))
  const stderrLines = lineReader(recordLine(false))

  const child = spawn(argv[0], argv.slice(1), {
    cwd,
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      ASTER_PROJECT: project,
      ASTER_EXPERIMENT: created.experiment,
      ASTER_RUN_ID: runId,
      ASTER_RUN_REF: ref,
      ASTER_RUN_DIR: paths.run,
      ASTER_RUN_ARTIFACTS: paths.artifacts,
      // Why: piped Python stdout is block-buffered, which would delay metric lines until exit.
      PYTHONUNBUFFERED: process.env.PYTHONUNBUFFERED ?? '1'
    }
  })

  let cancelSignal = null
  let terminalInterruptSeen = false
  let exited = false
  const onSignal = (signal) => {
    cancelSignal ??= signal
    if (exited) {
      return
    }
    // Why: a terminal Ctrl-C already reached the child through the shared process group.
    if (signal === 'SIGINT' && process.stdin.isTTY && !terminalInterruptSeen) {
      terminalInterruptSeen = true
      return
    }
    child.kill(signal)
  }
  for (const signal of forwardedSignals) {
    process.on(signal, onSignal)
  }

  let heartbeat = null
  let spawnError = null
  let didSpawn = false
  const spawned = new Promise((resolve) => {
    child.once('spawn', () => {
      didSpawn = true
      resolve(true)
    })
    child.on('error', (error) => {
      if (!didSpawn) {
        spawnError = error
        resolve(false)
      }
    })
  })
  const closed = new Promise((resolve) => {
    child.once('close', (exitCode, signal) => resolve({ exitCode, signal }))
  })
  child.stdout.on('data', (chunk) => {
    io.stdout.write(chunk)
    log.write(chunk)
    stdoutLines.push(chunk)
  })
  child.stderr.on('data', (chunk) => {
    io.stderr.write(chunk)
    log.write(chunk)
    stderrLines.push(chunk)
  })

  try {
    if (await spawned) {
      await updateRunManifest(paths, (manifest) => ({
        ...manifest,
        execution: { ...manifest.execution, observedAt: new Date().toISOString() },
        launch: { ...manifest.launch, pid: child.pid }
      })).catch((error) => io.notice(`could not record the pid of ${ref}: ${error.message}`))
      io.notice(`started ${ref} (pid ${child.pid}); log: ${paths.log}`)
      heartbeat = setInterval(() => {
        updateRunManifest(paths, (manifest) =>
          manifest.execution?.state === 'running'
            ? {
                ...manifest,
                execution: { ...manifest.execution, observedAt: new Date().toISOString() }
              }
            : manifest
        ).catch(() => {})
      }, HEARTBEAT_INTERVAL_MS)
      heartbeat.unref()
    }
    const outcome = spawnError ? { exitCode: null, signal: null } : await closed
    exited = true
    stdoutLines.flush()
    stderrLines.flush()
    await mediaWrites
    if (spawnError) {
      log.write(`[aster] failed to start ${command}: ${spawnError.message}\n`)
    }
    await Promise.all([closeStream(log), closeStream(metrics)])
    clearInterval(heartbeat)
    const finishedAt = new Date()
    const state = finalState({ spawnError, cancelSignal, exitCode: outcome.exitCode })
    const manifest = await updateRunManifest(paths, (current) => ({
      ...current,
      execution: {
        state,
        reportedBy: 'manifest',
        observedAt: finishedAt.toISOString(),
        exitCode: outcome.exitCode,
        source: HARNESS_SOURCE,
        evidence: 'process-exit'
      },
      launch: {
        ...current.launch,
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - Date.parse(startedAt),
        signal: outcome.signal ?? null,
        ...(spawnError ? { error: spawnError.message } : {})
      },
      harness: { ...current.harness, status: 'observed' }
    }))
    await organizeEndedRun(project, ref, io.notice)
    return {
      ref,
      experiment: created.experiment,
      runId,
      state,
      exitCode: outcome.exitCode,
      signal: outcome.signal ?? null,
      cancelSignal,
      spawnError: spawnError?.message ?? null,
      durationMs: manifest.launch.durationMs,
      metricEvents,
      mediaItems,
      code: manifest.code,
      agent: manifest.agent ?? null,
      paths
    }
  } finally {
    clearInterval(heartbeat)
    io.stdout.off('error', ignoreClosedReader)
    io.stderr.off('error', ignoreClosedReader)
    for (const signal of forwardedSignals) {
      process.off(signal, onSignal)
    }
  }
}
