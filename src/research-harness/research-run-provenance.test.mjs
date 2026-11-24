import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createExperiment, createRun } from './research-project.mjs'
import { runAttempts } from './research-run-attempts.mjs'

const cli = path.join(import.meta.dirname, 'cli.mjs')
const quietAgent = { CLAUDECODE: '', CODEX_THREAD_ID: '', ORCA_AGENT_SESSION_ID: '', AI_AGENT: '' }

function runCli(args, cwd, env = {}) {
  const end = args.includes('--') ? args.indexOf('--') : args.length
  const flagged = [...args.slice(0, end), '--json', ...args.slice(end)]
  const child = spawn(process.execPath, [cli, ...flagged], {
    cwd,
    env: { ...process.env, ...quietAgent, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stdout = ''
  child.stdout.on('data', (chunk) => (stdout += chunk))
  return new Promise((resolve) => {
    child.on('close', (code) =>
      resolve({ code, body: JSON.parse(stdout.trim().split('\n').at(-1)) })
    )
  })
}

function git(directory, ...args) {
  return execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim()
}

function gitRepository(directory, file, content) {
  git(directory, 'init', '-q')
  git(directory, 'config', 'user.email', 'harness@example.com')
  git(directory, 'config', 'user.name', 'Harness Test')
  return writeFile(path.join(directory, file), content).then(() => {
    git(directory, 'add', file)
    git(directory, 'commit', '-qm', file)
    return git(directory, 'rev-parse', 'HEAD')
  })
}

/** The 3D-LeWAM shape: a project repository with an ignored upstream checkout in third_party. */
async function nestedProject(task) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-provenance-')))
  try {
    await writeFile(path.join(project, '.gitignore'), '/third_party/lewam/\n')
    const projectCommit = await gitRepository(project, 'train.cfg', 'lr = 1\n')
    const upstream = path.join(project, 'third_party', 'lewam')
    await mkdir(upstream, { recursive: true })
    const upstreamCommit = await gitRepository(upstream, 'eval.py', 'print(1)\n')
    await createExperiment(project, 'lewam reproduction')
    await task({ project, upstream, projectCommit, upstreamCommit })
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

async function manifestOf(project, ref) {
  const [experiment, run] = ref.split('/')
  const file = path.join(project, '.aster', 'experiments', experiment, 'runs', run, 'run.json')
  return { file, manifest: JSON.parse(await readFile(file, 'utf8')) }
}

test('run exec in a nested repository records the project commit and lists the nested one', async () => {
  await nestedProject(async ({ project, upstream, projectCommit, upstreamCommit }) => {
    await writeFile(path.join(project, 'train.cfg'), 'lr = 2\n')
    const result = await runCli(
      ['run', 'exec', '--experiment', 'lewam-reproduction', '--id', 'in-nested', '--', 'true'],
      upstream
    )
    assert.equal(result.code, 0)
    const { manifest } = await manifestOf(project, 'lewam-reproduction/in-nested')
    assert.equal(manifest.code.commit, projectCommit)
    assert.equal(manifest.code.dirty, true)
    assert.equal(manifest.code.patch, 'code.patch')
    assert.deepEqual(manifest.code.nested, [
      { path: 'third_party/lewam', commit: upstreamCommit, dirty: false }
    ])
    const patch = await readFile(
      path.join(path.dirname((await manifestOf(project, result.body.ref)).file), 'code.patch'),
      'utf8'
    )
    assert.match(patch, /^\+lr = 2$/mu)
    assert.match(patch, /# nested repository: third_party\/lewam at [0-9a-f]{40}/u)

    const atRoot = await runCli(
      ['run', 'exec', '--experiment', 'lewam-reproduction', '--id', 'at-root', '--', 'true'],
      project
    )
    assert.deepEqual((await manifestOf(project, atRoot.body.ref)).manifest.code.nested, [])
    const checked = await runCli(['check'], project)
    assert.deepEqual(
      checked.body.findings.filter((item) => item.check === 'repro.code-not-project'),
      []
    )
  })
})

test('check flags Runs whose recorded commit is a nested repository or unknown here', async () => {
  await nestedProject(async ({ project, upstream, upstreamCommit }) => {
    await runCli(
      ['run', 'exec', '--experiment', 'lewam-reproduction', '--id', 'old-nested', '--', 'true'],
      upstream
    )
    await runCli(
      ['run', 'exec', '--experiment', 'lewam-reproduction', '--id', 'old-elsewhere', '--', 'true'],
      project
    )
    // Rewrite both the way the old capture recorded them on another cluster.
    for (const [ref, cwd, commit] of [
      [
        'lewam-reproduction/old-nested',
        '/data/projects/me/3D-LeWAM/third_party/lewam',
        upstreamCommit
      ],
      ['lewam-reproduction/old-elsewhere', '/data/projects/me/3D-LeWAM', 'f'.repeat(40)]
    ]) {
      const { file, manifest } = await manifestOf(project, ref)
      delete manifest.code.nested
      manifest.code = { ...manifest.code, commit, dirty: false, patch: null }
      manifest.launch = { ...manifest.launch, cwd }
      await writeFile(file, JSON.stringify(manifest))
    }
    const { body } = await runCli(['check'], project)
    const flagged = body.findings.filter((item) => item.check === 'repro.code-not-project')
    assert.deepEqual(flagged.map((item) => item.runs).sort(), [
      ['lewam-reproduction/old-elsewhere'],
      ['lewam-reproduction/old-nested']
    ])
    const nested = flagged.find((item) => item.runs[0].endsWith('old-nested'))
    assert.equal(
      nested.id,
      'rule:repro.code-not-project:lewam-reproduction:nested:third_party/lewam'
    )
    assert.match(nested.text, /^1 Run launched inside the nested repository third_party\/lewam/u)
    assert.equal(flagged[0].severity, 'warn')
  })
})

async function writeRun(project, id, { name, state, startedAt, host, cwd, observedAt, splits }) {
  const { paths } = await createRun(project, { experiment: 'lewam-reproduction', name, id })
  const manifest = JSON.parse(await readFile(paths.manifest, 'utf8'))
  manifest.execution = {
    state,
    reportedBy: 'manifest',
    observedAt: observedAt ?? startedAt,
    exitCode: state === 'failed' ? 1 : state === 'succeeded' ? 0 : null
  }
  manifest.launch = { startedAt, host: host ?? os.hostname(), cwd: cwd ?? project, by: 'manual' }
  await writeFile(paths.manifest, JSON.stringify(manifest))
  const rows = (splits ?? ['test']).map((split) =>
    JSON.stringify({ schemaVersion: 1, step: 1, split, metrics: { success_rate: 84 } })
  )
  await writeFile(paths.metrics, `${rows.join('\n')}\n`)
}

test('a failed attempt with a later success is superseded, and seed splits are linted', async () => {
  await nestedProject(async ({ project }) => {
    const name = 'tworoom grad seed 42'
    await writeRun(project, 's42-a', { name, state: 'failed', startedAt: '2026-11-19T16:28:34Z' })
    await writeRun(project, 's42-b', {
      name,
      state: 'cancelled',
      startedAt: '2026-11-19T16:54:54Z'
    })
    await writeRun(project, 's42-c', {
      name,
      state: 'succeeded',
      startedAt: '2026-11-19T17:14:24Z'
    })
    await writeRun(project, 'lone', {
      name: 'lone',
      state: 'failed',
      startedAt: '2026-11-19T17:00:00Z'
    })
    await writeRun(project, 'eval', {
      name: 'eval parity',
      state: 'succeeded',
      startedAt: '2026-11-19T18:00:00Z',
      splits: ['seed42', 'seed1', 'test']
    })
    const { body } = await runCli(['check'], project)
    const by = (check) =>
      body.findings
        .filter((item) => item.check === check)
        .map((item) => item.runs.join(' '))
        .sort()
    assert.deepEqual(by('run.superseded'), [
      'lewam-reproduction/s42-a lewam-reproduction/s42-c',
      'lewam-reproduction/s42-b lewam-reproduction/s42-c'
    ])
    assert.deepEqual(by('run.failed'), ['lewam-reproduction/lone'])
    assert.deepEqual(by('run.seed-split'), ['lewam-reproduction/eval'])
    const seed = body.findings.find((item) => item.check === 'run.seed-split')
    assert.match(seed.text, /seed42, seed1/u)
    assert.equal(body.findings.find((item) => item.check === 'run.superseded').severity, 'info')
  })
})

test('a Run recorded on another host with its folder missing here is foreign, not stale', async () => {
  await nestedProject(async ({ project }) => {
    const lastSeen = new Date(Date.now() - 62 * 3_600_000).toISOString()
    await writeRun(project, 'remote', {
      name: 'A_tokens seed 42',
      state: 'running',
      startedAt: lastSeen,
      observedAt: lastSeen,
      host: 'node05',
      cwd: '/data/projects/nowhere/3D-LeWAM'
    })
    await writeRun(project, 'shared', {
      name: 'shared fs',
      state: 'running',
      startedAt: lastSeen,
      observedAt: lastSeen,
      host: 'node03',
      cwd: project
    })
    const { body } = await runCli(['check'], project)
    const foreign = body.findings.filter((item) => item.check === 'run.foreign-host')
    assert.deepEqual(
      foreign.map((item) => item.runs[0]),
      ['lewam-reproduction/remote']
    )
    assert.match(foreign[0].text, /^Recorded on node05; .* last seen running 62 h 0 min ago$/u)
    const stale = body.findings.filter((item) => item.check === 'run.stale')
    assert.deepEqual(
      stale.map((item) => item.runs[0]),
      ['lewam-reproduction/shared']
    )
    const listed = await runCli(['run', 'list'], project)
    const remote = listed.body.runs.find((run) => run.id === 'remote')
    assert.equal(remote.recordedOn, 'node05')
  })
})

test('attempts are numbered by launch time among Runs that share a name', () => {
  const run = (ref, name, startedAt, state = 'failed') => ({
    ref,
    state,
    manifest: { name, launch: { startedAt } }
  })
  const attempts = runAttempts([
    run('e/b', 'seed 0', '2026-11-19T17:00:00Z', 'succeeded'),
    run('e/a', 'seed 0', '2026-11-19T16:00:00Z'),
    run('e/c', 'seed 1', '2026-11-19T16:00:00Z')
  ])
  assert.deepEqual(Object.fromEntries(attempts), {
    'e/a': { attempt: 1, of: 2, succeededLater: 'e/b' },
    'e/b': { attempt: 2, of: 2, succeededLater: null }
  })
})

test('run exec inside a SLURM job records the job it ran in', async () => {
  await nestedProject(async ({ project }) => {
    const slurm = {
      SLURM_JOB_ID: '4242',
      SLURMD_NODENAME: 'node05',
      SLURM_CLUSTER_NAME: 'cluster-master',
      SLURM_SUBMIT_HOST: 'login01'
    }
    const inJob = await runCli(
      ['run', 'exec', '--experiment', 'lewam-reproduction', '--id', 'in-job', '--', 'true'],
      project,
      slurm
    )
    const { manifest } = await manifestOf(project, inJob.body.ref)
    assert.deepEqual(
      { ...manifest.job, observedAt: undefined },
      {
        scheduler: 'slurm',
        jobId: '4242',
        host: 'cluster-master',
        cluster: 'cluster-master',
        node: 'node05',
        submitHost: 'login01',
        state: 'running',
        observedAt: undefined,
        recordedBy: 'aster-harness'
      }
    )
    assert.equal(manifest.job.observedAt, manifest.launch.startedAt)
    const outside = await runCli(
      ['run', 'exec', '--experiment', 'lewam-reproduction', '--id', 'no-job', '--', 'true'],
      project,
      { SLURM_JOB_ID: '', SLURM_JOBID: '' }
    )
    assert.equal((await manifestOf(project, outside.body.ref)).manifest.job, undefined)
  })
})
