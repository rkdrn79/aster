import type { ResearchRunSummary } from '../../../../shared/research/research-run-summary'
import { metricColumnDecimals } from './research-metric-column-format'

export type SummaryValueMode = 'last' | 'best'

/** Four significant digits, so `0.830000001` reads `0.83`. */
export function formatMetricValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(4)))
}

/**
 * One precision for the primary metric wherever the notebook shows it (Results, planned Runs), from
 * every last and best value the summaries hold.
 */
export function primaryMetricDecimals(summaries: Iterable<ResearchRunSummary | null>): number {
  const values: number[] = []
  for (const summary of summaries) {
    const primary = summary?.primary
    for (const point of [primary?.last, primary?.best]) {
      if (point) {
        values.push(point.value)
      }
    }
  }
  return metricColumnDecimals(values)
}

/** `val acc` for the primary metric the summaries measured, or null when none did. */
export function summaryMetricLabel(
  summaries: Iterable<ResearchRunSummary | null>
): { label: string; direction: 'minimize' | 'maximize' } | null {
  for (const summary of summaries) {
    const primary = summary?.primary
    if (primary) {
      return {
        label: primary.split ? `${primary.split} ${primary.metric}` : primary.metric,
        direction: primary.direction
      }
    }
  }
  return null
}

/**
 * The Run's difference from the baseline, only when its summary was computed against `reference`;
 * a summary from before a baseline change would otherwise show the old difference.
 */
export function summaryBaselineDelta(
  summary: ResearchRunSummary | null | undefined,
  reference: string | null,
  mode: SummaryValueMode
): number | null {
  const baseline = summary?.baseline
  return baseline && reference && baseline.run === reference ? baseline.delta[mode] : null
}

export function summaryMediaTotal(summary: ResearchRunSummary | null | undefined): number {
  return summary ? summary.media.image + summary.media.video + summary.media.audio : 0
}

export function summaryMediaText(summary: ResearchRunSummary): string {
  const { image, video, audio } = summary.media
  return [
    image ? `${image} ${image === 1 ? 'image' : 'images'}` : null,
    video ? `${video} ${video === 1 ? 'video' : 'videos'}` : null,
    audio ? `${audio} audio` : null
  ]
    .filter(Boolean)
    .join(', ')
}
