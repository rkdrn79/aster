import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const cli = path.join(import.meta.dirname, 'cli.mjs')
const noAgent = {
  ORCA_AGENT_SESSION_ID: '',
  ORCA_TERMINAL_HANDLE: '',
  ORCA_PANE_KEY: '',
  ORCA_AGENT_PANE: '',
  CLAUDECODE: '',
  CLAUDE_CODE_ENTRYPOINT: '',
  CLAUDE_CODE_SESSION_ID: '',
  CODEX_THREAD_ID: '',
  AI_AGENT: ''
}

function runJson(args, { cwd, env = {} }) {
  const child = spawn(process.execPath, [cli, ...args, '--json'], {
    cwd,
    env: { ...process.env, ...noAgent, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stdout = ''
  child.stdout.on('data', (chunk) => (stdout += chunk))
  return new Promise((resolve) => {
    child.on('close', (code) => resolve({ code, body: JSON.parse(stdout.trim()) }))
  })
}

async function briefProject(task) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-brief-')))
  try {
    const project = path.join(directory, 'project')
    await mkdir(project)
    const run = (args, env) => runJson(args, { cwd: project, env })
    assert.equal((await run(['experiment', '--name', 'Main'])).code, 0)
    assert.equal(
      (await run(['new-run', '--experiment', 'main', '--name', 'Base', '--id', 'base'])).code,
      0
    )
    await writeFile(path.join(project, 'rubric.md'), '# Rubric\n')
    await writeFile(path.join(directory, 'outside.md'), '# Not in the project\n')
    await task({ project, run })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const metadataFile = (project) =>
  path.join(project, '.aster', 'experiments', 'main', 'experiment.json')

test('brief set and show round-trip through experiment.json and keep its other keys', async () => {
  await briefProject(async ({ project, run }) => {
    assert.deepEqual((await run(['brief', 'show', '--experiment', 'main'])).body, {
      ok: true,
      experiment: 'main',
      brief: null
    })
    const metadata = JSON.parse(await readFile(metadataFile(project), 'utf8'))
    await writeFile(metadataFile(project), JSON.stringify({ ...metadata, owner: 'kept' }))

    const set = await run([
      'brief',
      'set',
      '--experiment',
      'main',
      '--question',
      ' Does r16 match full fine-tuning? ',
      '--status',
      'running',
      '--primary-metric',
      'acc:maximize:val',
      '--dataset-id',
      'sst2',
      '--eval-split',
      'val',
      '--baseline',
      'base',
      '--min-seeds',
      '3',
      '--rubric',
      './rubric.md',
      '--triage',
      'auto'
    ])
    assert.equal(set.code, 0)
    const expected = {
      question: 'Does r16 match full fine-tuning?',
      hypothesis: null,
      status: 'running',
      primaryMetric: { name: 'acc', split: 'val', direction: 'maximize' },
      evaluation: {
        datasetId: 'sst2',
        datasetRevision: null,
        split: 'val',
        evaluatorRevision: null
      },
      baseline: 'main/base',
      minSeeds: 3,
      rubric: 'rubric.md',
      agentPolicy: { triage: 'auto', proposals: 'approval' },
      conclusion: null,
      updatedBy: 'user'
    }
    assert.deepEqual(
      { ...set.body.brief, updatedAt: undefined },
      { ...expected, updatedAt: undefined }
    )
    assert.deepEqual(
      (await run(['brief', 'show', '--experiment', 'main'])).body.brief,
      set.body.brief
    )
    const stored = JSON.parse(await readFile(metadataFile(project), 'utf8'))
    assert.equal(stored.owner, 'kept')
    assert.equal(stored.name, 'Main')
    assert.equal(stored.createdAt, metadata.createdAt)

    const cleared = await run(
      [
        'brief',
        'set',
        '--experiment',
        'main',
        '--hypothesis',
        'Within 0.5 pt',
        '--clear',
        'baseline',
        '--clear',
        'eval-split',
        '--clear',
        'agent-policy'
      ],
      { CLAUDECODE: '1' }
    )
    assert.equal(cleared.code, 0)
    assert.equal(cleared.body.brief.question, expected.question)
    assert.equal(cleared.body.brief.hypothesis, 'Within 0.5 pt')
    assert.equal(cleared.body.brief.baseline, null)
    assert.deepEqual(cleared.body.brief.evaluation, { ...expected.evaluation, split: null })
    assert.deepEqual(cleared.body.brief.agentPolicy, { triage: 'suggest', proposals: 'approval' })
    assert.equal(cleared.body.brief.updatedBy, 'agent')

    const byUser = await run(
      ['brief', 'set', '--experiment', 'main', '--status', 'analyzing', '--by', 'user'],
      { CLAUDECODE: '1' }
    )
    assert.equal(byUser.body.brief.updatedBy, 'user')

    const context = await run(['context'])
    assert.equal(context.body.experiments[0].brief.status, 'analyzing')
  })
})

test('brief set refuses invalid values and leaves experiment.json unchanged', async () => {
  await briefProject(async ({ project, run }) => {
    const before = await readFile(metadataFile(project), 'utf8')
    const refusals = [
      [['--status', 'done'], 'invalid_argument'],
      [['--primary-metric', 'acc:higher'], 'invalid_argument'],
      [['--min-seeds', '0'], 'invalid_argument'],
      [['--min-seeds', '21'], 'invalid_argument'],
      [['--baseline', 'main/missing'], 'run_not_found'],
      [['--rubric', '../outside.md'], 'invalid_argument'],
      [['--rubric', 'missing.md'], 'not_found'],
      [['--question', 'x'.repeat(4001)], 'invalid_argument'],
      [['--eval-split', 'val'], 'invalid_argument'],
      [['--triage', 'always'], 'invalid_argument'],
      [['--baseline', 'base', '--clear', 'baseline'], 'usage'],
      [['--clear', 'everything'], 'invalid_argument'],
      [['--question', 'Q', '--by', 'robot'], 'invalid_argument'],
      [[], 'usage']
    ]
    for (const [args, code] of refusals) {
      const result = await run(['brief', 'set', '--experiment', 'main', ...args])
      assert.equal(result.code, 1, args.join(' '))
      assert.equal(result.body.error.code, code, args.join(' '))
    }
    assert.equal(await readFile(metadataFile(project), 'utf8'), before)
    const missing = await run(['brief', 'show', '--experiment', 'other'])
    assert.equal(missing.body.error.code, 'experiment_not_found')
  })
})
