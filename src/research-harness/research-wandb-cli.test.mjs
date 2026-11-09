import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { appendFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { wandbRunId } from './research-wandb.mjs'

const cli = path.join(import.meta.dirname, 'cli.mjs')
const hasPython = spawnSync('python3', ['--version'], { stdio: 'ignore' }).status === 0
const skip = hasPython ? false : 'python3 is not installed'

// Never the real service: a stand-in `wandb` that logs calls and keeps each run's summary.
const FAKE_WANDB = `
import json, os
def _write(event):
    with open(os.environ["FAKE_WANDB_LOG"], "a") as handle:
        handle.write(json.dumps(event) + "\\n")
class Settings:
    def __init__(self, **options):
        pass
class _Run:
    def __init__(self, options):
        self.id = options["id"]
        self.url = "https://wandb.example/team/%s/runs/%s" % (options["project"], self.id)
        self.entity = "team"
        self.state = os.path.join(os.environ["FAKE_WANDB_STATE"], self.id)
        self.summary = json.load(open(self.state)) if os.path.exists(self.state) else {}
    def define_metric(self, name, **options):
        pass
    def log(self, payload):
        _write({"call": "log", "payload": payload})
    def finish(self, exit_code=None):
        _write({"call": "finish", "exit_code": exit_code})
        json.dump(self.summary, open(self.state, "w"))
def init(**options):
    _write({"call": "init", "id": options["id"], "name": options["name"]})
    return _Run(options)
`

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

async function project(task) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-wandb-cli-')))
  try {
    await mkdir(path.join(directory, 'fake', 'wandb'), { recursive: true })
    await mkdir(path.join(directory, 'state'))
    await mkdir(path.join(directory, 'project'))
    await writeFile(path.join(directory, 'fake', 'wandb', '__init__.py'), FAKE_WANDB)
    const env = {
      ...process.env,
      PYTHONPATH: path.join(directory, 'fake'),
      FAKE_WANDB_LOG: path.join(directory, 'calls.jsonl'),
      FAKE_WANDB_STATE: path.join(directory, 'state'),
      WANDB_DIR: path.join(directory, 'wandb-dir'),
      WANDB_MODE: 'offline'
    }
    const root = path.join(directory, 'project')
    assert.equal((await runCli(['init'], root, env)).code, 0)
    assert.equal((await runCli(['experiment', '--name', 'Main'], root, env)).code, 0)
    const calls = async () =>
      (await readFile(env.FAKE_WANDB_LOG, 'utf8').catch(() => ''))
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    await task({ root, env, calls })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function enableWandb(root) {
  const file = path.join(root, '.aster', 'project.json')
  const catalog = JSON.parse(await readFile(file, 'utf8'))
  catalog.wandb = { enabled: true, entity: 'team', project: 'demo', python: 'python3' }
  await writeFile(file, JSON.stringify(catalog))
}

test('wandb sync sends a recorded Run and later only its new rows', { skip }, async () => {
  await project(async ({ root, env, calls }) => {
    const recorded = await runCli(
      ['new-run', '--experiment', 'main', '--name', 'Imported', '--id', 'imported'],
      root,
      env
    )
    assert.equal(recorded.code, 0, recorded.stderr)
    const metrics = path.join(root, '.aster', 'experiments', 'main', 'runs', 'imported')
    const row = (step, loss) =>
      `${JSON.stringify({ schemaVersion: 1, runId: 'imported', step, metrics: { loss } })}\n`
    await appendFile(path.join(metrics, 'metrics.jsonl'), row(1, 1) + row(2, 0.5))

    const off = await runCli(['wandb', 'sync', '--run', 'main/imported', '--json'], root, env)
    assert.equal(off.code, 1)
    assert.equal(JSON.parse(off.stdout).error.code, 'wandb_disabled')

    await enableWandb(root)
    const first = await runCli(['wandb', 'sync', '--run', 'main/imported', '--json'], root, env)
    assert.equal(first.code, 0, first.stderr)
    const id = wandbRunId({ project: 'demo', experiment: 'main', run: 'imported' })
    assert.deepEqual(JSON.parse(first.stdout).wandb, {
      entity: 'team',
      project: 'demo',
      group: 'main',
      runId: id,
      url: `https://wandb.example/team/demo/runs/${id}`,
      status: 'synced'
    })
    const manifest = JSON.parse(await readFile(path.join(metrics, 'run.json'), 'utf8'))
    assert.equal(manifest.wandb.status, 'synced')

    await appendFile(path.join(metrics, 'metrics.jsonl'), row(3, 0.25))
    const second = await runCli(['wandb', 'sync', '--run', 'main/imported'], root, env)
    assert.equal(second.code, 0, second.stderr)
    assert.match(second.stdout, /main\/imported → W&B synced https:\/\/wandb\.example/u)
    const logged = (await calls()).filter((call) => call.call === 'log')
    assert.deepEqual(
      logged.map((call) => call.payload.loss),
      [1, 0.5, 0.25]
    )
    assert.deepEqual(
      (await calls()).filter((call) => call.call === 'init').map((call) => call.id),
      [id, id]
    )
    // Why 0: a Run registered without a recorded outcome is not reported to W&B as failed.
    assert.deepEqual(
      (await calls()).filter((call) => call.call === 'finish').map((call) => call.exit_code),
      [0, 0]
    )
  })
})
