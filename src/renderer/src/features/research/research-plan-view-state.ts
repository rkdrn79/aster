import type {
  ResearchPlanApproveInput,
  ResearchPlanCell,
  ResearchPlanOverview,
  ResearchPlanRequest,
  ResearchPlanTier
} from '../../../../shared/research/research-plans'
import type { PlanCutSuggestion } from '../../../../research-harness/research-plan-fit.mjs'
import type { PlanTierTotals } from '../../../../research-harness/research-plan-view.mjs'

export type PlanAskDecision = { decision: 'include' | 'out-of-scope'; reason: string }

/** What the person has chosen so far: cut cells with their reasons, and "ask" decisions. */
export type PlanSelection = {
  cuts: ReadonlyMap<string, string>
  decisions: ReadonlyMap<string, PlanAskDecision>
}

export const EMPTY_SELECTION: PlanSelection = { cuts: new Map(), decisions: new Map() }

/** True when the plan on screen is the approved revision, so its choices are read-only. */
export function planApproved(overview: ResearchPlanOverview): boolean {
  return (
    overview.plan.status === 'approved' &&
    overview.plan.approval?.revision === overview.plan.revision
  )
}

/** The approved choices for an approved revision; an empty selection for a plan to decide on. */
export function initialSelection(overview: ResearchPlanOverview): PlanSelection {
  const approval = overview.plan.approval
  if (!planApproved(overview) || !approval) {
    return EMPTY_SELECTION
  }
  return {
    cuts: new Map(approval.cuts.map((cut) => [cut.cell, cut.reason])),
    decisions: new Map(
      approval.decisions.map((entry) => [
        entry.request,
        { decision: entry.decision, reason: entry.reason ?? '' }
      ])
    )
  }
}

export function cutSet(selection: PlanSelection): Set<string> {
  return new Set(selection.cuts.keys())
}

/** Keeps or cuts cells; a new cut starts with the agent's suggested reason, if any. */
export function setCellsKept(
  selection: PlanSelection,
  cells: readonly Pick<ResearchPlanCell, 'cell' | 'cutReason'>[],
  kept: boolean
): PlanSelection {
  const cuts = new Map(selection.cuts)
  for (const cell of cells) {
    if (kept) {
      cuts.delete(cell.cell)
    } else if (!cuts.has(cell.cell)) {
      cuts.set(cell.cell, cell.cutReason ?? '')
    }
  }
  return { ...selection, cuts }
}

export function setCutReason(
  selection: PlanSelection,
  cell: string,
  reason: string
): PlanSelection {
  if (!selection.cuts.has(cell)) {
    return selection
  }
  return { ...selection, cuts: new Map(selection.cuts).set(cell, reason) }
}

/** Checked state of a tier's checkbox: all kept, none kept, or some. */
export function tierChecked(
  selection: PlanSelection,
  cells: readonly string[]
): boolean | 'indeterminate' {
  const kept = cells.filter((cell) => !selection.cuts.has(cell)).length
  return kept === cells.length ? true : kept === 0 ? false : 'indeterminate'
}

/**
 * Decides a request the agent left to the person. Leaving it out cuts its cells with the same
 * reason; including it keeps them.
 */
export function decideRequest(
  selection: PlanSelection,
  request: Pick<ResearchPlanRequest, 'id' | 'cells'>,
  decision: PlanAskDecision
): PlanSelection {
  const decisions = new Map(selection.decisions).set(request.id, decision)
  const cuts = new Map(selection.cuts)
  for (const cell of request.cells) {
    if (decision.decision === 'include') {
      cuts.delete(cell)
    } else {
      const current = cuts.get(cell)
      cuts.set(cell, current?.trim() ? current : decision.reason)
    }
  }
  return { cuts, decisions }
}

/** Each tier's cells, highest priority first (what they decide), so the bottom is cut first. */
export function cellsByTier(
  cells: readonly ResearchPlanCell[]
): Record<ResearchPlanTier, ResearchPlanCell[]> {
  const ranked = [...cells].sort((left, right) => right.priority.score - left.priority.score)
  return {
    must: ranked.filter((cell) => cell.effectiveTier === 'must'),
    should: ranked.filter((cell) => cell.effectiveTier === 'should'),
    could: ranked.filter((cell) => cell.effectiveTier === 'could')
  }
}

