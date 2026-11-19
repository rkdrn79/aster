import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  commandGpus,
  estimateGpuHours,
  gpuKey,
  parseQuantity,
  runCostHistory
} from './research-plan-cost.mjs'
import { budgetFit, cutOrder, lossText, rankedCells } from './research-plan-fit.mjs'
import { createExperiment, createRun } from './research-project.mjs'
import { closestPriorView, planCellsView, statedBudget } from './research-plan-view.mjs'

const exemplar = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, 'test-fixtures', 'plans', 'exemplar-ts-aug.json'),
    'utf8'
  )
)

function plan(mutate = () => {}) {
  const copy = structuredClone({ ...exemplar, id: 'ts-aug', revision: 3 })
  mutate(copy)
  return copy
}

const view = (doc, id) => planCellsView(doc).find((cell) => cell.cell === id)

test('priority counts claims, likely reviewer demands and the closest prior method', () => {
  const doc = plan()
  // C1 main comparison + PM1 (missing baseline, high) + InfoTS, the closest prior method.
  const top = view(doc, 'S2.main-B2')
  assert.equal(top.priority.score, 3 + 3 + 2)
  assert.equal(view(doc, 'S2.main-ours').priority.score, 3 + 0.5 + 1)
  assert.deepEqual(top.priority.reasons, ['main claim C1', 'PM1 likely demand', 'closest prior B2'])
  // C3 is secondary: an analysis cell for it counts half.
  assert.equal(view(doc, 'S4.masks').priority.score, 0.5)
  // Sanity cells count as gate inputs even without a claim.
  assert.deepEqual(view(doc, 'S0.overfit-ours').priority, {
    score: 2,
    reasons: ['sanity for the gates']
  })
  assert.equal(rankedCells(doc)[0].cell, 'S2.main-B2')
})

test('a cell whose question serves no claim and no request decides nothing', () => {
  const doc = plan((copy) => {
    copy.questions.push({ id: 'Q9', text: 'Unlinked' })
    copy.matrix.find((cell) => cell.cell === 'S4.masks').question = 'Q9'
  })
  assert.deepEqual(view(doc, 'S4.masks').priority, { score: 0, reasons: [] })
})

test('argued-only claims give no priority', () => {
  const doc = plan((copy) => (copy.claims[2].status = 'argued-only'))
  assert.equal(view(doc, 'S4.masks').priority.score, 0)
})

test('the fit suggests cuts to the plannable share, could first, each with what it loses', () => {
  const doc = plan((copy) => (copy.scope.compute.gpuHours = 300))
  const fit = budgetFit(doc)
  assert.equal(fit.plannableGpuHours, 240)
  assert.equal(Math.round(fit.keptGpuHours * 10) / 10, 350.3)
  assert.equal(fit.suggestions[0].cell, 'S4.masks')
  assert.deepEqual(
    fit.suggestions[0].loses.claims.map((claim) => claim.id),
    ['C3']
  )
  assert.ok(
    fit.suggestions.every((entry) => !['S0.', 'S1.pilot'].some((id) => entry.cell.startsWith(id)))
  )
  const rank = { could: 0, should: 1, must: 2 }
  const tiers = fit.suggestions.map((entry) => rank[entry.tier])
  assert.deepEqual(
    tiers,
    [...tiers].sort((left, right) => left - right)
  )
  assert.ok(fit.fitsAfter)
  assert.ok(fit.afterGpuHours <= 240)
  assert.equal(lossText(fit.suggestions[0].loses), 'C3 left with no experiment')
  const promoted = fit.suggestions.find((entry) => entry.cell === 'S4.cost')
  if (promoted) {
    assert.equal(promoted.tier, 'must', 'a likely demand is cut only as a must cell')
  }
})

test('cuts already made count, and a plan that fits needs none', () => {
  const doc = plan((copy) => (copy.scope.compute.gpuHours = 300))
  const cut = new Set(['S2.main-B3', 'S3.abl-g', 'S3.abl-h'])
  const fit = budgetFit(doc, cut)
  assert.ok(fit.suggestions.every((entry) => !cut.has(entry.cell)))
  assert.deepEqual(budgetFit(plan()).suggestions, [])
  const unknown = budgetFit(plan((copy) => delete copy.scope.compute.gpuHours))
  assert.equal(unknown.plannableGpuHours, null)
  assert.deepEqual(unknown.suggestions, [])
  const assumed = budgetFit(
    plan((copy) => {
      copy.scope.compute.gpuHours = 100
      copy.scope.compute.source = 'assumed'
    })
  )
  assert.deepEqual(assumed.suggestions, [], 'no cuts against a budget the person never gave')
})

