import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { appendFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { WANDB_MIRROR_SCRIPT } from './research-wandb-mirror-script.mjs'
import { createRunWandbMirror } from './research-wandb-mirror.mjs'
import { wandbRunId } from './research-wandb.mjs'

const cli = path.join(import.meta.dirname, 'cli.mjs')
const hasPython = spawnSync('python3', ['--version'], { stdio: 'ignore' }).status === 0
const skip = hasPython ? false : 'python3 is not installed'

// Never the real service: this stands in for `wandb` and writes each call to FAKE_WANDB_LOG.
const FAKE_WANDB = `
import json, os
if os.environ.get("FAKE_WANDB_IMPORT_ERROR"):
    raise ImportError("No module named 'wandb'")
LOG = os.environ["FAKE_WANDB_LOG"]
STATE = os.environ.get("FAKE_WANDB_STATE")
def _write(event):
    with open(LOG, "a") as handle:
        handle.write(json.dumps(event) + "\\n")
class Settings:
    def __init__(self, **options):
        self.options = options
class _Run:
    def __init__(self, options):
        self.id = options["id"]
        self.entity = options.get("entity") or "fake-entity"
        self.project = options["project"]
        self.url = "https://wandb.example/%s/%s/runs/%s" % (self.entity, self.project, self.id)
        self.summary = {}
        if STATE and os.path.exists(os.path.join(STATE, self.id)):
            with open(os.path.join(STATE, self.id)) as handle:
                self.summary = json.load(handle)
    def define_metric(self, name, **options):
        _write({"call": "define_metric", "name": name, "options": options})
    def log(self, payload):
        _write({"call": "log", "payload": payload})
    def finish(self, exit_code=None):
        _write({"call": "finish", "exit_code": exit_code})
        if STATE:
            with open(os.path.join(STATE, self.id), "w") as handle:
                json.dump(self.summary, handle)
def init(**options):
    if os.environ.get("FAKE_WANDB_INIT_ERROR"):
        raise RuntimeError("api_key not configured (no-tty)")
    options.pop("settings", None)
    _write(dict(call="init", **options))
    return _Run(options)
`

async function fixture(task) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-wandb-mirror-')))
  try {
    await mkdir(path.join(directory, 'fake', 'wandb'), { recursive: true })
    await mkdir(path.join(directory, 'state'))
    await writeFile(path.join(directory, 'fake', 'wandb', '__init__.py'), FAKE_WANDB)
    await writeFile(path.join(directory, 'mirror.py'), WANDB_MIRROR_SCRIPT)
    const env = {
      ...process.env,
      PYTHONPATH: path.join(directory, 'fake'),
      FAKE_WANDB_LOG: path.join(directory, 'calls.jsonl'),
      FAKE_WANDB_STATE: path.join(directory, 'state'),
      WANDB_DIR: path.join(directory, 'wandb-dir'),
      WANDB_MODE: 'offline'
    }
    const calls = async () =>
      (await readFile(env.FAKE_WANDB_LOG, 'utf8').catch(() => ''))
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    await task({ directory, env, calls })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function runMirror(directory, env, args, { end, beforeEnd } = {}) {
  const child = spawn('python3', [path.join(directory, 'mirror.py'), ...args], {
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => (stdout += chunk))
  child.stderr.on('data', (chunk) => (stderr += chunk))
  void (async () => {
    await beforeEnd?.()
    child.stdin.end(end ? `${JSON.stringify(end)}\n` : '')
  })()
  return new Promise((resolve) => {
    child.on('close', (code) =>
      resolve({
        code,
        stderr,
        events: stdout
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      })
    )
  })
}

const row = (fields) => `${JSON.stringify({ schemaVersion: 1, runId: 'r1', ...fields })}\n`
const baseArgs = (directory) => [
  '--metrics',
  path.join(directory, 'metrics.jsonl'),
  '--project',
  'demo',
  '--group',
  'main',
  '--name',
  'r1',
  '--id',
  'aster-0123456789abcdef'
]

test('rows become split/name payloads on the aster/step axis', { skip }, async () => {
  await fixture(async ({ directory, env, calls }) => {
    const metrics = path.join(directory, 'metrics.jsonl')
    await writeFile(
      metrics,
      [
        row({ step: 1, split: 'train', metrics: { loss: 0.5, acc: null } }),
        row({ step: 2, metrics: { loss: 0.4 } }),
        'not json\n',
        row({ split: 'val', metrics: { flag: true } })
      ].join('')
    )
    await writeFile(path.join(directory, 'config.json'), JSON.stringify({ lr: 0.001 }))
    const result = await runMirror(
      directory,
      env,
      baseArgs(directory).concat([
        '--entity',
        'team',
        '--config',
        path.join(directory, 'config.json'),
        '--meta',
        JSON.stringify({ run: 'r1', commit: 'abc' })
      ]),
      {
        // Why: a row appended while the mirror runs must still arrive, including a last line
        // that has no newline yet.
        beforeEnd: async () => {
          await new Promise((resolve) => setTimeout(resolve, 1500))
          await appendFile(
            metrics,
            JSON.stringify({ step: 3.5, split: 'val', metrics: { acc: 0.9 } })
          )
        },
        end: { type: 'end', state: 'failed', exitCode: 2 }
      }
    )
    assert.equal(result.code, 0, result.stderr)
    assert.deepEqual(
      result.events.map((event) => event.type),
      ['started', 'finished']
    )
    assert.equal(
      result.events[0].url,
      'https://wandb.example/team/demo/runs/aster-0123456789abcdef'
    )
    const recorded = await calls()
    const init = recorded.find((call) => call.call === 'init')
    assert.equal(init.project, 'demo')
    assert.equal(init.entity, 'team')
    assert.equal(init.group, 'main')
    assert.equal(init.name, 'r1')
    assert.equal(init.id, 'aster-0123456789abcdef')
    assert.equal(init.resume, 'allow')
    assert.deepEqual(init.tags, ['aster'])
    assert.deepEqual(init.config, { lr: 0.001, aster: { run: 'r1', commit: 'abc' } })
    assert.equal(init.dir, env.WANDB_DIR)
    assert.deepEqual(
      recorded.filter((call) => call.call === 'define_metric').map((call) => call.name),
      ['aster/step', '*']
    )
    assert.deepEqual(
      recorded.filter((call) => call.call === 'log').map((call) => call.payload),
      [
        { 'train/loss': 0.5, 'aster/step': 1 },
        { loss: 0.4, 'aster/step': 2 },
        { 'val/acc': 0.9, 'aster/step': 3.5 }
      ]
    )
    assert.deepEqual(recorded.at(-1), { call: 'finish', exit_code: 2 })
  })
})

test('a second mirror of the same run skips the rows already sent', { skip }, async () => {
  await fixture(async ({ directory, env, calls }) => {
    const metrics = path.join(directory, 'metrics.jsonl')
    await writeFile(
      metrics,
      row({ step: 1, metrics: { loss: 1 } }) + row({ step: 2, metrics: { loss: 0.5 } })
    )
    const end = { type: 'end', state: 'succeeded', exitCode: 0 }
    assert.equal((await runMirror(directory, env, baseArgs(directory), { end })).code, 0)
    await appendFile(metrics, row({ step: 3, metrics: { loss: 0.25 } }))
    const again = await runMirror(directory, env, baseArgs(directory), { end })
    assert.equal(again.code, 0)
    assert.deepEqual(again.events.at(-1), {
      type: 'finished',
      rows: 3,
      logged: 1,
      url: 'https://wandb.example/fake-entity/demo/runs/aster-0123456789abcdef'
    })
    const logs = (await calls()).filter((call) => call.call === 'log')
    assert.deepEqual(
      logs.map((call) => call.payload.loss),
      [1, 0.5, 0.25]
    )
    assert.deepEqual((await calls()).at(-1), { call: 'finish', exit_code: 0 })
  })
})

test('missing wandb or a failed login is reported, not raised', { skip }, async () => {
  await fixture(async ({ directory, env }) => {
    await writeFile(path.join(directory, 'metrics.jsonl'), '')
    const missing = await runMirror(
      directory,
      { ...env, FAKE_WANDB_IMPORT_ERROR: '1' },
      baseArgs(directory)
    )
    assert.equal(missing.code, 2)
    assert.match(missing.events[0].message, /cannot import wandb/)
    const login = await runMirror(
      directory,
      { ...env, FAKE_WANDB_INIT_ERROR: '1' },
      baseArgs(directory)
    )
    assert.equal(login.code, 3)
    assert.match(login.events[0].message, /wandb.init failed: RuntimeError: api_key not configured/)
  })
})

test(
  'the harness side records the URL, or a warning when no Python has wandb',
  { skip },
  async () => {
    await fixture(async ({ directory, env }) => {
      const metrics = path.join(directory, 'metrics.jsonl')
      await writeFile(metrics, row({ step: 1, metrics: { loss: 1 } }))
      const run = { experiment: 'main', runId: 'r1', paths: { metrics }, cwd: directory }
      const settings = { enabled: true, entity: null, project: 'demo', python: null }
      const notices = []
      const none = createRunWandbMirror(settings, run, {
        notice: (text) => notices.push(text),
        findPython: async () => null
      })
      assert.equal(await none.finish({ state: 'succeeded', exitCode: 0 }), null)
      await none.start()
      const failed = await none.finish({ state: 'succeeded', exitCode: 0 })
      assert.equal(failed.status, 'failed')
      assert.match(failed.warning, /no Python with the wandb package/)
      assert.match(notices[0], /^W&B: no Python/)

      // Why: the sidecar inherits the harness's environment, which is this test process.
      const overrides = {
        PYTHONPATH: env.PYTHONPATH,
        FAKE_WANDB_LOG: env.FAKE_WANDB_LOG,
        WANDB_DIR: env.WANDB_DIR,
        WANDB_MODE: 'offline'
      }
      const saved = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]))
      Object.assign(process.env, overrides)
      try {
        const mirror = createRunWandbMirror(settings, run, { findPython: async () => 'python3' })
        const id = wandbRunId({ project: 'demo', experiment: 'main', run: 'r1' })
        assert.deepEqual(mirror.record, {
          entity: null,
          project: 'demo',
          group: 'main',
          runId: id,
          url: null,
          status: 'mirroring'
        })
        await mirror.start()
        const done = await mirror.finish({ state: 'succeeded', exitCode: 0 })
        assert.equal(done.status, 'synced')
        assert.equal(done.entity, 'fake-entity')
        assert.equal(done.url, `https://wandb.example/fake-entity/demo/runs/${id}`)
        assert.equal(done.warning, undefined)
      } finally {
        for (const [key, value] of Object.entries(saved)) {
          if (value === undefined) {
            delete process.env[key]
          } else {
            process.env[key] = value
          }
        }
      }
    })
  }
)

