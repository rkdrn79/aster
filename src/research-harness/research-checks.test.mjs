import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { addClaim } from './research-claims.mjs'
import { updateExperimentBrief } from './research-experiment-brief.mjs'
import { createExperiment, createRun } from './research-project.mjs'

const cli = path.join(import.meta.dirname, 'cli.mjs')
const commit = 'a'.repeat(40)
const evaluation = {
  datasetId: 'sst2',
  datasetRevision: 'r1',
  split: 'val',
  evaluatorRevision: 'e1'
}

function check(project, args = []) {
  const child = spawn(process.execPath, [cli, 'check', ...args, '--json'], {
    cwd: project,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stdout = ''
  child.stdout.on('data', (chunk) => (stdout += chunk))
  return new Promise((resolve) => {
    child.on('close', (code) => resolve({ code, body: JSON.parse(stdout.trim()) }))
  })
}

function exitedPid() {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' })
  return new Promise((resolve) => child.on('close', () => resolve(child.pid)))
}

const metricRows = (rows) =>
  rows.map((row) => `${JSON.stringify({ schemaVersion: 1, ...row })}\n`).join('')

/** A Run that every check accepts unless `options` breaks something. */
async function addRun(project, experiment, id, options = {}) {
  const configFile = path.join(project, 'configs', `${id}.json`)
  if (options.config !== null) {
    await writeFile(configFile, JSON.stringify(options.config ?? { lr: 0.1, train: { seed: id } }))
  }
  const created = await createRun(project, {
    experiment,
    name: id,
    id,
    commit,
    capturePhase: 'at_launch',
    capturedAt: '2026-10-01T00:00:00.000Z',
    metricDefinitions: ['acc:maximize:%'],
    ...(options.config === null ? {} : { config: path.relative(project, configFile) }),
    ...(options.evaluation ?? evaluation)
  })
  const { paths } = created
  await writeFile(
    paths.metrics,
    metricRows(
      options.metrics ?? [
        { step: 50, split: 'val', metrics: { acc: 0.8 } },
        { step: 100, split: 'val', metrics: { acc: 0.85 } }
      ]
    ) + (options.badMetricRow ? 'not json\n' : '')
  )
  await writeFile(paths.log, options.log ?? 'epoch 1\nepoch 2\n')
  if (options.outputs !== null) {
    await writeFile(
      path.join(paths.run, 'outputs.jsonl'),
      (options.outputs ?? ['s1', 's2'])
        .map((sampleId) => `${JSON.stringify({ sampleId })}\n`)
        .join('')
    )
  }
  const manifest = JSON.parse(await readFile(paths.manifest, 'utf8'))
  manifest.execution = {
    state: 'succeeded',
    reportedBy: 'manifest',
    observedAt: new Date().toISOString(),
    exitCode: 0
  }
  manifest.code.dirty = false
  manifest.metrics.definitions.acc.aggregation = 'mean'
  options.edit?.(manifest)
  await writeFile(paths.manifest, JSON.stringify(manifest))
  return created
}

async function fixtureProject(task) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-checks-')))
  try {
    await createExperiment(project, 'Main')
    await createExperiment(project, 'Aux')
    await mkdir(path.join(project, 'configs'))
    await addRun(project, 'main', 'base', { config: { lr: 0.1, train: { seed: 1 } } })
    await addRun(project, 'main', 'clean', { config: { lr: 0.1, train: { seed: 2 } } })
    await addRun(project, 'main', 'drift', {
      config: { lr: 0.2, Seed: 3 },
      evaluation: { ...evaluation, split: 'test' },
      metrics: [{ step: 50, split: 'val', metrics: { acc: 0.9 } }],
      outputs: ['s1', 's3'],
      edit: (manifest) => {
        manifest.code = { ...manifest.code, dirty: true, patch: 'code.patch', patchTruncated: true }
      }
    })
    const lines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`)
    lines[4] = 'ASTER_METRIC {"step": 5, "split": "val", "metrics": {"loss": NaN}}'
    await addRun(project, 'main', 'crashed', {
      config: null,
      outputs: null,
      badMetricRow: true,
      log: `${lines.join('\n')}\n`,
      edit: (manifest) => {
        manifest.execution = { ...manifest.execution, state: 'failed', exitCode: 1 }
        manifest.launch = { durationMs: 180_000 }
        manifest.code = { capturePhase: 'unknown', commit: null }
      }
    })
    await addRun(project, 'main', 'empty', { metrics: [], outputs: null })
    await addRun(project, 'main', 'lossonly', {
      metrics: [{ step: 100, split: 'val', metrics: { loss: 0.3 } }],
      outputs: null,
      edit: (manifest) => {
        delete manifest.evaluation
      }
    })
    const pid = await exitedPid()
    await addRun(project, 'main', 'gone', {
      outputs: null,
      edit: (manifest) => {
        manifest.execution.state = 'running'
        manifest.launch = { by: 'aster-harness', host: os.hostname(), harnessPid: pid, pid }
      }
    })
    await addRun(project, 'main', 'quiet', {
      outputs: null,
      edit: (manifest) => {
        manifest.execution.state = 'running'
        manifest.execution.observedAt = new Date(Date.now() - 3_600_000).toISOString()
      }
    })
    await addRun(project, 'aux', 'only', {})
    await updateExperimentBrief(
      project,
      'main',
      {
        primaryMetric: { name: 'acc', split: 'val', direction: 'maximize' },
        baseline: 'main/base',
        minSeeds: 2
      },
      { by: 'user' }
    )
    await updateExperimentBrief(project, 'aux', { question: 'Does aux help?' }, { by: 'user' })
    // The template manuscript does not state 0.9, so the claims audit reports a mismatch.
    await addClaim(project, {
      text: 'Drift reaches 0.9',
      evidence: { run: 'main/drift', metric: 'acc', split: 'val' }
    })
    await task(project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

test('check reports each rule with file evidence and stays quiet on a clean Run', async () => {
  await fixtureProject(async (project) => {
    const { code, body } = await check(project)
    assert.equal(code, 1)
    const byId = new Map(body.findings.map((item) => [item.id, item]))
    const expected = [
      'rule:run.failed:main/crashed',
      'rule:run.non-finite:main/crashed',
      'rule:repro.commit-unknown:main/crashed',
      'rule:repro.capture-not-at-launch:main/crashed',
      'rule:repro.config-missing:main/crashed',
      'rule:run.harness-exited:main/gone',
      'rule:run.stale:main/quiet',
      'rule:run.no-metrics:main/empty',
      'rule:run.primary-metric-missing:main/lossonly',
      'rule:compare.condition-unknown:main/lossonly',
      'rule:compare.condition-mismatch:main/drift',
      'rule:compare.step-mismatch:main/drift',
      'rule:output.sample-mismatch:main/drift',
      'rule:repro.patch-truncated:main/drift',
      'rule:stats.too-few-seeds:main/drift',
      'rule:compare.baseline-missing:aux',
      'rule:claims.mismatch:claim:claim-1'
    ]
    for (const id of expected) {
      assert.ok(byId.has(id), `missing ${id}`)
      assert.equal(byId.get(id).status, 'open')
      assert.equal(byId.get(id).source, 'rule')
    }
    assert.deepEqual(
      body.findings.filter((item) => item.runs.includes('main/clean')),
      []
    )
    assert.ok(!byId.has('rule:run.stale:main/gone'))

    const failed = byId.get('rule:run.failed:main/crashed')
    assert.equal(failed.severity, 'fail')
    assert.equal(failed.text, 'Exited with code 1 after 3 min')
    assert.deepEqual(failed.evidence.slice(0, 2), [
      { kind: 'manifest', run: 'main/crashed', field: 'execution.state', value: 'failed' },
      { kind: 'manifest', run: 'main/crashed', field: 'execution.exitCode', value: 1 }
    ])
    const tail = failed.evidence.find((item) => item.kind === 'log')
    assert.equal(tail.fromLine, 11)
    assert.equal(tail.toLine, 30)
    assert.ok(tail.excerpt.startsWith('line 11\n') && tail.excerpt.endsWith('line 30'))

    const nonFinite = byId.get('rule:run.non-finite:main/crashed')
    const nanLine = nonFinite.evidence.find((item) => item.kind === 'log')
    assert.equal(nanLine.fromLine, 5)
    assert.match(nanLine.excerpt, /NaN/)
    assert.ok(nonFinite.evidence.some((item) => item.kind === 'file'))

    const mismatch = byId.get('rule:compare.condition-mismatch:main/drift')
    assert.deepEqual(mismatch.runs, ['main/drift', 'main/base'])
    assert.deepEqual(mismatch.evidence, [
      { kind: 'manifest', run: 'main/drift', field: 'evaluation.split', value: 'test' },
      { kind: 'manifest', run: 'main/base', field: 'evaluation.split', value: 'val' }
    ])
    assert.deepEqual(byId.get('rule:compare.step-mismatch:main/drift').evidence, [
      { kind: 'metric', run: 'main/drift', metric: 'acc', split: 'val', step: 50, value: 0.9 },
      { kind: 'metric', run: 'main/base', metric: 'acc', split: 'val', step: 100, value: 0.85 }
    ])
    assert.deepEqual(byId.get('rule:output.sample-mismatch:main/drift').samples, ['s2', 's3'])
    assert.deepEqual(byId.get('rule:stats.too-few-seeds:main/drift').runs, ['main/drift'])
    assert.equal(byId.get('rule:claims.mismatch:claim:claim-1').experiment, 'main')

    const clean = await check(project, ['--run', 'main/clean'])
    assert.equal(clean.code, 0)
    assert.deepEqual(clean.body.findings, [])
    const aux = await check(project, ['--experiment', 'aux'])
    assert.equal(aux.code, 0)
    assert.deepEqual(
      aux.body.findings.map((item) => item.id),
      ['rule:compare.baseline-missing:aux']
    )
  })
})
