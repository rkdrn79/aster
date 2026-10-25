import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { updateExperimentBrief } from './research-experiment-brief.mjs'
import { appendLoopNote } from './research-loop-ledger.mjs'
import { researchPreflight } from './research-preflight.mjs'
import { createExperiment, createRun, initializeResearchProject } from './research-project.mjs'
import { listRuns } from './research-project-context.mjs'

async function withExperiment(task) {
  const project = await mkdtemp(path.join(os.tmpdir(), 'aster-preflight-'))
  try {
    await initializeResearchProject(project)
    await createExperiment(project, 'Ablation')
    await task(project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

test('preflight blocks a missing contract and CLI exits nonzero without writing records', async () => {
  await withExperiment(async (project) => {
    const result = await researchPreflight(project, 'ablation')
    assert.equal(result.ready, false)
    assert.deepEqual(
      result.blockers.map((item) => item.id),
      ['brief.missing']
    )
    const command = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, 'cli.mjs'),
        'preflight',
        '--project',
        project,
        '--experiment',
        'ablation',
        '--json'
      ],
      { encoding: 'utf8' }
    )
    assert.equal(command.status, 1)
    assert.equal(JSON.parse(command.stdout).blockers[0].id, 'brief.missing')
    const launch = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, 'cli.mjs'),
        'run',
        'exec',
        '--preflight',
        '--project',
        project,
        '--cwd',
        project,
        '--experiment',
        'ablation',
        '--json',
        '--',
        process.execPath,
        '-e',
        'process.exit(0)'
      ],
      { encoding: 'utf8' }
    )
    assert.equal(launch.status, 1)
    assert.equal(JSON.parse(launch.stdout).error.code, 'preflight_blocked')
    assert.equal((await listRuns(project, { experiment: 'ablation' })).runs.length, 0)
  })
})

test('preflight distinguishes contradictory splits from missing provenance', async () => {
  await withExperiment(async (project) => {
    await updateExperimentBrief(project, 'ablation', {
      question: 'Does r16 improve accuracy?',
      primaryMetric: { name: 'accuracy', split: 'validation', direction: 'maximize' },
      evaluation: { datasetId: 'test-set', split: 'test' }
    })
    const conflict = await researchPreflight(project, 'ablation')
    assert.equal(conflict.ready, false)
    assert(conflict.blockers.some((item) => item.id === 'evaluation.split-conflict'))
    await updateExperimentBrief(project, 'ablation', {
      evaluation: { split: 'validation' }
    })
    const consistent = await researchPreflight(project, 'ablation')
    assert.equal(consistent.ready, true)
    assert(consistent.warnings.some((item) => item.id === 'evaluation.datasetRevision-unknown'))
    assert(consistent.warnings.some((item) => item.id === 'comparison.baseline-missing'))
    const launch = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, 'cli.mjs'),
        'run',
        'exec',
        '--preflight',
        '--project',
        project,
        '--cwd',
        project,
        '--experiment',
        'ablation',
        '--id',
        'seed-42',
        '--json',
        '--',
        process.execPath,
        '-e',
        'process.exit(0)'
      ],
      { encoding: 'utf8' }
    )
    assert.equal(launch.status, 0, launch.stderr)
    assert.equal(
      (await listRuns(project, { experiment: 'ablation' })).runs[0].ref,
      'ablation/seed-42'
    )
  })
})

test('autonomous preflight requires bounded objective and stops at recorded budget', async () => {
  await withExperiment(async (project) => {
    await updateExperimentBrief(project, 'ablation', {
      question: 'Does r16 improve accuracy?',
      primaryMetric: { name: 'accuracy', split: 'val', direction: 'maximize' }
    })
    const missing = await researchPreflight(project, 'ablation', { loop: true })
    assert(missing.blockers.some((item) => item.id === 'loop.objective-missing'))
    const blockedLaunch = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, 'cli.mjs'),
        'run',
        'exec',
        '--loop-preflight',
        '--project',
        project,
        '--cwd',
        project,
        '--experiment',
        'ablation',
        '--json',
        '--',
        process.execPath,
        '-e',
        'process.exit(0)'
      ],
      { encoding: 'utf8' }
    )
    assert.equal(blockedLaunch.status, 1)
    assert.equal(JSON.parse(blockedLaunch.stdout).error.code, 'preflight_blocked')
    assert.equal((await listRuns(project, { experiment: 'ablation' })).runs.length, 0)
    await appendLoopNote(project, {
      experiment: 'ablation',
      kind: 'objective',
      text: 'Test r16',
      data: {
        maxRuns: 1,
        maxHours: 2,
        maxParallel: 1,
        gpuPolicy: 'CPU only',
        stopWhen: 'one Run is done'
      }
    })
    assert.equal((await researchPreflight(project, 'ablation', { loop: true })).ready, true)
    const run = await createRun(project, { experiment: 'ablation', name: 'seed 42', id: 'seed-42' })
    const unnoted = await researchPreflight(project, 'ablation', { loop: true })
    assert(unnoted.blockers.some((item) => item.id === 'loop.unnoted-runs'))
    await appendLoopNote(project, {
      experiment: 'ablation',
      kind: 'run',
      run: run.ref,
      text: 'First attempt'
    })
    for (let index = 0; index < 21; index += 1) {
      await appendLoopNote(project, {
        experiment: 'ablation',
        kind: 'checkpoint',
        text: `Checkpoint ${index + 1}`
      })
    }
    const exhausted = await researchPreflight(project, 'ablation', { loop: true })
    assert.equal(exhausted.ready, false)
    assert(exhausted.blockers.some((item) => item.id === 'loop.budget-exhausted'))
    assert(!exhausted.blockers.some((item) => item.id === 'loop.unnoted-runs'))
  })
})
