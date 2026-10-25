import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { updateExperimentBrief } from './research-experiment-brief.mjs'
import { createExperiment, createRun, initializeResearchProject } from './research-project.mjs'
import { verifyResearch } from './research-verification.mjs'

async function withProject(task) {
  const project = await mkdtemp(path.join(os.tmpdir(), 'aster-verify-'))
  try {
    await initializeResearchProject(project)
    await task(project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

async function completeRun(project) {
  await createExperiment(project, 'Ablation')
  await writeFile(path.join(project, 'config.json'), '{"seed":42}')
  const created = await createRun(project, {
    experiment: 'ablation',
    name: 'seed 42',
    id: 'seed-42',
    config: 'config.json',
    commit: 'a'.repeat(40),
    capturePhase: 'at_launch',
    capturedAt: '2026-10-25T00:00:00.000Z',
    metricDefinitions: ['accuracy:maximize']
  })
  await writeFile(
    created.paths.metrics,
    '{"schemaVersion":1,"runId":"seed-42","step":1,"split":"val","metrics":{"accuracy":0.8}}\n'
  )
  const manifest = JSON.parse(await readFile(created.paths.manifest, 'utf8'))
  manifest.execution = {
    state: 'succeeded',
    reportedBy: 'manifest',
    observedAt: '2026-10-25T00:00:00.000Z',
    exitCode: 0
  }
  manifest.code.dirty = false
  await writeFile(created.paths.manifest, JSON.stringify(manifest))
  await updateExperimentBrief(
    project,
    'ablation',
    {
      question: 'Does this configuration improve validation accuracy?',
      primaryMetric: { name: 'accuracy', split: 'val', direction: 'maximize' },
      baseline: 'ablation/seed-42'
    },
    { by: 'user' }
  )
  return created
}

test('verification distinguishes no evidence, clear checks, and a stopped Run', async () => {
  await withProject(async (project) => {
    const empty = await verifyResearch(project)
    assert.equal(empty.verdict, 'insufficient_evidence')
    const created = await completeRun(project)
    const clear = await verifyResearch(project, { experiment: 'ablation', run: 'seed-42' })
    assert.equal(clear.verdict, 'checks_clear')
    assert.equal(clear.runCount, 1)
    assert.equal(clear.findings.counts.fail, 0)
    assert.equal(clear.executionEvidence[0].reportedBy, 'manifest')
    const manifest = JSON.parse(await readFile(created.paths.manifest, 'utf8'))
    manifest.execution.state = 'unknown'
    await writeFile(created.paths.manifest, JSON.stringify(manifest))
    const unknown = await verifyResearch(project, { experiment: 'ablation' })
    assert.equal(unknown.verdict, 'needs_review')
    assert.deepEqual(
      unknown.unfinished.map((item) => item.run),
      ['ablation/seed-42']
    )
  })
})

test('verification blocks corrupt metrics and reports the source', async () => {
  await withProject(async (project) => {
    const created = await completeRun(project)
    await writeFile(created.paths.metrics, 'not json\n')
    const result = await verifyResearch(project, { experiment: 'ablation' })
    assert.equal(result.verdict, 'blocked')
    assert(result.projectValidation.issues.some((issue) => issue.includes('metrics.jsonl')))
    const command = spawnSync(
      process.execPath,
      [path.join(import.meta.dirname, 'cli.mjs'), 'verify', '--project', project, '--json'],
      { encoding: 'utf8' }
    )
    assert.equal(command.status, 1)
    assert.equal(JSON.parse(command.stdout).verdict, 'blocked')
  })
})

test('verification keeps a missing research question visible even with clean Run files', async () => {
  await withProject(async (project) => {
    await completeRun(project)
    await updateExperimentBrief(project, 'ablation', { question: null }, { by: 'user' })
    const result = await verifyResearch(project, { experiment: 'ablation' })
    assert.equal(result.verdict, 'needs_review')
    assert.deepEqual(result.briefGaps, [{ experiment: 'ablation', missing: ['question'] }])
  })
})

test('an empty Experiment still exposes its missing brief and insufficient evidence', async () => {
  await withProject(async (project) => {
    await createExperiment(project, 'Ablation')
    const result = await verifyResearch(project, { experiment: 'ablation' })
    assert.equal(result.verdict, 'insufficient_evidence')
    assert.deepEqual(result.briefGaps, [{ experiment: 'ablation', missing: ['readable brief'] }])
  })
})

test('Run-scoped verification retains Experiment-wide baseline findings', async () => {
  await withProject(async (project) => {
    await completeRun(project)
    await updateExperimentBrief(project, 'ablation', { baseline: null }, { by: 'user' })
    const result = await verifyResearch(project, { run: 'ablation/seed-42' })
    assert.equal(result.verdict, 'needs_review')
    assert(result.findings.open.some((item) => item.check === 'compare.baseline-missing'))
  })
})

test('user-reported success remains reviewable instead of being treated as observed execution', async () => {
  await withProject(async (project) => {
    const created = await completeRun(project)
    const manifest = JSON.parse(await readFile(created.paths.manifest, 'utf8'))
    manifest.execution.reportedBy = 'user'
    await writeFile(created.paths.manifest, JSON.stringify(manifest))
    const result = await verifyResearch(project, { run: 'ablation/seed-42' })
    assert.equal(result.verdict, 'needs_review')
    assert.equal(result.executionEvidence[0].reportedBy, 'user')
  })
})

test('manuscript verification exposes unbacked number candidates without calling them proven errors', async () => {
  await withProject(async (project) => {
    await completeRun(project)
    await writeFile(
      path.join(project, 'paper', 'main.tex'),
      'Our accuracy was 80.0% on the validation set.\n'
    )
    const result = await verifyResearch(project, { paper: true })
    assert.equal(result.verdict, 'needs_review')
    assert.equal(result.paper.claims.summary.total, 0)
    assert(result.paper.manuscript.unbacked.length > 0)
    assert(result.limitations.some((item) => item.includes('heuristic')))
  })
})