/** The out-of-scope reason a suggested cut starts with: the agent's own, else why it went first. */
export function suggestedCutReason(suggestion: PlanCutSuggestion): string {
  if (suggestion.cutReason?.trim()) {
    return suggestion.cutReason
  }
  return suggestion.reasons.length
    ? `Over the compute; lowest priority (${suggestion.reasons.join(', ')})`
    : 'Over the compute; supports no claim or reviewer request'
}

/** Takes the suggested cuts into the selection; the person can still keep any of them. */
export function applySuggestedCuts(
  selection: PlanSelection,
  suggestions: readonly PlanCutSuggestion[]
): PlanSelection {
  const cuts = new Map(selection.cuts)
  for (const suggestion of suggestions) {
    if (!cuts.has(suggestion.cell)) {
      cuts.set(suggestion.cell, suggestedCutReason(suggestion))
    }
  }
  return { ...selection, cuts }
}

export function formatHours(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '?'
  }
  return String(Number(value.toFixed(1)))
}

/** Why Approve is not available yet, in the order the person should fix them; empty when ready. */
export function approveBlockers(
  overview: ResearchPlanOverview,
  selection: PlanSelection,
  totals: PlanTierTotals
): string[] {
  const blockers: string[] = []
  if (!totals.budget.stated) {
    blockers.push('State your compute in GPU-hours first.')
  }
  const undecided = overview.premortem.asks.filter((id) => !selection.decisions.has(id))
  if (undecided.length) {
    blockers.push(
      `Decide ${undecided.length} reviewer request${undecided.length === 1 ? '' : 's'} left to you (${undecided.join(', ')}).`
    )
  }
  const leftOut = [...selection.decisions].filter(
    ([, decision]) => decision.decision === 'out-of-scope' && !decision.reason.trim()
  )
  if (leftOut.length) {
    blockers.push(`Give a reason for leaving out ${leftOut.map(([id]) => id).join(', ')}.`)
  }
  const reasonless = [...selection.cuts].filter(([, reason]) => !reason.trim())
  if (reasonless.length) {
    blockers.push(
      `Give an out-of-scope reason for ${reasonless.length} cut ${reasonless.length === 1 ? 'run' : 'runs'}.`
    )
  }
  if (
    totals.budget.stated &&
    totals.budget.gpuHours !== null &&
    totals.totalGpuHours > totals.budget.gpuHours + 1e-9
  ) {
    blockers.push(
      `Kept runs need ${formatHours(totals.totalGpuHours)} of ${formatHours(totals.budget.gpuHours)} GPU-h: cut more or state more compute.`
    )
  }
  return blockers
}

export function approveInput(
  overview: ResearchPlanOverview,
  selection: PlanSelection
): ResearchPlanApproveInput {
  return {
    revision: overview.plan.revision,
    cuts: [...selection.cuts].map(([cell, reason]) => ({ cell, reason: reason.trim() })),
    decisions: overview.premortem.asks
      .filter((id) => selection.decisions.has(id))
      .map((id) => {
        const decision = selection.decisions.get(id)
        return {
          request: id,
          decision: decision?.decision ?? 'include',
          reason: decision?.reason.trim() || null
        }
      })
  }
}

/** "3 runs proposed in ts-aug-forecasting, 1 in q2-…": where the person approves each Run. */
export function proposedSummary(
  proposals: readonly { experiment: string; proposal: string }[]
): string {
  if (!proposals.length) {
    return 'No runs were proposed: every cell of the first stage was cut or already proposed.'
  }
  const counts = new Map<string, number>()
  for (const item of proposals) {
    counts.set(item.experiment, (counts.get(item.experiment) ?? 0) + 1)
  }
  const [first, ...rest] = [...counts]
  const lead = `${first[1]} ${first[1] === 1 ? 'run' : 'runs'} proposed in ${first[0]}`
  const more = rest.map(([experiment, count]) => `, ${count} in ${experiment}`).join('')
  return `${lead}${more}; approve each in its Experiment.`
}
