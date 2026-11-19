// Derived views of a plan, shared by the CLI, the checks and Aster's Plan view: effective tiers
// (likely reviewer demands promoted to must), each cell's priority (the claims it supports and the
// reviewer requests it answers), tier totals against the stated compute, the claims × experiments
// coverage, the run order, and what a set of cuts costs in evidence.

import { reviewCategory } from './research-plan-reviewers.mjs'
import {
  TIERS,
  cellCost,
  cellTier,
  claimQuestions,
  finiteNumber,
  hasText,
  list,
  textList
} from './research-plan-schema.mjs'

const LIKELY = new Set(['high', 'medium'])
/** What a cell is worth to a claim, by what it does: the main comparison counts most. */
const CLAIM_WEIGHT = { main: 3, heldout: 3, generality: 3, ablation: 2, sensitivity: 1.5 }
const SUPPORT_WEIGHT = { sanity: 2, pilot: 2, 'judge-validation': 2, tuning: 1, cost: 1 }
const REQUEST_WEIGHT = { high: 2, medium: 1, low: 0.5 }
const MAX_REQUEST_SCORE = 4
const CLOSEST_PRIOR_SCORE = 2
/** The method's own arm of a comparison: cutting it loses every comparison it anchors. */
const COMPARISON_SCORE = 1

function ids(value) {
  return Array.isArray(value) ? textList(value) : hasText(value) ? [value] : []
}

/** The matrix cells an item ID stands for (a cell, ablation, baseline, dataset, question…). */
export function itemCells(plan, itemId) {
  const cells = list(plan.matrix)
  if (cells.some((cell) => cell.cell === itemId)) {
    return [itemId]
  }
  const found = new Set()
  const add = (cellIds) => cellIds.forEach((id) => found.add(id))
  for (const ablation of list(plan.ablations).filter((entry) => entry.id === itemId)) {
    add(ids(ablation.cells))
  }
  for (const baseline of list(plan.baselines).filter((entry) => entry.id === itemId)) {
    add(ids(baseline.cells))
    add(ids(baseline.reproduce?.cell))
  }
  for (const entry of [...list(plan.costMeasurements), ...list(plan.analysis)]) {
    if (entry.id === itemId) {
      add([...ids(entry.cells), ...ids(entry.cell)])
    }
  }
  for (const cell of cells) {
    const factors =
      cell.factors && typeof cell.factors === 'object' ? Object.values(cell.factors) : []
    if (
      cell.question === itemId ||
      cell.ablation === itemId ||
      cell.analysis === itemId ||
      factors.includes(itemId)
    ) {
      found.add(cell.cell)
    }
  }
  for (const claim of list(plan.claims).filter((entry) => entry.id === itemId)) {
    const questionIds = new Set(claimQuestions(plan, claim).map((question) => question.id))
    cells.filter((cell) => questionIds.has(cell.question)).forEach((cell) => found.add(cell.cell))
  }
  return [...found]
}

export function premortemRequests(plan) {
  return list(plan.premortem?.requests)
}

/** Requests whose plan items stand for the cell, so cutting it leaves them unanswered. */
function requestCells(plan, request) {
  const resolution = request.resolution
  if (!resolution || !['plan', 'ask'].includes(resolution.as)) {
    return []
  }
  return [...new Set(ids(resolution.items).flatMap((item) => itemCells(plan, item)))]
}

/** A likely request in a protected category: its cells are `must` whatever the agent wrote. */
export function isLikelyDemand(request) {
  return LIKELY.has(request.likelihood) && reviewCategory(request.category)?.protected === true
}

/** Baseline IDs that stand for a closest prior method (role or `baselineSearch.closest`). */
export function closestBaselineIds(plan) {
  return new Set([
    ...list(plan.baselines)
      .filter((baseline) => baseline.role === 'closest-prior')
      .map((baseline) => baseline.id),
    ...list(plan.baselineSearch?.closest)
      .map((entry) => entry.baseline)
      .filter(hasText)
  ])
}

function round(value) {
  return Math.round(value * 10) / 10
}

