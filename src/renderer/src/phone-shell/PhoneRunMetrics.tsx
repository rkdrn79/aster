import { useState } from 'react'
import { formatMetricValue } from '@/features/research/research-experiment-workspace-summary-format'
import type { ResearchProjectMetricSeries } from '../../../shared/research/research-project-api'
import { PhoneSectionNote } from './PhoneListLayout'
import { PhoneMetricSparkline } from './PhoneMetricSparkline'

function bestValue(series: ResearchProjectMetricSeries): number | null {
  if (series.points.length === 0 || !series.direction) {
    return null
  }
  const values = series.points.map((point) => point.value)
  return series.direction === 'maximize' ? Math.max(...values) : Math.min(...values)
}

function seriesName(series: ResearchProjectMetricSeries): string {
  return series.split ? `${series.split} ${series.name}` : series.name
}

/** One metric: its newest value (or the point being scrubbed), best and step, and its trend. */
function MetricCell({ series }: { series: ResearchProjectMetricSeries }): React.JSX.Element {
  const [active, setActive] = useState<number | null>(null)
  const shown = series.points[active ?? series.points.length - 1]
  const best = bestValue(series)
  const name = seriesName(series)
  return (
    <div className="min-w-0 px-4 py-3.5" data-phone-metric={name}>
      <p className="truncate text-xs text-muted-foreground">{name}</p>
      <p className="mt-0.5 text-2xl leading-tight font-semibold tabular-nums">
        {shown ? formatMetricValue(shown.value) : '—'}
      </p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
        {[
          active === null && best !== null && shown && best !== shown.value
            ? `best ${formatMetricValue(best)}`
            : null,
          shown?.step !== null && shown?.step !== undefined ? `step ${shown.step}` : null
        ]
          .filter(Boolean)
          .join(' · ') || `${series.count} points`}
      </p>
      <PhoneMetricSparkline
        points={series.points}
        active={active}
        onScrub={setActive}
        label={`${name} over ${series.count} points`}
      />
    </div>
  )
}

/** Every recorded metric of a Run, two to a row, each with its trend line. */
export function PhoneRunMetrics({
  series
}: {
  series: readonly ResearchProjectMetricSeries[]
}): React.JSX.Element {
  if (series.length === 0) {
    return <PhoneSectionNote>No metrics recorded yet</PhoneSectionNote>
  }
  return (
    <div className="grid grid-cols-2 [&>*]:border-border [&>*:nth-child(n+3)]:border-t [&>*:nth-child(odd):last-child]:col-span-2 [&>*:nth-child(odd):not(:last-child)]:border-r">
      {series.map((entry) => (
        <MetricCell key={`${entry.split ?? ''}/${entry.name}`} series={entry} />
      ))}
    </div>
  )
}
