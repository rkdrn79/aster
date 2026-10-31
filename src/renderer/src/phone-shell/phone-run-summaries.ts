import { formatMetricValue } from '@/features/research/research-experiment-workspace-summary-format'
import type {
  ResearchProjectExperimentOverview,
  ResearchProjectMetricLast,
  ResearchProjectReadResult,
  ResearchProjectRunOverview
} from '../../../shared/research/research-project-api'
import type { ResearchRunExecutionState } from '../../../shared/research/research-run-manifest'

/** One Run from a workspace's `.aster/` catalog, ready for a list row. */
export type PhoneRunSummary = {
  worktreeId: string
  experimentSlug: string
  experimentName: string
  run: ResearchProjectRunOverview
  keyMetric: ResearchProjectMetricLast | null
  /** When the Run last changed: finished, else started; 0 when unknown. */
  at: number
}

function timestamp(value: string | null): number {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}

type PrimaryMetric = NonNullable<
  NonNullable<ResearchProjectExperimentOverview['brief']>['primaryMetric']
>

/** The Run's series for exactly the Experiment's primary metric, when it measured it. */
export function primaryMetricSeries(
  run: ResearchProjectRunOverview,
  primary: PrimaryMetric
): ResearchProjectMetricLast | null {
  if (run.metrics.status !== 'present') {
    return null
  }
  return (
    run.metrics.value.series.find(
      (entry) => entry.name === primary.name && (!primary.split || entry.split === primary.split)
    ) ?? null
  )
}

/** The Experiment's primary metric when the Run measured it, else the first series it defines. */
export function runKeyMetric(
  run: ResearchProjectRunOverview,
  experiment: Pick<ResearchProjectExperimentOverview, 'brief'>
): ResearchProjectMetricLast | null {
  if (run.metrics.status !== 'present') {
    return null
  }
  const primary = experiment.brief?.primaryMetric
  return (primary && primaryMetricSeries(run, primary)) || run.metrics.value.series[0] || null
}

export function formatRunMetric(metric: ResearchProjectMetricLast): string {
  const name = metric.split ? `${metric.split} ${metric.name}` : metric.name
  return `${name} ${formatMetricValue(metric.last)}`
}

export function runStateLabel(state: ResearchRunExecutionState): string {
  switch (state) {
    case 'running':
      return 'Running'
    case 'succeeded':
      return 'Finished'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
    case 'unknown':
      return 'Not reported'
  }
}

export function compareRunsNewestFirst(a: PhoneRunSummary, b: PhoneRunSummary): number {
  return (
    Number(b.run.state === 'running') - Number(a.run.state === 'running') ||
    b.at - a.at ||
    a.run.name.localeCompare(b.run.name)
  )
}

/** Every Run the overview lists, running first, then newest. */
export function listPhoneRuns(
  worktreeId: string,
  result: ResearchProjectReadResult
): PhoneRunSummary[] {
  return result.experiments
    .flatMap((experiment) =>
      experiment.runs.map((run) => ({
        worktreeId,
        experimentSlug: experiment.slug,
        experimentName: experiment.name || experiment.slug,
        run,
        keyMetric: runKeyMetric(run, experiment),
        at: Math.max(timestamp(run.finishedAt), timestamp(run.startedAt))
      }))
    )
    .sort(compareRunsNewestFirst)
}