/**
 * How much a cell changes what the paper can say: the best of its claim support (main claims
 * count fully, secondary ones half) and its role as a gate input, plus the reviewer requests it
 * answers (a likely demand counts most), and bonuses for anchoring comparisons and for running a
 * closest prior method. Zero means it decides nothing.
 */
function cellPriority(cell, claims, answers, closest) {
  const reasons = []
  const live = claims.filter((claim) => claim.status !== 'argued-only')
  const main = live.filter((claim) => claim.weight !== 'secondary')
  const weight = CLAIM_WEIGHT[cell.purpose] ?? 1
  let claimScore = 0
  if (main.length) {
    claimScore = weight
    reasons.push(`main claim ${main.map((claim) => claim.id).join(', ')}`)
  } else if (live.length) {
    claimScore = weight / 2
    reasons.push(`secondary claim ${live.map((claim) => claim.id).join(', ')}`)
  }
  const supportScore = SUPPORT_WEIGHT[cell.purpose] ?? 0
  if (supportScore && supportScore >= claimScore) {
    reasons.push(`${cell.purpose} for the gates`)
  }
  let requestScore = 0
  for (const request of answers) {
    const likely = isLikelyDemand(request)
    requestScore += likely ? 3 : (REQUEST_WEIGHT[request.likelihood] ?? 1)
    reasons.push(
      `${request.id}${likely ? ' likely demand' : hasText(request.likelihood) ? ` ${request.likelihood}` : ''}`
    )
  }
  const compared = textList(cell.compareTo).length
  if (compared) {
    reasons.push(`compared with ${compared} cell${compared === 1 ? '' : 's'}`)
  }
  const factors =
    cell.factors && typeof cell.factors === 'object' ? Object.values(cell.factors) : []
  const prior = factors.filter((value) => typeof value === 'string' && closest.has(value))
  if (prior.length) {
    reasons.push(`closest prior ${prior.join(', ')}`)
  }
  const score =
    Math.max(claimScore, supportScore) +
    Math.min(MAX_REQUEST_SCORE, requestScore) +
    (compared ? COMPARISON_SCORE : 0) +
    (prior.length ? CLOSEST_PRIOR_SCORE : 0)
  return { score: round(score), reasons }
}

/** Every matrix cell with its cost, claims, effective tier, priority and the requests it answers. */
export function planCellsView(plan) {
  const requests = premortemRequests(plan)
  const byCell = new Map()
  for (const request of requests) {
    for (const cellId of requestCells(plan, request)) {
      byCell.set(cellId, [...(byCell.get(cellId) ?? []), request])
    }
  }
  const claimsOf = new Map()
  for (const claim of list(plan.claims)) {
    for (const question of claimQuestions(plan, claim)) {
      claimsOf.set(question.id, [...(claimsOf.get(question.id) ?? []), claim])
    }
  }
  const closest = closestBaselineIds(plan)
  return list(plan.matrix).map((cell) => {
    const answers = byCell.get(cell.cell) ?? []
    const promotedBy = answers.filter(isLikelyDemand).map((request) => request.id)
    const tier = cellTier(cell)
    const claims = claimsOf.get(cell.question) ?? []
    return {
      cell: cell.cell,
      stage: hasText(cell.stage) ? cell.stage : null,
      question: hasText(cell.question) ? cell.question : null,
      purpose: cell.purpose,
      tier,
      effectiveTier: promotedBy.length ? 'must' : tier,
      promotedBy: tier === 'must' ? [] : promotedBy,
      cost: cellCost(cell),
      costSource: hasText(cell.cost?.source) ? cell.cost.source : null,
      seeds: Number.isInteger(cell.seeds) ? cell.seeds : 1,
      claims: claims.map((claim) => claim.id),
      requests: answers.map((request) => request.id),
      priority: cellPriority(cell, claims, answers, closest),
      expect: hasText(cell.expect) ? cell.expect : null,
      command: hasText(cell.command) ? cell.command : null,
      needsCode: cell.needsCode === true,
      cutReason: hasText(cell.cutReason) ? cell.cutReason : null,
      factors: cell.factors && typeof cell.factors === 'object' ? cell.factors : {}
    }
  })
}

