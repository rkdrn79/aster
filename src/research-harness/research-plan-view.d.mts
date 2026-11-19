/** A plan.json object (`aster.plan/v1`); fields are read leniently, so it stays open. */
export type PlanDocument = Record<string, unknown>

export type PlanTier = 'must' | 'should' | 'could'

export type PlanCellView = {
  cell: string
  stage: string | null
  question: string | null
  purpose: string
  /** The agent's tier (must when unset). */
  tier: PlanTier
  /** must when a likely reviewer demand in a protected category points at the cell. */
  effectiveTier: PlanTier
  /** Pre-mortem request IDs that promoted the cell to must. */
  promotedBy: string[]
  /** Planned GPU-hours; null when the cell has no cost. */
  cost: number | null
  costSource: string | null
  seeds: number
  claims: string[]
  /** Pre-mortem request IDs this cell answers. */
  requests: string[]
  /** What the cell decides: claims supported, requests answered, comparisons anchored. 0 = nothing. */
  priority: PlanCellPriority
  expect: string | null
  command: string | null
  needsCode: boolean
  /** The agent's suggested out-of-scope reason if the person cuts the cell. */
  cutReason: string | null
  factors: Record<string, unknown>
}

export type PlanCellPriority = { score: number; reasons: string[] }

export type PlanBudget = {
  /** Stated GPU-hours, or GPUs × days × 24 when only those were given. */
  gpuHours: number | null
  source: string | null
  /** True when the person or the compute policy gave the budget. */
  stated: boolean
  hardware: string | null
  wallclockDays: number | null
  gpus: number | null
  /** True when gpuHours was counted from GPUs × days. */
  derived: boolean
  /** Share kept spare for reruns and debugging (0.2 unless stated). */
  reserve: number
}

export type PlanClosestPrior = {
  title: string
  method: string | null
  arxiv: string | null
  doi: string | null
  year: number | null
  why: string | null
  /** The baseline that runs it, or null when it is not compared. */
  baseline: string | null
  baselineName: string | null
  /** Why it is not compared. */
  reason: string | null
}

export type PlanTierTotal = {
  tier: PlanTier
  cells: string[]
  gpuHours: number
  cumulativeGpuHours: number
  uncosted: string[]
  /** null when no budget is known. */
  fits: boolean | null
}

export type PlanTierTotals = { budget: PlanBudget; tiers: PlanTierTotal[]; totalGpuHours: number }

export type PlanCoverage = {
  questions: { id: string; text: string; experiment: string | null }[]
  claims: {
    id: string
    text: string
    weight: 'main' | 'secondary'
    kind: string | null
    status: 'covered' | 'argued-only' | 'no-experiment' | 'cut'
    entries: { question: string; cells: string[]; included: string[] }[]
  }[]
}

export type PlanRunOrder = {
  stages: {
    id: string
    name: string
    gate: string | null
    budgetGpuHours: number | null
    cells: string[]
    purposes: string[]
    gpuHours: number
    cumulativeGpuHours: number
  }[]
  unstaged: string[]
}

export type PlanCutConsequences = {
  /** Claims left with no kept cell. */
  claims: { id: string; text: string; weight: 'main' | 'secondary' }[]
  /** Claims that keep some evidence but lose a question's cells. */
  weakened: { id: string; text: string; weight: 'main' | 'secondary' }[]
  /** Pre-mortem requests whose every cell is cut. */
  requests: {
    id: string
    request: string
    category: string | null
    likelihood: string | null
    likelyDemand: boolean
  }[]
}

export type PlanPremortemRequest = {
  id: string
  reviewer: string | null
  category: string | null
  categoryLabel: string
  categoryRate: number | null
  request: string
  why: string | null
  likelihood: string | null
  likelyDemand: boolean
  resolution: 'plan' | 'out-of-scope' | 'ask' | null
  items: string[]
  cells: string[]
  reason: string | null
  costGpuHours: number | null
}

export type PlanPremortemSummary = {
  ranAt: string | null
  requests: PlanPremortemRequest[]
  open: string[]
  asks: string[]
}

export const DEFAULT_RESERVE: number
export function itemCells(plan: PlanDocument, itemId: string): string[]
export function closestBaselineIds(plan: PlanDocument): Set<string>
export function closestPriorView(plan: PlanDocument): PlanClosestPrior[]
export function planCellsView(plan: PlanDocument): PlanCellView[]
export function statedBudget(plan: PlanDocument): PlanBudget
export function tierTotals(plan: PlanDocument, cut?: Set<string>): PlanTierTotals
export function coverageMatrix(plan: PlanDocument, cut?: Set<string>): PlanCoverage
export function runOrder(plan: PlanDocument, cut?: Set<string>): PlanRunOrder
export function cutConsequences(plan: PlanDocument, cut?: Set<string>): PlanCutConsequences
export function premortemSummary(plan: PlanDocument): PlanPremortemSummary