function runCli(args, cwd, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

test('run exec mirrors to W&B when the project turns it on', { skip }, async () => {
  await fixture(async ({ directory, env, calls }) => {
    const project = path.join(directory, 'project')
    await mkdir(project)
    assert.equal((await runCli(['init'], project, env)).code, 0)
    assert.equal((await runCli(['experiment', '--name', 'Main'], project, env)).code, 0)
    const catalogFile = path.join(project, '.aster', 'project.json')
    const catalog = JSON.parse(await readFile(catalogFile, 'utf8'))
    catalog.wandb = { enabled: true, entity: 'team', project: 'demo', python: 'python3' }
    await writeFile(catalogFile, JSON.stringify(catalog))
    const script = [
      "console.log('ASTER_METRIC ' + JSON.stringify({ step: 1, split: 'train', metrics: { loss: 0.5 } }))",
      "const keys = ['WANDB_PROJECT', 'WANDB_ENTITY', 'WANDB_RUN_GROUP', 'WANDB_TAGS', 'WANDB_RUN_ID', 'WANDB_NAME']",
      "console.log('ENV ' + JSON.stringify(Object.fromEntries(keys.map((key) => [key, process.env[key] ?? null]))))"
    ].join(';')
    const exec = await runCli(
      [
        'run',
        'exec',
        '--experiment',
        'main',
        '--id',
        'seed-1',
        '--json',
        '--',
        process.execPath,
        '-e',
        script
      ],
      project,
      { ...env, WANDB_RUN_ID: 'outer', WANDB_NAME: 'outer' }
    )
    assert.equal(exec.code, 0, exec.stderr)
    const body = JSON.parse(exec.stdout.trim().split('\n').at(-1))
    const id = wandbRunId({ project: 'demo', experiment: 'main', run: 'seed-1' })
    assert.equal(body.wandb.status, 'synced')
    assert.equal(body.wandb.url, `https://wandb.example/team/demo/runs/${id}`)
    const runDirectory = path.join(project, '.aster', 'experiments', 'main', 'runs', 'seed-1')
    const manifest = JSON.parse(await readFile(path.join(runDirectory, 'run.json'), 'utf8'))
    assert.deepEqual(manifest.wandb, {
      entity: 'team',
      project: 'demo',
      group: 'main',
      runId: id,
      url: `https://wandb.example/team/demo/runs/${id}`,
      status: 'synced'
    })
    const log = await readFile(path.join(runDirectory, 'train.log'), 'utf8')
    assert.deepEqual(JSON.parse(log.split('ENV ')[1]), {
      WANDB_PROJECT: 'demo',
      WANDB_ENTITY: 'team',
      WANDB_RUN_GROUP: 'main',
      WANDB_TAGS: 'aster',
      // Why: inherited from the shell, never set by the harness; the mirror drops them itself.
      WANDB_RUN_ID: 'outer',
      WANDB_NAME: 'outer'
    })
    const recorded = await calls()
    assert.equal(recorded.find((call) => call.call === 'init').name, 'seed-1')
    assert.deepEqual(
      recorded.filter((call) => call.call === 'log').map((call) => call.payload),
      [{ 'train/loss': 0.5, 'aster/step': 1 }]
    )
  })
})

test('run exec without a wandb section sets no W&B variables', { skip }, async () => {
  await fixture(async ({ directory, env, calls }) => {
    const project = path.join(directory, 'project')
    await mkdir(project)
    assert.equal((await runCli(['init'], project, env)).code, 0)
    assert.equal((await runCli(['experiment', '--name', 'Main'], project, env)).code, 0)
    const exec = await runCli(
      'run exec --experiment main --id plain --json --'
        .split(' ')
        .concat([
          process.execPath,
          '-e',
          "console.log('ENV', process.env.WANDB_RUN_GROUP ?? 'none')"
        ]),
      project,
      env
    )
    assert.equal(exec.code, 0, exec.stderr)
    assert.equal(JSON.parse(exec.stdout.trim().split('\n').at(-1)).wandb, undefined)
    const runDirectory = path.join(project, '.aster', 'experiments', 'main', 'runs', 'plain')
    assert.match(await readFile(path.join(runDirectory, 'train.log'), 'utf8'), /ENV none/)
    assert.equal(
      'wandb' in JSON.parse(await readFile(path.join(runDirectory, 'run.json'), 'utf8')),
      false
    )
    assert.deepEqual(await calls(), [])
  })
})
