import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
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
  CODEX_SANDBOX: '',
  CODEX_SANDBOX_NETWORK_DISABLED: '',
  CODEX_MANAGED_BY_NPM: '',
  CODEX_MANAGED_BY_BUN: '',
  GEMINI_CLI: '',
  AI_AGENT: ''
}
const claudeInPane = {
  CLAUDECODE: '1',
  CLAUDE_CODE_SESSION_ID: 'claude-session-7',
  ORCA_PANE_KEY: 'tab-1:00000000-0000-4000-8000-000000000001',
  ORCA_TERMINAL_HANDLE: 'term_abc'
}

function harness(project, args, env = {}) {
  const child = spawn(process.execPath, [cli, ...args, '--project', project, '--json'], {
    cwd: project,
    env: { ...process.env, ...noAgent, ...env },
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

async function ok(project, args, env) {
  const result = await harness(project, args, env)
  assert.equal(result.body.ok, true, JSON.stringify(result.body))
  return result.body
}

async function refused(project, args, code, env) {
  const result = await harness(project, args, env)
  assert.equal(result.code, 1)
  assert.equal(result.body.error.code, code, JSON.stringify(result.body))
}

async function withProject(task) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-proposals-')))
  try {
    await ok(project, ['init'])
    await ok(project, ['experiment', '--name', 'Main'])
    await task(project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const proposeRerun = [
  'proposal',
  'add',
  '--experiment',
  'main',
  '--title',
  'Rerun with lr 1e-4',
  '--rationale',
  'Loss diverged after step 800 at lr 3e-4 (train.log 812-830)',
  '--command',
  'node cli.mjs run exec --experiment main -- python train.py --lr 1e-4',
  '--config-changes',
  '{"lr":"1e-4"}'
]

test('a proposal moves pending → approved → launched and records who did what', async () => {
  await withProject(async (project) => {
    const { ref: base } = await ok(project, ['new-run', '--experiment', 'main', '--name', 'base'])
    const { ref: rerun } = await ok(project, ['new-run', '--experiment', 'main', '--name', 're'])

    const added = await ok(project, [...proposeRerun, '--run', base, '--cwd', '.'], claudeInPane)
    assert.equal(added.proposal.id, 'proposal-1')
    assert.equal(added.proposal.state, 'pending')
    assert.equal(added.proposal.cwd, '.')
    assert.deepEqual(added.proposal.configChanges, { lr: '1e-4' })
    assert.deepEqual(added.proposal.runs, [base])
    assert.equal(added.proposal.agent.provider, 'claude-code')
    assert.equal(added.proposal.agent.paneKey, claudeInPane.ORCA_PANE_KEY)

    await refused(
      project,
      ['proposal', 'launched', '--id', 'proposal-1', '--run', rerun],
      'not_approved'
    )
    await refused(
      project,
      ['proposal', 'decide', '--id', 'proposal-1', '--decision', 'approved', '--by', 'user'],
      'not_allowed',
      claudeInPane
    )

    const approved = await ok(project, [
      'proposal',
      'decide',
      '--id',
      'proposal-1',
      '--decision',
      'approved',
      '--note',
      'go',
      '--by',
      'user'
    ])
    assert.equal(approved.proposal.state, 'approved')
    assert.equal(approved.proposal.decision.by, 'user')
    assert.equal(approved.proposal.decision.note, 'go')
    await refused(
      project,
      ['proposal', 'decide', '--id', 'proposal-1', '--decision', 'rejected', '--by', 'user'],
      'already_decided'
    )

    await refused(
      project,
      ['proposal', 'launched', '--id', 'proposal-1', '--run', 'main/missing'],
      'run_not_found',
      claudeInPane
    )
    const launched = await ok(
      project,
      ['proposal', 'launched', '--id', 'proposal-1', '--run', rerun],
      claudeInPane
    )
    assert.equal(launched.proposal.state, 'launched')
    assert.equal(launched.proposal.launchedRun, rerun)
    await refused(
      project,
      ['proposal', 'launched', '--id', 'proposal-1', '--run', rerun],
      'not_approved'
    )

    const lines = (
      await readFile(path.join(project, '.aster/experiments/main/proposals.jsonl'), 'utf8')
    )
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    assert.deepEqual(
      lines.map((line) => [line.id, line.type]),
      [
        ['proposal-1', 'proposal'],
        ['decision-1', 'decision'],
        ['launch-1', 'launched']
      ]
    )
    assert.equal(lines[2].agent.providerSessionId, 'claude-session-7')

    const listed = await ok(project, ['proposal', 'list', '--experiment', 'main'])
    assert.deepEqual(
      listed.proposals.map((proposal) => [proposal.id, proposal.state, proposal.launchedRun]),
      [['proposal-1', 'launched', rerun]]
    )
    const pending = await ok(project, [
      'proposal',
      'list',
      '--experiment',
      'main',
      '--state',
      'pending'
    ])
    assert.deepEqual(pending.proposals, [])
  })
})

test('decisions are the user’s, rejected proposals never launch, and IDs resolve per Experiment', async () => {
  await withProject(async (project) => {
    await ok(project, ['experiment', '--name', 'Other'])
    const { ref } = await ok(project, ['new-run', '--experiment', 'main', '--name', 'base'])
    await ok(project, proposeRerun)
    await ok(project, [...proposeRerun.slice(0, 3), 'other', ...proposeRerun.slice(4)])

    await refused(
      project,
      ['proposal', 'decide', '--id', 'proposal-1', '--decision', 'approved'],
      'usage'
    )
    await refused(
      project,
      ['proposal', 'decide', '--id', 'proposal-1', '--decision', 'approved', '--by', 'agent'],
      'not_allowed'
    )
    await refused(
      project,
      ['proposal', 'decide', '--id', 'proposal-1', '--decision', 'rejected', '--by', 'user'],
      'ambiguous_proposal'
    )
    const rejected = await ok(project, [
      'proposal',
      'decide',
      '--id',
      'proposal-1',
      '--experiment',
      'main',
      '--decision',
      'rejected',
      '--note',
      'Fix the data split first',
      '--by',
      'user'
    ])
    assert.equal(rejected.proposal.state, 'rejected')
    await refused(
      project,
      ['proposal', 'launched', '--id', 'proposal-1', '--experiment', 'main', '--run', ref],
      'not_approved'
    )
    const other = await ok(project, ['proposal', 'list', '--experiment', 'other'])
    assert.equal(other.proposals[0].state, 'pending')

    await refused(project, [...proposeRerun, '--finding', 'finding-9'], 'not_found')
    await refused(
      project,
      ['proposal', 'decide', '--id', 'proposal-9', '--decision', 'approved', '--by', 'user'],
      'proposal_not_found'
    )
  })
})

test('a needs-code proposal is handed to a Workbench chat by the user, only between approval and launch', async () => {
  await withProject(async (project) => {
    const { ref } = await ok(project, ['new-run', '--experiment', 'main', '--name', 'impl'])
    const needsCode = await ok(project, [...proposeRerun, '--needs-code'], claudeInPane)
    assert.equal(needsCode.proposal.needsCode, true)
    assert.equal(needsCode.proposal.handoff, null)
    const configOnly = await ok(project, proposeRerun)
    assert.equal(configOnly.proposal.needsCode, false)

    const handoff = (id, ...extra) => ['proposal', 'handoff', '--id', id, '--by', 'user', ...extra]
    await refused(project, handoff('proposal-1'), 'not_approved')
    const decide = (id, decision) => [
      'proposal',
      'decide',
      '--id',
      id,
      '--decision',
      decision,
      '--by',
      'user'
    ]
    await ok(project, decide('proposal-1', 'approved'))
    await ok(project, decide('proposal-2', 'rejected'))
    await refused(project, handoff('proposal-2'), 'not_approved')
    await refused(project, handoff('proposal-1'), 'not_allowed', claudeInPane)
    await refused(
      project,
      ['proposal', 'handoff', '--id', 'proposal-1', '--by', 'agent'],
      'not_allowed'
    )

    const first = await ok(project, handoff('proposal-1', '--session', 'session-a'))
    assert.equal(first.proposal.state, 'approved')
    assert.equal(first.proposal.handoff.sessionId, 'session-a')
    await ok(project, handoff('proposal-1', '--experiment', 'main'))
    const listed = await ok(project, ['proposal', 'list', '--experiment', 'main'])
    assert.equal(listed.proposals[0].handoff.sessionId, null)

    await ok(project, ['proposal', 'launched', '--id', 'proposal-1', '--run', ref], claudeInPane)
    await refused(project, handoff('proposal-1'), 'already_launched')

    const lines = (
      await readFile(path.join(project, '.aster/experiments/main/proposals.jsonl'), 'utf8')
    )
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    assert.equal(lines[0].needsCode, true)
    const handoffs = lines.filter((line) => line.type === 'handoff')
    assert.deepEqual(
      handoffs.map(({ id, target, sessionId, by }) => ({ id, target, sessionId, by })),
      [
        { id: 'handoff-1', target: 'proposal-1', sessionId: 'session-a', by: 'user' },
        { id: 'handoff-2', target: 'proposal-1', sessionId: null, by: 'user' }
      ]
    )
  })
})
