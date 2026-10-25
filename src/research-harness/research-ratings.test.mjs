import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createExperiment, createRun, initializeResearchProject } from './research-project.mjs'

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
  CODEX_SANDBOX: '',
  CODEX_SANDBOX_NETWORK_DISABLED: '',
  CODEX_MANAGED_BY_NPM: '',
  CODEX_MANAGED_BY_BUN: '',
  GEMINI_CLI: '',
  AI_AGENT: ''
}
const claudeAgent = { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'session-7' }
const rubricText = '# Rubric\nPrefer faithful, complete answers.\n'

function harness(project, args, { env = {}, json = true } = {}) {
  const child = spawn(
    process.execPath,
    [cli, ...args, '--project', project, ...(json ? ['--json'] : [])],
    { env: { ...process.env, ...noAgent, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }
  )
  let stdout = ''
  child.stdout.on('data', (chunk) => (stdout += chunk))
  return new Promise((resolve) => {
    child.on('close', (code) => resolve({ code, stdout, body: json ? JSON.parse(stdout) : null }))
  })
}

async function rate(project, args, options) {
  const result = await harness(project, ['rate', ...args], options)
  assert.equal(result.code, 0, result.stdout)
  return result.body
}

async function refused(project, args, code, options) {
  const result = await harness(project, ['rate', ...args], options)
  assert.equal(result.code, 1, result.stdout)
  assert.equal(result.body.error.code, code, result.body.error.message)
}

async function fixtureProject(task) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-ratings-')))
  try {
    await initializeResearchProject(project)
    await createExperiment(project, 'Main')
    const outputs = (ids) =>
      ids.map((id) => `${JSON.stringify({ sampleId: id, output: `answer ${id}` })}\n`).join('')
    for (const id of ['a', 'b', 'c']) {
      const run = await createRun(project, { experiment: 'main', name: `run ${id}`, id })
      if (id !== 'c') {
        await writeFile(path.join(run.paths.run, 'outputs.jsonl'), outputs(['s-1', 's-2', 's-3']))
      }
    }
    await writeFile(path.join(project, '.aster/experiments/main/rubric.md'), rubricText)
    await task(project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const pair = ['--experiment', 'main', '--run', 'main/a', '--against', 'main/b']

test('ratings round-trip; the latest per unordered pair wins and reversed pairs are normalized', async () => {
  await fixtureProject(async (project) => {
    const first = await rate(project, [
      'add',
      ...pair,
      '--sample',
      's-1',
      '--verdict',
      'a',
      '--blind',
      '--tag',
      'Format',
      '--note',
      'A is complete'
    ])
    assert.equal(first.ledger, '.aster/experiments/main/ratings.jsonl')
    assert.deepEqual(
      { ...first.rating, at: null },
      {
        schemaVersion: 1,
        id: 'rating-1',
        at: null,
        sampleId: 's-1',
        mode: 'pairwise',
        run: 'main/a',
        against: 'main/b',
        verdict: 'a',
        tags: ['format'],
        note: 'A is complete',
        by: 'user',
        blind: true,
        rubric: null,
        judge: null
      }
    )
    // Stored reversed: b over a is the same judgment as "a loses".
    await rate(project, [
      'add',
      '--experiment',
      'main',
      '--run',
      'main/b',
      '--against',
      'main/a',
      '--sample',
      's-1',
      '--verdict',
      'a'
    ])
    await rate(project, [
      'add',
      '--experiment',
      'main',
      '--run',
      'a',
      '--sample',
      's-2',
      '--verdict',
      'good'
    ])

    const fromA = await rate(project, ['list', ...pair])
    assert.deepEqual(
      fromA.ratings.map((rating) => [rating.id, rating.run, rating.against, rating.verdict]),
      [['rating-2', 'main/a', 'main/b', 'b']]
    )
    const fromB = await rate(project, ['list', '--experiment', 'main', '--run', 'main/b'])
    assert.deepEqual(
      fromB.ratings.map((rating) => [rating.id, rating.run, rating.verdict]),
      [['rating-2', 'main/b', 'a']]
    )
    const all = await rate(project, ['list', '--experiment', 'main'])
    assert.deepEqual(
      all.ratings.map((rating) => rating.id),
      ['rating-2', 'rating-3']
    )

    const summary = await rate(project, ['summary', ...pair])
    assert.deepEqual(summary.pairwise, { wins: 0, losses: 1, ties: 0, n: 1 })
    assert.deepEqual(summary.single, { good: 1, bad: 0, unsure: 0, n: 1 })
    assert.equal(summary.bySource.agent.pairwise.n, 0)
    const text = await harness(project, ['rate', 'summary', ...pair], { json: false })
    assert.match(text.stdout, /0 wins · 0 ties · 1 losses \(n=1\) · small sample/)
  })
})

test('agent judgments stay separate from people and their agreement is counted per sample', async () => {
  await fixtureProject(async (project) => {
    await rate(project, ['add', ...pair, '--sample', 's-1', '--verdict', 'b'])
    await rate(project, ['add', ...pair, '--sample', 's-2', '--verdict', 'tie'])
    const judged = await rate(
      project,
      [
        'add',
        ...pair,
        '--sample',
        's-1',
        '--verdict',
        'b',
        '--judge-model',
        'model-1',
        '--rubric',
        '.aster/experiments/main/rubric.md',
        '--tag',
        'hallucination'
      ],
      { env: claudeAgent }
    )
    assert.equal(judged.rating.by, 'agent')
    assert.deepEqual(judged.rating.judge, {
      provider: 'claude-code',
      model: 'model-1',
      promptSha256: null
    })
    assert.deepEqual(judged.rating.rubric, {
      path: '.aster/experiments/main/rubric.md',
      sha256: createHash('sha256').update(rubricText).digest('hex')
    })
    assert.equal(judged.rating.agent.providerSessionId, 'session-7')
    await rate(
      project,
      ['add', ...pair, '--sample', 's-2', '--verdict', 'a', '--judge-model', 'model-2'],
      { env: claudeAgent }
    )
    await rate(
      project,
      ['add', ...pair, '--sample', 's-3', '--verdict', 'a', '--judge-model', 'model-2'],
      { env: claudeAgent }
    )

    const people = await rate(project, ['list', ...pair, '--by', 'user'])
    assert.deepEqual(
      people.ratings.map((rating) => [rating.sampleId, rating.verdict]),
      [
        ['s-1', 'b'],
        ['s-2', 'tie']
      ]
    )
    const summary = await rate(project, [
      'summary',
      '--experiment',
      'main',
      '--run',
      'main/b',
      '--against',
      'main/a'
    ])
    assert.deepEqual(summary.bySource.user.pairwise, { wins: 1, losses: 0, ties: 1, n: 2 })
    assert.deepEqual(summary.bySource.agent.pairwise, { wins: 1, losses: 2, ties: 0, n: 3 })
    assert.deepEqual(summary.pairwise, { wins: 2, losses: 2, ties: 1, n: 5 })
    // s-1 both say b wins; s-2 the person says tie, the agent a; s-3 has no person.
    assert.deepEqual(summary.agreement, { overlap: 2, agreeing: 1, rate: 0.5 })
    assert.equal(summary.judges.length, 2)
    assert.deepEqual(summary.judges[0], {
      provider: 'claude-code',
      model: 'model-2',
      promptSha256: null,
      rubricSha256: null,
      n: 2
    })
    assert.equal(summary.judgeMixed, true)
    assert.deepEqual(summary.tags, { hallucination: 1 })
  })
})

test('rate add refuses judgments the files or the rater do not support', async () => {
  await fixtureProject(async (project) => {
    const single = ['add', '--experiment', 'main', '--run', 'main/a', '--sample', 's-1']
    await refused(project, [...single, '--verdict', 'a'], 'invalid_argument')
    await refused(
      project,
      ['add', ...pair, '--sample', 's-1', '--verdict', 'good'],
      'invalid_argument'
    )
    await refused(project, [...single, '--verdict', 'good', '--blind'], 'usage')
    await refused(
      project,
      ['add', '--experiment', 'main', '--run', 'main/a', '--sample', 's-9', '--verdict', 'bad'],
      'sample_not_found'
    )
    // c has no outputs.jsonl, so only a's file is checked.
    await rate(project, [
      'add',
      '--experiment',
      'main',
      '--run',
      'main/c',
      '--sample',
      's-9',
      '--verdict',
      'bad'
    ])
    await refused(
      project,
      [
        'add',
        '--experiment',
        'main',
        '--run',
        'main/c',
        '--against',
        'main/a',
        '--sample',
        's-9',
        '--verdict',
        'tie'
      ],
      'sample_not_found'
    )
    await refused(
      project,
      ['add', '--experiment', 'main', '--run', 'main/zz', '--sample', 's-1', '--verdict', 'good'],
      'run_not_found'
    )
    await refused(
      project,
      [...single, '--verdict', 'good', '--tag', 'x'.repeat(41)],
      'invalid_argument'
    )
    await refused(
      project,
      [
        ...single,
        '--verdict',
        'good',
        ...Array.from({ length: 9 }, (_, index) => ['--tag', `t${index}`]).flat()
      ],
      'invalid_argument'
    )
    await refused(
      project,
      [...single, '--verdict', 'good', '--judge-model', 'm', '--by', 'user'],
      'usage'
    )
    await refused(project, [...single, '--verdict', 'good'], 'missing_judge', { env: claudeAgent })
    await refused(
      project,
      [...single, '--verdict', 'good', '--by', 'user'],
      'user_rating_from_agent',
      {
        env: claudeAgent
      }
    )
    const judge = [...single, '--verdict', 'good', '--by', 'agent', '--judge-model', 'm']
    await refused(project, [...judge, '--rubric', '../outside.md'], 'invalid_argument')
    await refused(project, [...judge, '--rubric', 'research/missing.md'], 'not_found')
    await refused(project, [...judge, '--judge-prompt-sha', 'abc'], 'invalid_argument')
    const listed = await rate(project, ['list', '--experiment', 'main'])
    assert.equal(listed.ratings.length, 1)
  })
})