export const DEFAULT_RESERVE = 0.2

/**
 * The compute the plan is held to. GPUs × days the person gave count as their GPU-hours (a
 * ceiling, so a share is kept spare for reruns and debugging: `reserve`, 20% unless stated).
 */
export function statedBudget(plan) {
  const compute = plan.scope?.compute ?? {}
  const gpus = finiteNumber(compute.gpus)
  const days = finiteNumber(compute.days ?? compute.wallclockDays)
  const given = finiteNumber(compute.gpuHours)
  const derived = given === null && gpus !== null && days !== null
  const gpuHours = derived ? gpus * days * 24 : given
  const source = hasText(compute.source) ? compute.source : gpuHours === null ? 'unknown' : null
  const reserve = finiteNumber(compute.reserve)
  return {
    gpuHours,
    source,
    stated: gpuHours !== null && (source === 'user' || source === 'compute-policy'),
    hardware: hasText(compute.hardware) ? compute.hardware : null,
    wallclockDays: days,
    gpus,
    derived,
    reserve: reserve !== null && reserve >= 0 && reserve <= 0.5 ? reserve : DEFAULT_RESERVE
  }
}

/**
 * Cumulative tier totals (must, must + should, everything) over the cells not cut, against the
 * stated compute. A tier fits when its cumulative total is within the stated GPU-hours.
 */
export function tierTotals(plan, cut = new Set()) {
  const cells = planCellsView(plan).filter((cell) => !cut.has(cell.cell))
  const budget = statedBudget(plan)
  let running = 0
  const tiers = TIERS.map((tier) => {
    const own = cells.filter((cell) => cell.effectiveTier === tier)
    const hours = own.reduce((sum, cell) => sum + (cell.cost ?? 0), 0)
    running += hours
    return {
      tier,
      cells: own.map((cell) => cell.cell),
      gpuHours: hours,
      cumulativeGpuHours: running,
      uncosted: own.filter((cell) => cell.cost === null).map((cell) => cell.cell),
      fits: budget.gpuHours === null ? null : running <= budget.gpuHours + 1e-9
    }
  })
  return { budget, tiers, totalGpuHours: running }
}

/** Claims as rows, questions (one Experiment each) as columns, with the cells in each pair. */
export function coverageMatrix(plan, cut = new Set()) {
  const cells = planCellsView(plan)
  const questions = list(plan.questions).map((question) => ({
    id: question.id,
    text: hasText(question.text) ? question.text : '',
    experiment: hasText(question.experiment) ? question.experiment : null
  }))
  const claims = list(plan.claims).map((claim) => {
    const linked = new Set(claimQuestions(plan, claim).map((question) => question.id))
    const entries = questions
      .filter((question) => linked.has(question.id))
      .map((question) => {
        const own = cells.filter((cell) => cell.question === question.id)
        return {
          question: question.id,
          cells: own.map((cell) => cell.cell),
          included: own.filter((cell) => !cut.has(cell.cell)).map((cell) => cell.cell)
        }
      })
    const planned = entries.reduce((sum, entry) => sum + entry.cells.length, 0)
    const kept = entries.reduce((sum, entry) => sum + entry.included.length, 0)
    const status =
      claim.status === 'argued-only'
        ? 'argued-only'
        : planned === 0
          ? 'no-experiment'
          : kept === 0
            ? 'cut'
            : 'covered'
    return {
      id: claim.id,
      text: hasText(claim.text) ? claim.text : '',
      weight: claim.weight === 'secondary' ? 'secondary' : 'main',
      kind: hasText(claim.kind) ? claim.kind : null,
      status,
      entries
    }
  })
  return { questions, claims }
}

