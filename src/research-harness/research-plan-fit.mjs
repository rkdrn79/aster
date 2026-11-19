// Fitting a plan to the person's compute: cells ranked by priority, and the cuts that would bring
// the kept cells within the stated GPU-hours less a spare share, lowest priority first, each with
// what it costs in evidence. The agent and the Plan view only suggest; the person cuts in Aster.

import { list, textList } from './research-plan-schema.mjs'
import { cutConsequences, itemCells, planCellsView, statedBudget } from './research-plan-view.mjs'

const TIER_RANK = { must: 0, should: 1, could: 2 }
/** Cheap gate inputs the plan's stages read: never offered as cuts. */
const GATE_PURPOSES = new Set(['sanity', 'pilot'])

/** Highest priority first; within a score, must before should before could, cheap first. */
export function rankedCells(plan) {
  return planCellsView(plan).sort(
    (left, right) =>
      right.priority.score - left.priority.score ||
      TIER_RANK[left.effectiveTier] - TIER_RANK[right.effectiveTier] ||
      (left.cost ?? 0) - (right.cost ?? 0)
  )
}

/**
 * The order to cut in: could, then should, then must; within a tier the lowest priority first and,
 * at equal priority, the dearest first. Sanity and pilot cells are never suggested: the gates read
 * them, and they are cheap.
 */
export function cutOrder(cells) {
  return cells
    .filter((cell) => (cell.cost ?? 0) > 0)
    .filter((cell) => !GATE_PURPOSES.has(cell.purpose))
    .sort(
      (left, right) =>
        TIER_RANK[right.effectiveTier] - TIER_RANK[left.effectiveTier] ||
        left.priority.score - right.priority.score ||
        (right.cost ?? 0) - (left.cost ?? 0)
    )
}

function added(before, after) {
  const known = new Set(before.map((entry) => entry.id))
  return after.filter((entry) => !known.has(entry.id))
}

/** Kept comparisons that lose an arm when `cell` is cut ("S2.ours vs S2.B1"). */
function lostComparisons(plan, cell, chosen) {
  const pairs = []
  for (const entry of list(plan.matrix)) {
    const others = textList(entry.compareTo)
    if (entry.cell === cell) {
      pairs.push(
        ...others.filter((other) => !chosen.has(other)).map((other) => `${cell} vs ${other}`)
      )
    } else if (others.includes(cell) && !chosen.has(entry.cell)) {
      pairs.push(`${entry.cell} vs ${cell}`)
    }
  }
  return pairs
}

/** Baselines and ablations whose every cell is now cut, by the cut of `cell`. */
function droppedItems(plan, cell, chosen) {
  const dropped = []
  for (const [key, label] of [
    ['baselines', 'baseline'],
    ['ablations', 'ablation']
  ]) {
    for (const item of list(plan[key])) {
      const cells = itemCells(plan, item.id)
      if (cells.includes(cell) && cells.every((entry) => chosen.has(entry))) {
        dropped.push(`${label} ${item.id}${item.name ? ` (${item.name})` : ''}`)
      }
    }
  }
  return dropped
}

/** What one more cut takes away, given the cuts already made. */
function marginalLoss(before, after, comparisons, dropped) {
  const claims = added(before.claims, after.claims)
  const lost = new Set(claims.map((claim) => claim.id))
  return {
    claims,
    weakened: added(before.weakened, after.weakened).filter((claim) => !lost.has(claim.id)),
    requests: added(before.requests, after.requests),
    comparisons,
    dropped
  }
}

/**
 * The kept cells (not in `cut`) against the compute the person stated (none for an assumed one).
 * When they exceed the plannable share
 * (GPU-hours × (1 − reserve)), `suggestions` lists the cuts that fit it, lowest priority first,
 * each with the claims and reviewer requests it leaves without evidence.
 */
export function budgetFit(plan, cut = new Set()) {
  const budget = statedBudget(plan)
  const cells = planCellsView(plan)
  const kept = cells.filter((cell) => !cut.has(cell.cell))
  const keptGpuHours = kept.reduce((sum, cell) => sum + (cell.cost ?? 0), 0)
  const uncosted = kept.filter((cell) => cell.cost === null).map((cell) => cell.cell)
  // Why stated only: cuts against a budget nobody gave would push the person's decision.
  if (budget.gpuHours === null || !budget.stated) {
    return {
      budget,
      keptGpuHours,
      plannableGpuHours: null,
      overBudgetBy: null,
      overPlannableBy: null,
      uncosted,
      suggestions: [],
      afterGpuHours: keptGpuHours,
      fitsAfter: null
    }
  }
  const plannable = budget.gpuHours * (1 - budget.reserve)
  const chosen = new Set(cut)
  let before = cutConsequences(plan, chosen)
  let running = keptGpuHours
  const suggestions = []
  for (const cell of cutOrder(kept)) {
    if (running <= plannable + 1e-9) {
      break
    }
    const comparisons = lostComparisons(plan, cell.cell, chosen)
    chosen.add(cell.cell)
    running -= cell.cost
    const after = cutConsequences(plan, chosen)
    suggestions.push({
      cell: cell.cell,
      gpuHours: cell.cost,
      tier: cell.effectiveTier,
      purpose: cell.purpose,
      score: cell.priority.score,
      reasons: cell.priority.reasons,
      cutReason: cell.cutReason,
      loses: marginalLoss(before, after, comparisons, droppedItems(plan, cell.cell, chosen))
    })
    before = after
  }
  return {
    budget,
    keptGpuHours,
    plannableGpuHours: plannable,
    overBudgetBy: Math.max(0, keptGpuHours - budget.gpuHours),
    overPlannableBy: Math.max(0, keptGpuHours - plannable),
    uncosted,
    suggestions,
    afterGpuHours: running,
    fitsAfter: running <= plannable + 1e-9
  }
}

/** "C3 left with no experiment; PM4 unanswered" for one suggested cut; null when nothing is lost. */
export function lossText(loses) {
  const parts = [
    loses.claims.length &&
      `${loses.claims.map((claim) => claim.id).join(', ')} left with no experiment`,
    loses.weakened.length && `${loses.weakened.map((claim) => claim.id).join(', ')} weakened`,
    loses.requests.length &&
      `${loses.requests.map((request) => `${request.id}${request.likelyDemand ? ' (likely demand)' : ''}`).join(', ')} unanswered`,
    loses.dropped?.length && `${loses.dropped.join(', ')} dropped`,
    loses.comparisons?.length &&
      `comparison${loses.comparisons.length === 1 ? '' : 's'} ${loses.comparisons.slice(0, 3).join(', ')}${loses.comparisons.length > 3 ? ` and ${loses.comparisons.length - 3} more` : ''} lost`
  ].filter(Boolean)
  return parts.length ? parts.join('; ') : null
}
