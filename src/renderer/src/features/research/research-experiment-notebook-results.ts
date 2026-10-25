import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import type { ResearchRunSummary } from '../../../../shared/research/research-run-summary'
import type { ResearchRunStatusFacts } from './research-run-status-label'
import {
  summaryBaselineDelta,
  type SummaryValueMode
} from './research-experiment-workspace-summary-format'
import { catalogRunReference } from './use-research-harness-experiment'

function withoutSeeds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutSeeds)
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/^(?:.*\.)?seed$/iu.test(key))
      .toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, withoutSeeds(entry)])
  )
}

/**
 * A config.json's identity apart from its seed, as the harness's seed check groups Runs; null when
 * the file is not a JSON object.
 */
export function configSeedKey(content: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return null
  }
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? JSON.stringify(withoutSeeds(parsed))
    : null
}

const SEED_SUFFIX = /[\s_-]*seed[\s_-]*\d+$/iu

/** `Cand` for `Cand seed 1` and `Cand seed 2`; the oldest name when the names disagree. */
function groupName(runs: readonly ResearchRunRecord[]): string {
  const names = runs.map((run) => run.name.replace(SEED_SUFFIX, '') || run.name)
  return names.every((name) => name === names[0])
    ? (names[0] ?? '')
    : (runs.at(-1)?.name ?? names[0] ?? '')
}

function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function sampleDeviation(values: readonly number[]): number | null {
  const average = mean(values)
  if (average === null || values.length < 2) {
    return null
  }
  const squares = values.reduce((sum, value) => sum + (value - average) ** 2, 0)
  return Math.sqrt(squares / (values.length - 1))
}

/** One Results row: a Run, or Runs that differ only in their seed. */
export type NotebookResultRow = {
  key: string
  name: string
  /** Newest first. */
  runs: ResearchRunRecord[]
  /** The Run whose state the row shows and that opens in Details: running, else failed, else newest. */
  lead: ResearchRunRecord
  /** The primary metric (the mean over seeds), or null when no Run measured it. */
  value: number | null
  /** The step of a single Run's value. */
  step: number | null
  /** Sample standard deviation over seeds. */
  spread: number | null
  /** Difference from the baseline, the mean over seeds. */
  delta: number | null
  /** Runs in the row. */
  seeds: number
  isBaseline: boolean
}

const ENDED_BADLY = new Set<ResearchRunRecord['execution']>(['failed', 'cancelled'])

function leadRun(
  runs: readonly ResearchRunRecord[],
  statusOf: (run: ResearchRunRecord) => ResearchRunStatusFacts
): ResearchRunRecord | undefined {
  return (
    runs.find((run) => statusOf(run).state === 'running') ??
    runs.find((run) => statusOf(run).state === 'failed') ??
    runs[0]
  )
}

/**
 * The Experiment's Runs for the notebook, newest first. Runs whose config.json matches apart from
 * the seed share a row with the mean and spread over seeds; failed and cancelled Runs, and Runs
 * without a readable config, stay on their own row.
 */
export function notebookResultRows(input: {
  runs: readonly ResearchRunRecord[]
  statusOf: (run: ResearchRunRecord) => ResearchRunStatusFacts
  summaryOf: (run: ResearchRunRecord) => ResearchRunSummary | null
  /** `configSeedKey` of the Run's config, or null when unknown. */
  configKeyOf: (run: ResearchRunRecord) => string | null
  baselineRunId: string | null
  baselineReference: string | null
  mode: SummaryValueMode
}): { rows: NotebookResultRow[]; grouped: boolean } {
  const groups = new Map<string, ResearchRunRecord[]>()
  const newest = input.runs.toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
  for (const run of newest) {
    const configKey = ENDED_BADLY.has(input.statusOf(run).state) ? null : input.configKeyOf(run)
    const key = configKey === null ? `run:${run.id}` : `config:${configKey}`
    groups.set(key, [...(groups.get(key) ?? []), run])
  }
  const rows = [...groups].flatMap(([key, runs]): NotebookResultRow[] => {
    const lead = leadRun(runs, input.statusOf)
    if (!lead) {
      return []
    }
    const values: number[] = []
    const deltas: number[] = []
    for (const run of runs) {
      const summary = input.summaryOf(run)
      const point = summary?.primary?.[input.mode]
      if (point) {
        values.push(point.value)
      }
      const delta = summaryBaselineDelta(summary, input.baselineReference, input.mode)
      if (delta !== null) {
        deltas.push(delta)
      }
    }
    const single = runs.length === 1 ? input.summaryOf(lead)?.primary?.[input.mode] : null
    return [
      {
        key,
        name: runs.length === 1 ? lead.name : groupName(runs),
        runs,
        lead,
        value: mean(values),
        step: single?.step ?? null,
        spread: sampleDeviation(values),
        delta: mean(deltas),
        seeds: runs.length,
        isBaseline: runs.some((run) => run.id === input.baselineRunId)
      }
    ]
  })
  return { rows, grouped: [...groups.values()].some((runs) => runs.length > 1) }
}

/** Reads a Run's summary.json by its catalog reference. */
export function runSummaryOf(
  summaries: ReadonlyMap<string, ResearchRunSummary | null>
): (run: ResearchRunRecord) => ResearchRunSummary | null {
  return (run) => {
    const reference = catalogRunReference(run)
    return reference ? (summaries.get(reference) ?? null) : null
  }
}
