import type { ResearchLoopLedger } from '../../../../shared/research/research-harness-results'

export const LOOP_ENTRY_LABELS: Record<string, string> = {
  objective: 'Objective',
  hypothesis: 'Hypothesis',
  run: 'Run',
  result: 'Result',
  decision: 'Decision',
  checkpoint: 'Checkpoint'
}

function hours(value: number): string {
  return value < 10 ? String(Math.round(value * 10) / 10) : String(Math.round(value))
}

/** `4 of 12 loop runs · 1.2 of 8 h`; either half is dropped when the loop sets no such limit. */
export function researchLoopBudgetText(
  budget: NonNullable<ResearchLoopLedger['budget']>,
  hoursElapsed = budget.hoursElapsed
): string {
  const runs =
    budget.maxRuns !== null
      ? `${budget.runsUsed} of ${budget.maxRuns} loop runs`
      : `${budget.runsUsed} ${budget.runsUsed === 1 ? 'loop run' : 'loop runs'}`
  const time =
    budget.maxHours !== null
      ? `${hours(hoursElapsed)} of ${hours(budget.maxHours)} h`
      : `${hours(hoursElapsed)} h`
  return `${runs} · ${time}`
}

/** With nothing logged for this long and no Run running, a loop has ended. */
export const LOOP_IDLE_MS = 60 * 60_000
const STOP_DECISION = /^\s*stop\b/iu

/**
 * `active` while the loop works; `waiting` once its last entry is a checkpoint for the user;
 * `ended` after a `stop: …` decision, or after LOOP_IDLE_MS of quiet with no Run running.
 */
export type ResearchLoopPhase = 'active' | 'waiting' | 'ended'

export type ResearchLoopProgress = {
  phase: ResearchLoopPhase
  /** The last entry, where a waiting or ended loop's clock stopped. */
  stoppedAt: string | null
  /** Hours since the objective, up to now, or to `stoppedAt`. */
  hoursElapsed: number | null
  /** At or past a run or hour limit. */
  budgetUsed: boolean
  /** Past a limit, not just at it. */
  overBudget: boolean
}

export function researchLoopProgress(
  ledger: ResearchLoopLedger,
  { running, now = Date.now() }: { running: boolean; now?: number }
): ResearchLoopProgress {
  const last = ledger.entries.at(-1) ?? ledger.objective
  const lastAt = last ? Date.parse(last.at) : Number.NaN
  const phase: ResearchLoopPhase =
    last?.kind === 'checkpoint'
      ? 'waiting'
      : (last?.kind === 'decision' && STOP_DECISION.test(last.text)) ||
          (!running && now - lastAt >= LOOP_IDLE_MS)
        ? 'ended'
        : 'active'
  const stoppedAt = phase === 'active' ? null : (last?.at ?? null)
  const startAt = ledger.objective ? Date.parse(ledger.objective.at) : Number.NaN
  const endAt = phase === 'active' ? now : lastAt
  const measured = (endAt - startAt) / 3_600_000
  const budget = ledger.budget
  const hoursElapsed = Number.isFinite(measured)
    ? Math.max(0, measured)
    : (budget?.hoursElapsed ?? null)
  const limits = (past: (used: number, limit: number) => boolean): boolean =>
    Boolean(
      budget &&
      ((budget.maxRuns !== null && past(budget.runsUsed, budget.maxRuns)) ||
        (budget.maxHours !== null && hoursElapsed !== null && past(hoursElapsed, budget.maxHours)))
    )
  return {
    phase,
    stoppedAt,
    hoursElapsed,
    budgetUsed: limits((used, limit) => used >= limit),
    overBudget: limits((used, limit) => used > limit)
  }
}

/** `loss (val) · lower is better`, or null when the objective names no metric. */
export function researchLoopMetricText(ledger: ResearchLoopLedger): string | null {
  const data = ledger.objective?.data
  if (!data?.metric) {
    return null
  }
  const metric = data.split ? `${data.metric} (${data.split})` : data.metric
  const direction =
    data.direction === 'minimize'
      ? 'lower is better'
      : data.direction === 'maximize'
        ? 'higher is better'
        : null
  const parallel =
    data.maxParallel && data.maxParallel > 1 ? `up to ${data.maxParallel} at once` : null
  return [metric, direction, parallel].filter(Boolean).join(' · ')
}