/** Stages in plan order with their kept cells and costs; flags a stage dearer than the next. */
export function runOrder(plan, cut = new Set()) {
  const cells = planCellsView(plan).filter((cell) => !cut.has(cell.cell))
  let cumulative = 0
  const stages = list(plan.stages).map((stage) => {
    const own = cells.filter((cell) => cell.stage === stage.id)
    const gpuHours = own.reduce((sum, cell) => sum + (cell.cost ?? 0), 0)
    cumulative += gpuHours
    return {
      id: stage.id,
      name: hasText(stage.name) ? stage.name : stage.id,
      gate: hasText(stage.gate) ? stage.gate : null,
      budgetGpuHours: finiteNumber(stage.budgetGpuHours),
      cells: own.map((cell) => cell.cell),
      purposes: [...new Set(own.map((cell) => cell.purpose))],
      gpuHours,
      cumulativeGpuHours: cumulative
    }
  })
  const unstaged = cells.filter((cell) => !stages.some((stage) => stage.id === cell.stage))
  return { stages, unstaged: unstaged.map((cell) => cell.cell) }
}

/** What cutting `cut` loses: claims left with no kept cell, and requests left unanswered. */
export function cutConsequences(plan, cut = new Set()) {
  const coverage = coverageMatrix(plan, cut)
  const claims = coverage.claims
    .filter((claim) => claim.status === 'cut')
    .map((claim) => ({ id: claim.id, text: claim.text, weight: claim.weight }))
  const weakened = coverage.claims
    .filter(
      (claim) =>
        claim.status === 'covered' &&
        claim.entries.some((entry) => entry.cells.length && !entry.included.length)
    )
    .map((claim) => ({ id: claim.id, text: claim.text, weight: claim.weight }))
  const requests = premortemRequests(plan)
    .map((request) => ({ request, cells: requestCells(plan, request) }))
    .filter(({ cells }) => cells.length && cells.every((cell) => cut.has(cell)))
    .map(({ request }) => ({
      id: request.id,
      request: request.request,
      category: request.category ?? null,
      likelihood: request.likelihood ?? null,
      likelyDemand: isLikelyDemand(request)
    }))
  return { claims, weakened, requests }
}

/** Pre-mortem requests with their category, the cells answering them, and open decisions. */
export function premortemSummary(plan) {
  const requests = premortemRequests(plan).map((request) => {
    const category = reviewCategory(request.category)
    return {
      id: request.id,
      reviewer: hasText(request.reviewer) ? request.reviewer : null,
      category: category?.id ?? null,
      categoryLabel: category?.label ?? 'Other',
      categoryRate: category?.rate ?? null,
      request: request.request,
      why: hasText(request.why) ? request.why : null,
      likelihood: hasText(request.likelihood) ? request.likelihood : null,
      likelyDemand: isLikelyDemand(request),
      resolution: request.resolution?.as ?? null,
      items: ids(request.resolution?.items),
      cells: requestCells(plan, request),
      reason: hasText(request.resolution?.reason) ? request.resolution.reason : null,
      costGpuHours: finiteNumber(request.resolution?.costGpuHours)
    }
  })
  return {
    ranAt: hasText(plan.premortem?.ranAt) ? plan.premortem.ranAt : null,
    requests,
    open: requests.filter((request) => !request.resolution).map((request) => request.id),
    asks: requests.filter((request) => request.resolution === 'ask').map((request) => request.id)
  }
}

/** The closest prior methods found before planning: each a paper, a baseline or a reason. */
export function closestPriorView(plan) {
  const baselines = new Map(list(plan.baselines).map((baseline) => [baseline.id, baseline]))
  return list(plan.baselineSearch?.closest).map((entry) => {
    const baseline = hasText(entry.baseline) ? (baselines.get(entry.baseline) ?? null) : null
    return {
      title: hasText(entry.title) ? entry.title.trim() : '',
      method: hasText(entry.method) ? entry.method.trim() : null,
      arxiv: hasText(entry.arxiv) ? entry.arxiv.trim() : null,
      doi: hasText(entry.doi) ? entry.doi.trim() : null,
      year: finiteNumber(entry.year),
      why: hasText(entry.why) ? entry.why : null,
      baseline: baseline ? baseline.id : null,
      baselineName: baseline && hasText(baseline.name) ? baseline.name : null,
      reason: hasText(entry.reason) ? entry.reason : null
    }
  })
}
