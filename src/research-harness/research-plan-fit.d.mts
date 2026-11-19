import type {
  PlanBudget,
  PlanCellView,
  PlanCutConsequences,
  PlanDocument,
  PlanTier
} from './research-plan-view.mjs'

export type PlanCutLoss = PlanCutConsequences & {
  /** Kept comparisons that lose an arm ("S2.ours vs S2.B1"). */
  comparisons: string[]
  /** Baselines and ablations whose every cell is cut ("baseline B3 (…)"). */
  dropped: string[]
}

export type PlanCutSuggestion = {
  cell: string
  gpuHours: number
  tier: PlanTier
  purpose: string
  score: number
  reasons: string[]
  cutReason: string | null
  /** What this cut takes away, given the cuts suggested before it. */
  loses: PlanCutLoss
}

export type PlanBudgetFit = {
  budget: PlanBudget
  keptGpuHours: number
  /** The budget less its spare share; null when no budget is known. */
  plannableGpuHours: number | null
  overBudgetBy: number | null
  overPlannableBy: number | null
  uncosted: string[]
  /** Cuts that fit the plannable share, lowest priority first. */
  suggestions: PlanCutSuggestion[]
  afterGpuHours: number
  fitsAfter: boolean | null
}

export function rankedCells(plan: PlanDocument): PlanCellView[]
export function cutOrder(cells: PlanCellView[]): PlanCellView[]
export function budgetFit(plan: PlanDocument, cut?: Set<string>): PlanBudgetFit
export function lossText(loses: PlanCutLoss): string | null
