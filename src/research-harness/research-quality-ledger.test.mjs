import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createExperiment, createRun } from './research-project.mjs'
import {
  addFinding,
  applyFindingStatuses,
  listFindings,
  readQualityLedger,
  setFindingStatus
} from './research-quality-ledger.mjs'

const cli = path.join(import.meta.dirname, 'cli.mjs')
const logLines = Array.from({ length: 50 }, (_, index) => `step ${index + 1} loss 0.${index}`)

function metricRows(runId, events) {
  return events
    .map((event) => `${JSON.stringify({ schemaVersion: 1, runId, ...event })}\n`)
    .join('')
}

async function fixtureProject(task) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-quality-')))
  try {
    await createExperiment(project, 'Main')
    const seed = await createRun(project, { experiment: 'main', name: 'seed 1', id: 'seed-1' })
    const other = await createRun(project, { experiment: 'main', name: 'seed 2', id: 'seed-2' })
    await writeFile(
      seed.paths.metrics,
      metricRows('seed-1', [
        { step: 100, split: 'val', metrics: { acc: 0.81 } },
        { step: 200, split: 'val', metrics: { acc: 0.8812 } },
        { step: 200, split: 'train', metrics: { acc: 0.99 } }
      ])
    )
    await writeFile(other.paths.metrics, metricRows('seed-2', [{ step: 1, metrics: { loss: 1 } }]))
    await writeFile(seed.paths.log, `${logLines.join('\n')}\n`)
    await writeFile(
      path.join(path.dirname(seed.paths.metrics), 'outputs.jsonl'),
      ['{"sampleId":"s-001","output":"a"}', '{"sampleId":"s-002","output":"b"}', ''].join('\n')
    )
    await writeFile(
      path.join(project, '.aster', 'experiments', 'main', 'analysis', 'notes.md'),
      'one\ntwo\nthree\n'
    )
    await writeFile(
      path.join(project, '.aster', 'claims.json'),
      JSON.stringify({ schemaVersion: 1, claims: [{ id: 'claim-1', text: 'x', evidence: [] }] })
    )
    await task(project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

function agentFinding(overrides = {}) {
  return {
    experiment: 'main',
    check: 'eval.overfit',
    severity: 'warn',
    text: 'Train accuracy runs far above validation',
    runs: ['main/seed-1'],
    createdBy: 'agent',
    evidence: [{ kind: 'metric', run: 'main/seed-1', metric: 'acc', split: 'val', step: 200 }],
    ...overrides
  }
}

test('agent findings record harness-read evidence and round-trip through status changes', async () => {
  await fixtureProject(async (project) => {
    const { finding, ledger } = await addFinding(
      project,
      agentFinding({
        layer: 'output',
        samples: ['s-002'],
        evidence: [
          { kind: 'metric', run: 'seed-1', metric: 'acc', split: 'val' },
          {
            kind: 'metric',
            run: 'main/seed-1',
            metric: 'acc',
            split: 'val',
            step: 100,
            value: 0.81
          },
          { kind: 'log', run: 'main/seed-1', fromLine: 3, toLine: 4 },
          { kind: 'file', path: '.aster/experiments/main/analysis/notes.md', line: 3 },
          { kind: 'manifest', run: 'main/seed-1', field: 'code.capturePhase' },
          { kind: 'sample', run: 'main/seed-1', sampleId: 's-001' },
          { kind: 'claim', claim: 'claim-1' }
        ]
      })
    )
    assert.equal(ledger, '.aster/experiments/main/quality.jsonl')
    assert.equal(finding.id, 'finding-1')
    assert.equal(finding.source, 'agent')
    assert.equal(finding.status, 'open')
    assert.deepEqual(finding.evidence, [
      { kind: 'metric', run: 'main/seed-1', metric: 'acc', split: 'val', step: 200, value: 0.8812 },
      { kind: 'metric', run: 'main/seed-1', metric: 'acc', split: 'val', step: 100, value: 0.81 },
      {
        kind: 'log',
        run: 'main/seed-1',
        fromLine: 3,
        toLine: 4,
        excerpt: 'step 3 loss 0.2\nstep 4 loss 0.3'
      },
      { kind: 'file', path: '.aster/experiments/main/analysis/notes.md', line: 3 },
      { kind: 'manifest', run: 'main/seed-1', field: 'code.capturePhase', value: 'unknown' },
      { kind: 'sample', run: 'main/seed-1', sampleId: 's-001' },
      { kind: 'claim', claim: 'claim-1' }
    ])
    const note = await addFinding(project, {
      experiment: 'main',
      check: 'note',
      severity: 'info',
      text: 'Check the tokenizer version',
      runs: ['main/seed-2'],
      createdBy: 'user'
    })
    assert.equal(note.finding.id, 'finding-2')

    const recorded = { experiment: 'main', includeRules: false }
    assert.deepEqual(
      (await listFindings(project, recorded)).findings.map((item) => item.id),
      ['finding-1', 'finding-2']
    )
    assert.deepEqual(
      (await listFindings(project, { ...recorded, run: 'seed-2' })).findings.map((item) => item.id),
      ['finding-2']
    )
    const dismissed = await setFindingStatus(project, {
      id: 'finding-1',
      status: 'dismissed',
      note: 'expected for this dataset',
      by: 'user'
    })
    assert.equal(dismissed.experiment, 'main')
    assert.equal(dismissed.entry.id, 'status-1')
    assert.deepEqual(
      (await listFindings(project, recorded)).findings.map((item) => item.id),
      ['finding-2']
    )
    const [first] = (await listFindings(project, { ...recorded, status: 'all' })).findings
    assert.equal(first.status, 'dismissed')
    assert.equal(first.statusNote, 'expected for this dataset')
    assert.equal(first.statusBy, 'user')

    await setFindingStatus(project, { id: 'finding-1', status: 'open', note: null, by: 'user' })
    await setFindingStatus(project, {
      experiment: 'main',
      id: 'finding-1',
      status: 'resolved',
      note: 'fixed in main/seed-2',
      by: 'agent'
    })
    const [resolved] = (await listFindings(project, { ...recorded, status: 'resolved' })).findings
    assert.equal(resolved.id, 'finding-1')
    assert.equal(resolved.statusBy, 'agent')
  })
})

test('addFinding refuses findings the project files do not support', async () => {
  await fixtureProject(async (project) => {
    const refusals = [
      [{ evidence: [] }, 'missing_evidence'],
      [{ runs: ['main/missing'] }, 'run_not_found'],
      [{ evidence: [{ kind: 'metric', run: 'main/nope', metric: 'acc' }] }, 'run_not_found'],
      [
        {
          evidence: [
            { kind: 'metric', run: 'main/seed-1', metric: 'acc', split: 'val', value: 0.9 }
          ]
        },
        'value_mismatch'
      ],
      [{ evidence: [{ kind: 'metric', run: 'main/seed-1', metric: 'acc' }] }, 'invalid_evidence'],
      [
        {
          evidence: [{ kind: 'metric', run: 'main/seed-1', metric: 'acc', split: 'val', step: 7 }]
        },
        'invalid_evidence'
      ],
      [
        { evidence: [{ kind: 'log', run: 'main/seed-1', fromLine: 49, toLine: 51 }] },
        'invalid_evidence'
      ],
      [
        { evidence: [{ kind: 'log', run: 'main/seed-1', fromLine: 1, toLine: 41 }] },
        'invalid_evidence'
      ],
      [{ evidence: [{ kind: 'file', path: '../outside.txt' }] }, 'invalid_evidence'],
      [{ evidence: [{ kind: 'file', path: '/etc/hosts' }] }, 'invalid_evidence'],
      [
        {
          evidence: [{ kind: 'file', path: '.aster/experiments/main/analysis/notes.md', line: 4 }]
        },
        'invalid_evidence'
      ],
      [
        { evidence: [{ kind: 'manifest', run: 'main/seed-1', field: 'execution.exitCode' }] },
        'invalid_evidence'
      ],
      [
        {
          evidence: [
            { kind: 'manifest', run: 'main/seed-1', field: 'code.capturePhase', value: 'at_launch' }
          ]
        },
        'value_mismatch'
      ],
      [
        { evidence: [{ kind: 'sample', run: 'main/seed-1', sampleId: 's-404' }] },
        'invalid_evidence'
      ],
      [{ samples: ['s-404'] }, 'invalid_evidence'],
      [{ evidence: [{ kind: 'claim', claim: 'claim-9' }] }, 'invalid_evidence'],
      [{ evidence: [{ kind: 'guess' }] }, 'invalid_evidence'],
      [{ check: 'Bad Check' }, 'invalid_argument'],
      [{ severity: 'critical' }, 'invalid_argument'],
      [{ text: ' ' }, 'invalid_argument'],
      [{ experiment: 'other' }, 'experiment_not_found']
    ]
    for (const [overrides, code] of refusals) {
      await assert.rejects(addFinding(project, agentFinding(overrides)), { code }, code)
    }
    // A Run without outputs.jsonl cannot be checked, so its sample IDs are taken as given.
    const unchecked = await addFinding(
      project,
      agentFinding({ evidence: [{ kind: 'sample', run: 'main/seed-2', sampleId: 'any' }] })
    )
    assert.equal(unchecked.finding.evidence[0].sampleId, 'any')
    assert.equal((await readQualityLedger(project, 'main')).findings.length, 1)
  })
})

test('only the user accepts, dismisses, reopens, or changes rule findings', async () => {
  await fixtureProject(async (project) => {
    await addFinding(project, agentFinding())
    const ruleId = 'rule:run.failed:main/seed-1'
    for (const status of ['accepted', 'dismissed', 'open']) {
      await assert.rejects(
        setFindingStatus(project, { id: 'finding-1', status, note: 'x', by: 'agent' }),
        { code: 'forbidden' }
      )
    }
    await assert.rejects(
      setFindingStatus(project, { id: 'finding-1', status: 'resolved', by: 'agent' }),
      { code: 'usage' }
    )
    await assert.rejects(
      setFindingStatus(project, { id: ruleId, status: 'resolved', note: 'rerun', by: 'agent' }),
      { code: 'forbidden' }
    )
    await assert.rejects(
      setFindingStatus(project, { id: 'finding-7', status: 'accepted', by: 'user' }),
      { code: 'finding_not_found' }
    )
    await assert.rejects(setFindingStatus(project, { id: 'rule:', status: 'open', by: 'user' }), {
      code: 'invalid_argument'
    })
    assert.equal((await readQualityLedger(project, 'main')).statuses.length, 0)
  })
})

test('status entries for rule findings apply by their deterministic ID, latest first', async () => {
  await fixtureProject(async (project) => {
    const ruleId = 'rule:run.failed:main/seed-1'
    const ruleFinding = {
      id: ruleId,
      source: 'rule',
      check: 'run.failed',
      layer: 'integrity',
      severity: 'fail',
      status: 'open',
      experiment: 'main',
      runs: ['main/seed-1'],
      samples: [],
      text: 'Exited with code 1',
      evidence: [],
      createdAt: '2026-10-24T00:00:00.000Z',
      agent: null,
      statusNote: null,
      statusAt: null,
      statusBy: null
    }
    await setFindingStatus(project, { id: ruleId, status: 'accepted', note: null, by: 'user' })
    const dismissed = await setFindingStatus(project, {
      id: ruleId,
      status: 'dismissed',
      note: 'OOM on a shared node',
      by: 'user'
    })
    assert.equal(dismissed.experiment, 'main')
    const { statuses } = await readQualityLedger(project, 'main')
    const [applied] = applyFindingStatuses([ruleFinding], statuses)
    assert.equal(applied.status, 'dismissed')
    assert.equal(applied.statusNote, 'OOM on a shared node')
    assert.equal(applied.statusBy, 'user')
    const untouched = { ...ruleFinding, id: 'rule:run.failed:main/seed-2' }
    assert.equal(applyFindingStatuses([untouched], statuses)[0].status, 'open')
  })
})

function runCli(args, { cwd, env }) {
  const child = spawn(process.execPath, [cli, ...args, '--json'], {
    cwd,
    env: {
      ...process.env,
      CLAUDECODE: '',
      CLAUDE_CODE_ENTRYPOINT: '',
      CLAUDE_CODE_SESSION_ID: '',
      AI_AGENT: '',
      ORCA_AGENT_SESSION_ID: '',
      ...env
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stdout = ''
  child.stdout.on('data', (chunk) => (stdout += chunk))
  return new Promise((resolve) => {
    child.on('close', (code) => resolve({ code, body: JSON.parse(stdout.trim()) }))
  })
}

test('quality CLI records agent findings and refuses an agent acting as the user', async () => {
  await fixtureProject(async (project) => {
    const agent = { cwd: project, env: { CLAUDECODE: '1' } }
    const added = await runCli(
      [
        'quality',
        'add',
        '--experiment',
        'main',
        '--check',
        'run.loss-spike',
        '--severity',
        'warn',
        '--text',
        'Loss spikes at step 4',
        '--run',
        'main/seed-1',
        '--evidence',
        '{"kind":"log","run":"main/seed-1","fromLine":4,"toLine":4}'
      ],
      agent
    )
    assert.equal(added.code, 0)
    assert.equal(added.body.finding.source, 'agent')
    assert.equal(added.body.finding.agent.provider, 'claude-code')
    assert.equal(added.body.finding.evidence[0].excerpt, 'step 4 loss 0.3')
    const impersonated = await runCli(
      ['quality', 'resolve', '--id', 'finding-1', '--status', 'dismissed', '--by', 'user'],
      agent
    )
    assert.equal(impersonated.body.error.code, 'forbidden')
    const listed = await runCli(['quality', 'list', '--experiment', 'main', '--no-rules'], {
      cwd: project,
      env: {}
    })
    assert.deepEqual(
      listed.body.findings.map((item) => [item.id, item.status]),
      [['finding-1', 'open']]
    )
    const ledger = await readFile(path.join(project, '.aster/experiments/main/quality.jsonl'))
    assert.equal(ledger.toString().trim().split('\n').length, 1)
  })
})
