import type { ResearchRunExecutionState, ResearchRunJobState } from './research-run-manifest'
import type { ResearchMetricRow } from './research-run-metrics'
import { formatResearchMetricValues } from './research-run-metrics'
import type { ResearchRunWatch, ResearchWatchRunState } from './research-run-watch'
import {
  formatResearchWatchCondition,
  parseResearchWatchConditions,
  type ResearchWatchComparison,
  type ResearchWatchCondition
} from './research-run-watch-conditions'
import { isTerminalResearchJobState, researchExecutionFromJob } from './research-slurm-accounting'

/** What one check read of the Run since the watch's cursors. */
export type ResearchWatchObservation = {
  now: string
  execution: {
    state: ResearchRunExecutionState
    source: string | null
    exitCode: number | null
  } | null
  job: { state: ResearchRunJobState; reason: string | null; exitCode: number | null } | null
  newMetricRows: readonly ResearchMetricRow[]
  newLogLines: readonly string[]
  /** Metrics or log grew since the last check. */
  progressed: boolean
}

export type ResearchWatchFiring = { condition: string; implicit: boolean; evidence: string }

/** The Run's outcome when it has one: its manifest first, then its scheduler job. */
export function researchRunOutcome(
  observation: Pick<ResearchWatchObservation, 'execution' | 'job'>
): { state: ResearchRunExecutionState; evidence: string } | null {
  const { execution, job } = observation
  const parts: string[] = []
  let state: ResearchRunExecutionState | null = null
  if (execution && execution.state !== 'running' && execution.state !== 'unknown') {
    state = execution.state
    parts.push(
      `Run execution ${execution.state}${execution.exitCode === null ? '' : ` (exit ${execution.exitCode})`}${
        execution.source ? ` per ${execution.source}` : ''
      }`
    )
  }
  if (job && isTerminalResearchJobState(job.state)) {
    state ??= researchExecutionFromJob(job.state, job.exitCode)
    parts.push(
      `SLURM job ${job.state}${job.reason ? ` (${job.reason})` : ''}${
        job.exitCode === null ? '' : `, exit ${job.exitCode}`
      }`
    )
  }
  return state && state !== 'unknown' ? { state, evidence: parts.join('; ') } : null
}

function compare(value: number, op: ResearchWatchComparison, threshold: number): boolean {
  switch (op) {
    case '<':
      return value < threshold
    case '<=':
      return value <= threshold
    case '>':
      return value > threshold
    case '>=':
      return value >= threshold
  }
}

function stepLabel(row: ResearchMetricRow): string {
  return row.step === null ? '' : ` at step ${row.step}`
}

function firstMetricMatch(
  rows: readonly ResearchMetricRow[],
  condition: Extract<ResearchWatchCondition, { kind: 'metric' }>
): string | null {
  for (const row of rows) {
    const value = row.metrics[condition.metric]
    if (value !== undefined && compare(value, condition.op, condition.value)) {
      return `${condition.metric}=${Number(value.toPrecision(6))}${stepLabel(row)}${
        row.split ? ` (${row.split})` : ''
      }`
    }
  }
  return null
}

function firstNonFinite(rows: readonly ResearchMetricRow[]): string | null {
  const row = rows.find((entry) => entry.nonFinite.length > 0)
  return row ? `${row.nonFinite.slice(0, 4).join(', ')} not finite${stepLabel(row)}` : null
}

function firstLogMatch(
  lines: readonly string[],
  condition: Extract<ResearchWatchCondition, { kind: 'log' }>
): string | null {
  const pattern = new RegExp(condition.source, condition.flags.replace(/[gy]/g, ''))
  const line = lines.find((entry) => pattern.test(entry))
  return line === undefined ? null : `log line: ${line.trim().slice(0, 300)}`
}

/** Whether a stall clock may run: a job still waiting in the queue is not stalled. */
function progressExpected(observation: ResearchWatchObservation): boolean {
  return observation.job ? observation.job.state === 'running' : true
}

export function evaluateResearchWatch(
  watch: Pick<ResearchRunWatch, 'conditions' | 'fired' | 'lastProgressAt'>,
  observation: ResearchWatchObservation
): { firings: ResearchWatchFiring[]; lastProgressAt: string; ended: boolean } {
  const already = new Set(watch.fired.map((event) => event.condition))
  const outcome = researchRunOutcome(observation)
  const nowMs = Date.parse(observation.now)
  const lastProgressAt =
    observation.progressed || !progressExpected(observation)
      ? observation.now
      : watch.lastProgressAt
  const firings: ResearchWatchFiring[] = []
  const fire = (condition: string, evidence: string | null): void => {
    if (evidence !== null && !already.has(condition)) {
      firings.push({ condition, implicit: false, evidence })
      already.add(condition)
    }
  }
  const conditions = watch.conditions.flatMap((text) => {
    try {
      return [parseResearchWatchConditions([text])[0]]
    } catch {
      return []
    }
  })
  for (const condition of conditions) {
    const key = formatResearchWatchCondition(condition)
    switch (condition.kind) {
      case 'exit':
        fire(key, outcome ? outcome.evidence : null)
        break
      case 'failed':
        fire(key, outcome?.state === 'failed' ? outcome.evidence : null)
        break
      case 'succeeded':
        fire(key, outcome?.state === 'succeeded' ? outcome.evidence : null)
        break
      case 'metric':
        fire(key, firstMetricMatch(observation.newMetricRows, condition))
        break
      case 'nan':
        fire(key, firstNonFinite(observation.newMetricRows))
        break
      case 'log':
        fire(key, firstLogMatch(observation.newLogLines, condition))
        break
      case 'stall': {
        const quietMs = nowMs - Date.parse(lastProgressAt)
        fire(
          key,
          !outcome && progressExpected(observation) && quietMs >= condition.minutes * 60_000
            ? `no new metrics or log output for ${Math.floor(quietMs / 60_000)} min`
            : null
        )
        break
      }
    }
  }
  // Why: an owner asleep on a metric must still learn the Run ended without reaching it.
  const asksForEnd = conditions.some((entry) =>
    ['exit', 'failed', 'succeeded'].includes(entry.kind)
  )
  if (outcome && !asksForEnd && !already.has('exit')) {
    firings.push({ condition: 'exit', implicit: true, evidence: outcome.evidence })
  }
  return { firings, lastProgressAt, ended: outcome !== null }
}

export function describeResearchWatchRunState(
  state: ResearchWatchRunState | null,
  lastMetrics: string | null
): string {
  if (!state) {
    return 'Run state not read yet'
  }
  const parts = [
    `Run execution ${state.execution ?? 'not recorded'}${state.executionSource ? ` (${state.executionSource})` : ''}`
  ]
  if (state.job) {
    parts.push(`SLURM job ${state.job}${state.jobReason ? ` (${state.jobReason})` : ''}`)
  }
  if (lastMetrics) {
    parts.push(`last metrics ${lastMetrics}`)
  }
  return parts.join(' · ')
}

export function researchWatchLastMetrics(rows: readonly ResearchMetricRow[]): string | null {
  const row = rows.findLast((entry) => Object.keys(entry.metrics).length > 0)
  if (!row) {
    return null
  }
  return `${row.step === null ? '' : `step ${row.step}: `}${formatResearchMetricValues(row.metrics)}`.slice(
    0,
    400
  )
}
