import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readCatalog } from './research-catalog.mjs'
import { createExperiment, createRun, initializeResearchProject } from './research-project.mjs'
import { validateResearchProject } from './research-validation.mjs'

async function temporaryProject(task) {
  const project = await mkdtemp(path.join(os.tmpdir(), 'aster-research-harness-'))
  try {
    await task(project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

test('initialization preserves manuscript edits and repeated Experiment setup', async () => {
  await temporaryProject(async (project) => {
    await initializeResearchProject(project)
    const manuscript = path.join(project, 'paper', 'main.tex')
    await writeFile(manuscript, 'my manuscript')
    const second = await initializeResearchProject(project)
    assert.equal(second.status.manuscriptSource, 'existing')
    assert.equal(await readFile(manuscript, 'utf8'), 'my manuscript')
    const firstExperiment = await createExperiment(project, 'LoRA r16')
    const secondExperiment = await createExperiment(project, 'LoRA r16')
    assert.equal(firstExperiment.slug, 'lora-r16')
    assert.equal(secondExperiment.status, 'existing')
    assert.equal((await readCatalog(project)).experiments.length, 1)
  })
})

test('an app-created Experiment leaves the manuscript to an explicit choice', async () => {
  await temporaryProject(async (project) => {
    await createExperiment(project, 'Baseline', { createPaper: false })
    assert(!existsSync(path.join(project, 'paper')))
    assert.equal((await validateResearchProject(project)).issues.length, 0)
  })
})

test('fresh research folders survive Git tracking without adding reference PDFs', async () => {
  await temporaryProject(async (project) => {
    execFileSync('git', ['init', '-q', project])
    await createExperiment(project, 'Baseline')
    await writeFile(path.join(project, '.aster', 'library', 'papers', 'reference.pdf'), 'pdf')
    execFileSync('git', ['add', '.aster', 'paper'], { cwd: project })
    const tracked = execFileSync('git', ['ls-files'], { cwd: project, encoding: 'utf8' })
    for (const marker of [
      '.aster/experiments/.gitkeep',
      '.aster/experiments/baseline/runs/.gitkeep',
      '.aster/experiments/baseline/analysis/.gitkeep',
      '.aster/library/papers/.gitkeep'
    ]) {
      assert(tracked.split('\n').includes(marker), `${marker} should survive a clone`)
    }
    assert(!tracked.includes('reference.pdf'))
    assert.equal((await validateResearchProject(project)).issues.length, 0)
  })
})

test('a Run has an exclusive directory, valid Attach paths, and unknown execution', async () => {
  await temporaryProject(async (project) => {
    await createExperiment(project, 'Ablation')
    await writeFile(path.join(project, 'training.json'), '{"seed":42}')
    const result = await createRun(project, {
      experiment: 'ablation',
      name: 'seed 42',
      id: 'seed-42',
      config: 'training.json',
      command: 'python train.py --config training.json',
      commit: 'a'.repeat(40),
      capturePhase: 'at_attach',
      capturedAt: '2026-10-23T00:00:00Z',
      datasetId: 'eval-set'
    })
    const manifest = JSON.parse(await readFile(result.paths.manifest, 'utf8'))
    assert.equal(manifest.externalRunId, 'seed-42')
    assert.equal(manifest.metrics.path, 'metrics.jsonl')
    assert.equal(manifest.execution, undefined)
    assert.equal(manifest.code.capturePhase, 'at_attach')
    assert.equal(await readFile(result.paths.config, 'utf8'), '{"seed":42}')
    await writeFile(
      result.paths.metrics,
      '{"schemaVersion":1,"runId":"seed-42","step":1,"metrics":{"loss":0}}\n'
    )
    assert.deepEqual((await validateResearchProject(project)).issues, [])
    assert.equal((await validateResearchProject(project)).metricRows, 1)
    const catalog = await readCatalog(project)
    assert.equal(
      catalog.experiments[0].runs[0].manifest,
      '.aster/experiments/ablation/runs/seed-42/run.json'
    )
    await assert.rejects(
      createRun(project, { experiment: 'ablation', name: 'other', id: 'seed-42' }),
      { code: 'EEXIST' }
    )
    assert.equal(
      await readFile(result.paths.metrics, 'utf8'),
      '{"schemaVersion":1,"runId":"seed-42","step":1,"metrics":{"loss":0}}\n'
    )
  })
})

test('unsafe paths, conflicting slugs, and symlinked research root fail closed', async () => {
  await temporaryProject(async (project) => {
    await assert.rejects(createExperiment(project, '../outside'), /cannot contain/)
    await createExperiment(project, 'LoRA r16')
    await assert.rejects(createExperiment(project, 'LoRA-r16'), /already belongs/)
    await assert.rejects(
      createRun(project, { experiment: 'lora-r16', name: 'escape', id: '../escape' }),
      /Run ID/
    )
    await assert.rejects(
      createRun(project, {
        experiment: 'lora-r16',
        name: 'unproven launch',
        capturePhase: 'at_launch',
        commit: 'a'.repeat(40)
      }),
      /requires both --commit and --captured-at/
    )
    const outside = await mkdtemp(path.join(os.tmpdir(), 'aster-research-outside-'))
    try {
      await writeFile(path.join(outside, 'config.json'), '{}')
      await assert.rejects(
        createRun(project, {
          experiment: 'lora-r16',
          name: 'escape',
          config: path.join(outside, 'config.json')
        }),
        /inside the selected project/
      )
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
  await temporaryProject(async (project) => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'aster-research-outside-'))
    try {
      await symlink(outside, path.join(project, '.aster'), 'dir')
      await assert.rejects(initializeResearchProject(project), /symlink/)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
})

test('validator reports mismatched metric IDs and unreadable Run folders', async () => {
  await temporaryProject(async (project) => {
    await createExperiment(project, 'Baseline')
    const result = await createRun(project, { experiment: 'baseline', name: 'first', id: 'first' })
    await writeFile(
      result.paths.metrics,
      '{"schemaVersion":1,"runId":"another","metrics":{"accuracy":0.9}}\n'
    )
    await mkdir(path.join(project, '.aster', 'experiments', 'baseline', 'runs', 'orphan'))
    const validation = await validateResearchProject(project)
    assert(validation.issues.some((issue) => issue.includes('matching runId')))
    assert(validation.issues.some((issue) => issue.includes('runs/orphan/run.json')))
  })
})
