import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const cli = path.join(import.meta.dirname, 'cli.mjs')
const agentEnvironment = {
  ORCA_AGENT_SESSION_ID: '',
  ORCA_TERMINAL_HANDLE: '',
  ORCA_PANE_KEY: '',
  ORCA_AGENT_PANE: '',
  CLAUDECODE: '',
  CLAUDE_CODE_ENTRYPOINT: '',
  CLAUDE_CODE_SESSION_ID: '',
  CODEX_THREAD_ID: '',
  CODEX_SANDBOX: '',
  CODEX_SANDBOX_NETWORK_DISABLED: '',
  CODEX_MANAGED_BY_NPM: '',
  CODEX_MANAGED_BY_BUN: '',
  AI_AGENT: ''
}

function startCli(args, { cwd, env = {} }) {
  const child = spawn(process.execPath, [cli, ...args], {
    cwd,
    env: { ...process.env, ...agentEnvironment, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => (stdout += chunk))
  child.stderr.on('data', (chunk) => (stderr += chunk))
  const done = new Promise((resolve) => {
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
  return { child, done }
}

async function runCli(args, options) {
  return startCli(args, options).done
}

async function runJson(args, options) {
  const end = args.includes('--') ? args.indexOf('--') : args.length
  const result = await runCli([...args.slice(0, end), '--json', ...args.slice(end)], options)
  return { ...result, body: JSON.parse(result.stdout.trim().split('\n').at(-1)) }
}

async function temporaryDirectory(task) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-harness-cli-')))
  try {
    await task(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function researchProject(directory, { git }) {
  if (git) {
    const runGit = (...args) => execFileSync('git', args, { cwd: directory, stdio: 'ignore' })
    runGit('init', '-q')
    runGit('config', 'user.email', 'harness@example.com')
    runGit('config', 'user.name', 'Harness Test')
    await writeFile(path.join(directory, 'model.py'), 'rank = 8\n')
    runGit('add', 'model.py')
    runGit('commit', '-qm', 'initial')
  }
  assert.equal((await runCli(['init', '--project', directory], { cwd: directory })).code, 0)
  const created = await runCli(['experiment', '--name', 'Main'], { cwd: directory })
  assert.equal(created.code, 0, created.stderr)
}

async function readRun(directory, runId) {
  const run = path.join(directory, '.aster', 'experiments', 'main', 'runs', runId)
  return {
    run,
    manifest: JSON.parse(await readFile(path.join(run, 'run.json'), 'utf8')),
    events: (await readFile(path.join(run, 'metrics.jsonl'), 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
    log: await readFile(path.join(run, 'train.log'), 'utf8')
  }
}

async function waitFor(check, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await check().catch(() => null)
    if (value) {
      return value
    }
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for condition')
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

const metricScript = `
console.log('ASTER_METRIC ' + JSON.stringify({ step: 1, split: 'val', metrics: { loss: 0.9, acc: 0.5 } }))
console.log(JSON.stringify({ step: 2, split: 'val', metrics: { loss: 0.4 } }))
console.log('{"not":"a metric"}')
console.log('ASTER_METRIC not json')
console.log('plain log line')
// Why the delay: stdout and stderr are separate pipes, so only time orders lines across them.
setTimeout(() => {
  console.error('ASTER_METRIC ' + JSON.stringify({ step: 3, split: 'val', metrics: { loss: 0.6 } }))
  process.exit(Number(process.argv[2] ?? 0))
}, 200)
`

test('run exec records launch provenance, metrics, log, and success from a project subdirectory', async () => {
  await temporaryDirectory(async (directory) => {
    await researchProject(directory, { git: true })
    await writeFile(path.join(directory, 'model.py'), 'rank = 16\n')
    await writeFile(path.join(directory, 'train.mjs'), metricScript)
    const subdirectory = path.join(directory, 'scripts')
    await mkdir(subdirectory)
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory }).toString().trim()

    const { code, body, stderr } = await runJson(
      [
        'run',
        'exec',
        '--experiment',
        'main',
        '--id',
        'ok-1',
        '--metric-def',
        'loss:minimize',
        '--',
        process.execPath,
        '../train.mjs',
        '0'
      ],
      {
        cwd: subdirectory,
        env: {
          ORCA_AGENT_SESSION_ID: 'session-1',
          ORCA_TERMINAL_HANDLE: 'term-1',
          ORCA_PANE_KEY: 'pane-1',
          CLAUDECODE: '1'
        }
      }
    )
    assert.equal(code, 0, stderr)
    assert.equal(body.ok, true)
    assert.equal(body.ref, 'main/ok-1')
    assert.equal(body.state, 'succeeded')
    assert.match(stderr, /plain log line/)

    const { run, manifest, events, log } = await readRun(directory, 'ok-1')
    assert.equal(manifest.execution.state, 'succeeded')
    assert.equal(manifest.execution.reportedBy, 'manifest')
    assert.equal(manifest.execution.exitCode, 0)
    assert.equal(manifest.execution.source, 'aster-harness')
    assert.equal(manifest.launch.by, 'aster-harness')
    assert.equal(manifest.launch.cwd, subdirectory)
    assert.deepEqual(manifest.launch.argv, [process.execPath, '../train.mjs', '0'])
    assert.equal(manifest.launch.host, os.hostname())
    assert.equal(typeof manifest.launch.pid, 'number')
    assert.equal(typeof manifest.launch.durationMs, 'number')
    assert.equal(manifest.launch.signal, null)
    assert.equal(manifest.code.commit, head)
    assert.equal(manifest.code.dirty, true)
    assert.equal(manifest.code.capturePhase, 'at_launch')
    assert.equal(manifest.code.patch, 'code.patch')
    const patch = await readFile(path.join(run, 'code.patch'))
    assert.equal(manifest.code.patchSha256, createHash('sha256').update(patch).digest('hex'))
    assert.match(patch.toString(), /^\+rank = 16$/mu)
    assert.match(patch.toString(), /\+\+\+ b\/train\.mjs/u)
    assert.doesNotMatch(patch.toString(), /diff --git a\/(?:\.aster|paper)\//u)
    assert.deepEqual(manifest.agent, {
      provider: 'claude-code',
      sessionId: 'session-1',
      terminalHandle: 'term-1',
      paneKey: 'pane-1',
      providerSessionId: null
    })
    assert.deepEqual(manifest.metrics.definitions, { loss: { direction: 'minimize' } })
    assert.deepEqual(
      events.map((event) => [event.runId, event.step, event.metrics.loss]),
      [
        ['ok-1', 1, 0.9],
        ['ok-1', 2, 0.4],
        ['ok-1', 3, 0.6]
      ]
    )
    assert.match(log, /plain log line/)
    assert.match(log, /ASTER_METRIC \{"step":3/)

    const validation = await runJson(['validate'], { cwd: subdirectory })
    assert.deepEqual(validation.body.issues, [])
    const context = await runJson(['context'], { cwd: subdirectory })
    const loss = context.body.experiments[0].runs[0].metrics.find((item) => item.name === 'loss')
    assert.deepEqual([loss.last, loss.best, loss.bestStep], [0.6, 0.4, 2])
  })
})

test('run exec mirrors failing exits and records them without git', async () => {
  await temporaryDirectory(async (directory) => {
    await researchProject(directory, { git: false })
    await writeFile(path.join(directory, 'train.mjs'), metricScript)
    const failed = await runCli(
      [
        'run',
        'exec',
        '--experiment',
        'main',
        '--id',
        'bad-1',
        '--',
        process.execPath,
        'train.mjs',
        '3'
      ],
      { cwd: directory }
    )
    assert.equal(failed.code, 3)
    const { manifest } = await readRun(directory, 'bad-1')
    assert.equal(manifest.execution.state, 'failed')
    assert.equal(manifest.execution.exitCode, 3)
    assert.deepEqual(
      [manifest.code.commit, manifest.code.dirty, manifest.code.patch],
      [null, null, null]
    )
    assert.equal(manifest.agent, undefined)

    const missing = await runCli(
      ['run', 'exec', '--experiment', 'main', '--id', 'bad-2', '--', 'aster-no-such-command-xyz'],
      { cwd: directory }
    )
    assert.equal(missing.code, 127)
    const notStarted = await readRun(directory, 'bad-2')
    assert.equal(notStarted.manifest.execution.state, 'failed')
    assert.match(notStarted.manifest.launch.error, /ENOENT/u)
  })
})

test('run exec forwards cancellation and refuses a manual finish while it runs', async () => {
  await temporaryDirectory(async (directory) => {
    await researchProject(directory, { git: false })
    await writeFile(
      path.join(directory, 'wait.mjs'),
      'console.log(\'ASTER_METRIC {"metrics":{"loss":1}}\'); setInterval(() => {}, 1000)\n'
    )
    const { child, done } = startCli(
      ['run', 'exec', '--experiment', 'main', '--id', 'long-1', '--', process.execPath, 'wait.mjs'],
      { cwd: directory }
    )
    await waitFor(async () => (await readRun(directory, 'long-1')).events.length === 1)
    const running = await readRun(directory, 'long-1')
    assert.equal(running.manifest.execution.state, 'running')
    const finish = await runJson(
      ['run', 'finish', '--run', 'main/long-1', '--status', 'succeeded'],
      {
        cwd: directory
      }
    )
    assert.equal(finish.code, 1)
    assert.equal(finish.body.error.code, 'run_active')

    if (process.platform === 'win32') {
      // Windows has no catchable signal from another process: kill() is TerminateProcess, so the
      // Run stays running; libuv's kill-on-close job object still ends the command with it.
      child.kill()
      await done
      const { manifest } = await readRun(directory, 'long-1')
      assert.equal(manifest.execution.state, 'running')
      const alive = (pid) => {
        try {
          return process.kill(pid, 0)
        } catch (error) {
          return error.code !== 'ESRCH'
        }
      }
      await waitFor(async () => !alive(manifest.launch.pid))
      return
    }
    child.kill('SIGTERM')
    const result = await done
    const { manifest } = await readRun(directory, 'long-1')
    assert.equal(manifest.execution.state, 'cancelled')
    assert.equal(result.code, 143)
    assert.equal(manifest.launch.signal, 'SIGTERM')
  })
})

test('runs launched elsewhere take metrics, a reported finish, and artifacts', async () => {
  await temporaryDirectory(async (directory) => {
    await researchProject(directory, { git: false })
    const created = await runJson(
      ['new-run', '--experiment', 'main', '--name', 'slurm job', '--id', 'remote-1'],
      { cwd: directory }
    )
    assert.equal(created.body.ref, 'main/remote-1')
    const logged = await runJson(
      [
        'run',
        'log-metric',
        '--run',
        'main/remote-1',
        '--step',
        '10',
        '--split',
        'val',
        'loss=0.41',
        'acc=0.88'
      ],
      { cwd: directory }
    )
    assert.deepEqual(logged.body.event.metrics, { loss: 0.41, acc: 0.88 })
    const finished = await runJson(
      [
        'run',
        'finish',
        '--run',
        'remote-1',
        '--status',
        'failed',
        '--exit-code',
        '2',
        '--note',
        'OOM'
      ],
      { cwd: directory }
    )
    assert.equal(finished.body.execution.state, 'failed')
    assert.equal(finished.body.execution.evidence, 'reported')
    await writeFile(path.join(directory, 'confusion.csv'), 'a,b\n1,2\n')
    const attached = await runJson(
      ['run', 'attach-artifact', '--run', 'main/remote-1', '--file', 'confusion.csv'],
      { cwd: directory }
    )
    assert.equal(attached.body.artifact.path, 'artifacts/confusion.csv')
    const shown = await runJson(['run', 'show', 'main/remote-1'], { cwd: directory })
    assert.equal(shown.body.run.state, 'failed')
    assert.equal(shown.body.metrics.series.length, 2)
    assert.deepEqual(shown.body.artifacts.directory, ['confusion.csv'])

    const listed = await runJson(['run', 'list', '--state', 'failed'], { cwd: directory })
    assert.deepEqual(
      listed.body.runs.map((run) => run.ref),
      ['main/remote-1']
    )
    const unknown = await runJson(['run', 'show', 'main/nope'], { cwd: directory })
    assert.equal(unknown.code, 1)
    assert.deepEqual(unknown.body.ok, false)
    assert.equal(unknown.body.error.code, 'run_not_found')
    const usage = await runJson(['frobnicate'], { cwd: directory })
    assert.equal(usage.body.error.code, 'usage')
  })
})