test('cut order never offers free cells or the sanity and pilot cells the gates read', () => {
  const order = cutOrder(planCellsView(plan()))
  assert.ok(order.every((cell) => cell.cost > 0))
  assert.ok(!order.some((cell) => ['sanity', 'pilot'].includes(cell.purpose)))
})

test('cutting one arm of a comparison says which comparisons are lost', () => {
  const doc = plan((copy) => (copy.scope.compute.gpuHours = 120))
  const cut = budgetFit(doc).suggestions.find((entry) => entry.cell === 'S2.main-B3')
  assert.deepEqual(cut.loses.comparisons, ['S2.main-ours vs S2.main-B3'])
  assert.match(lossText(cut.loses), /comparison S2\.main-ours vs S2\.main-B3 lost/u)
})

test('GPUs × days the person named count as their budget, with a spare share', () => {
  const budget = statedBudget({ scope: { compute: { gpus: 2, days: 7, source: 'user' } } })
  assert.equal(budget.gpuHours, 336)
  assert.equal(budget.derived, true)
  assert.equal(budget.stated, true)
  assert.equal(budget.reserve, 0.2)
  const tight = statedBudget({
    scope: { compute: { gpuHours: 100, gpus: 2, days: 7, reserve: 0.1, source: 'user' } }
  })
  assert.equal(tight.gpuHours, 100)
  assert.equal(tight.derived, false)
  assert.equal(tight.reserve, 0.1)
})

test('closest prior methods show their baseline or the reason they are not compared', () => {
  const rows = closestPriorView(plan())
  assert.equal(rows.length, 3)
  assert.equal(rows[0].baseline, 'B2')
  assert.equal(rows[0].baselineName, 'InfoTS')
  assert.equal(rows[0].arxiv, '2303.11911')
  assert.equal(rows[2].baseline, null)
  assert.equal(rows[2].reason, 'concurrent work without released code')
})

test('cost estimates from parameters and tokens, or from a measured step time', () => {
  assert.equal(parseQuantity('7B', 'x'), 7e9)
  assert.equal(parseQuantity('350M', 'x'), 3.5e8)
  assert.throws(() => parseQuantity('lots', 'x'), /must be a number/u)
  const train = estimateGpuHours({ params: '7e9', tokens: '1e9', gpu: 'NVIDIA A100 80GB' })
  assert.equal(train.gpuHours, 107)
  assert.match(train.basis, /6 × 7\.00e\+9 params .*\(a100 312 TFLOP\/s × 0\.35 MFU\)/u)
  assert.equal(estimateGpuHours({ stepSeconds: '0.5', steps: '7200', gpus: '4' }).gpuHours, 4)
  assert.throws(() => estimateGpuHours({ params: '1e9' }), /--tokens/u)
  assert.throws(
    () => estimateGpuHours({ params: '1e9', tokens: '1e9', gpu: 'TPU' }),
    /Unknown GPU/u
  )
  assert.equal(gpuKey('RTX A6000'), 'a6000')
  assert.equal(gpuKey('Quadro RTX 8000'), 'rtx8000')
  assert.equal(commandGpus('torchrun --nproc_per_node=4 train.py'), 4)
  assert.equal(commandGpus(['env', 'CUDA_VISIBLE_DEVICES=0,1', 'python', 'x.py']), 2)
  assert.equal(commandGpus('python train.py'), null)
})

test('plan costs reads the project’s timed Runs as GPU-hours', async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'aster-plan-costs-'))
  try {
    await createExperiment(project, 'Main table', { createPaper: false })
    await createRun(
      project,
      {
        experiment: 'Main table',
        name: 'ours seed 0',
        command: ['torchrun', '--nproc_per_node', '4', 'train.py'],
        allowUncommitted: true
      },
      { launch: { durationMs: 2 * 3_600_000 } }
    )
    await createRun(
      project,
      {
        experiment: 'Main table',
        name: 'baseline',
        command: ['python', 'b.py'],
        allowUncommitted: true
      },
      { launch: { durationMs: 3_600_000 } }
    )
    const history = await runCostHistory(project)
    assert.deepEqual(
      history.runs.map((run) => [run.gpus, run.gpusFrom, run.gpuHours]),
      [
        [4, 'command', 8],
        [1, 'assumed', 1]
      ]
    )
    assert.deepEqual(history.experiments, [
      { experiment: 'main-table', runs: 2, medianGpuHours: 4.5, maxGpuHours: 8 }
    ])
  } finally {
    await rm(project, { recursive: true, force: true })
  }
})
