import { formatMetricValue } from '@/features/research/research-experiment-workspace-summary-format'
import { primaryMetricSeries } from './phone-run-summaries'
import type {
  ResearchProjectExperimentOverview,
  ResearchProjectReadResult,
  ResearchProjectRunOverview
} from '../../../shared/research/research-project-api'
import type { ResearchExperimentBrief } from '../../../shared/research/research-experiment-brief'

type PrimaryMetric = NonNullable<ResearchExperimentBrief['primaryMetric']>

export type PhoneMeasuredRun = { run: ResearchProjectRunOverview; value: number }

/** Where an Experiment stands on its primary metric: its best Run against its baseline. */
export type PhoneExperimentStanding = {
  /** `val acc`. */
  metric: string
  direction: PrimaryMetric['direction']
  best: PhoneMeasuredRun | null
  /** Null when the brief names no baseline. */
  baseline: {
    reference: string
    run: ResearchProjectRunOverview | null
    value: number | null
  } | null
}

export function primaryMetricLabel(primary: PrimaryMetric): string {
  return primary.split ? `${primary.split} ${primary.name}` : primary.name
}

/** Null when the brief names no primary metric, since "best" then means nothing. */
export function experimentStanding(
  experiment: Pick<ResearchProjectExperimentOverview, 'brief' | 'runs'>,
  result: Pick<ResearchProjectReadResult, 'experiments'>
): PhoneExperimentStanding | null {
  const primary = experiment.brief?.primaryMetric
  if (!primary) {
    return null
  }
  const better = (a: number, b: number): boolean =>
    primary.direction === 'maximize' ? a > b : a < b
  let best: PhoneMeasuredRun | null = null
  for (const run of experiment.runs) {
    const value = primaryMetricSeries(run, primary)?.last ?? null
    if (value !== null && (!best || better(value, best.value))) {
      best = { run, value }
    }
  }
  const reference = experiment.brief?.baseline?.trim() || null
  let baseline: PhoneExperimentStanding['baseline'] = null
  if (reference) {
    // Why the first slash: a reference is `<experiment slug>/<run id>`, and neither holds one.
    const slash = reference.indexOf('/')
    const owner =
      slash > 0
        ? result.experiments.find((entry) => entry.slug === reference.slice(0, slash))
        : undefined
    const run = owner?.runs.find((entry) => entry.id === reference.slice(slash + 1)) ?? null
    baseline = {
      reference,
      run,
      value: run ? (primaryMetricSeries(run, primary)?.last ?? null) : null
    }
  }
  return { metric: primaryMetricLabel(primary), direction: primary.direction, best, baseline }
}

/**
 * "0.032 above the baseline", and whether the best Run beats it; `beats` is null when there is
 * nothing to beat: the baseline is itself the best Run, or level with it.
 */
export function standingVersusBaseline(
  standing: PhoneExperimentStanding
): { text: string; beats: boolean | null } | null {
  const { best, baseline } = standing
  if (!best || baseline?.value == null || !baseline.run) {
    return null
  }
  if (best.run.id === baseline.run.id) {
    return { text: 'The baseline is still the best Run', beats: null }
  }
  const delta = best.value - baseline.value
  if (delta === 0) {
    return { text: 'Level with the baseline', beats: null }
  }
  return {
    text: `${formatMetricValue(Math.abs(delta))} ${delta > 0 ? 'above' : 'below'} the baseline`,
    beats: standing.direction === 'maximize' ? delta > 0 : delta < 0
  }
}
