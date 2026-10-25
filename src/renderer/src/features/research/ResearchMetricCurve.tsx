import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { MetricEvent } from './research-source-reader'
import { chartSegments, emaSmooth, lastEventAtRepeatedX } from './research-metric-chart'
import { metricColumnDecimals } from './research-metric-column-format'
import { ResearchMetricChartPlot, type PlotSeries } from './ResearchMetricChartPlot'

type CurveSeries = { id: string; name: string; events: MetricEvent[] }

// Categorical order from STYLEGUIDE; a sixth series folds into muted ink instead of cycling.
const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)'
]
const FOLDED_COLOR = 'var(--muted-foreground)'
const SMOOTHING = { off: 0, low: 0.6, high: 0.9 } as const
type Smoothing = keyof typeof SMOOTHING

function isSmoothing(value: string): value is Smoothing {
  return value in SMOOTHING
}

/** Metric curves with axes, a crosshair readout, a legend, log scale and smoothing. */
export function ResearchMetricCurve({
  series,
  xLabel,
  valueLabel = 'value'
}: {
  series: CurveSeries[]
  xLabel: string
  /** Names the y-axis for screen readers, e.g. `loss / train`. */
  valueLabel?: string
}): React.JSX.Element {
  const [logY, setLogY] = useState(false)
  const [smoothing, setSmoothing] = useState<Smoothing>('off')
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())

  const prepared = useMemo(
    () =>
      series.map((entry, index) => ({
        id: entry.id,
        name: entry.name,
        color: COLORS[index] ?? FOLDED_COLOR,
        folded: index >= COLORS.length,
        raw: chartSegments(entry.events).map(lastEventAtRepeatedX),
        eventCount: entry.events.length
      })),
    [series]
  )
  const pointCount = prepared.reduce((total, entry) => total + entry.raw.flat().length, 0)
  const repeatedStepEvents =
    prepared.reduce((total, entry) => total + entry.eventCount, 0) - pointCount
  const allValues = prepared.flatMap((entry) => entry.raw.flat().map((point) => point.value))
  const canLog = allValues.length > 0 && allValues.every((value) => value > 0)
  const visible: PlotSeries[] = prepared
    .filter((entry) => !hidden.has(entry.id) && entry.raw.length)
    .map((entry) => ({
      ...entry,
      smoothed:
        smoothing === 'off'
          ? null
          : entry.raw.map((segment) => emaSmooth(segment, SMOOTHING[smoothing]))
    }))

  if (!pointCount) {
    return <p className="text-sm text-muted-foreground">No points for this metric.</p>
  }

  function toggle(id: string): void {
    setHidden((current) => {
      const next = new Set(current)
      if (!next.delete(id)) {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <label
          className={cn('flex items-center gap-1.5', !canLog && 'opacity-50')}
          title={canLog ? undefined : 'Log scale needs every value above zero'}
        >
          <Switch
            checked={logY && canLog}
            disabled={!canLog}
            onCheckedChange={setLogY}
            aria-label="Log scale"
          />
          Log scale
        </label>
        <div className="flex items-center gap-1.5">
          <span id="metric-curve-smoothing">Smoothing</span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="xs"
            value={smoothing}
            onValueChange={(value) => isSmoothing(value) && setSmoothing(value)}
            aria-labelledby="metric-curve-smoothing"
          >
            <ToggleGroupItem value="off">Off</ToggleGroupItem>
            <ToggleGroupItem value="low" title="EMA 0.6">
              Low
            </ToggleGroupItem>
            <ToggleGroupItem value="high" title="EMA 0.9">
              High
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      {visible.length ? (
        <ResearchMetricChartPlot
          series={visible}
          xLabel={xLabel}
          valueLabel={valueLabel}
          logY={logY && canLog}
          decimals={metricColumnDecimals(allValues)}
        />
      ) : (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          Every run is hidden; pick one in the legend.
        </p>
      )}
      {prepared.length > 1 ? (
        <ul aria-label="Legend" className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {prepared.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                aria-pressed={!hidden.has(entry.id)}
                onClick={() => toggle(entry.id)}
                title={hidden.has(entry.id) ? 'Show on the chart' : 'Hide from the chart'}
                className={cn(
                  'flex items-center gap-1.5 rounded-sm px-1 py-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  hidden.has(entry.id) && 'text-muted-foreground line-through'
                )}
              >
                <span
                  aria-hidden
                  className="h-0.5 w-3 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                {entry.name}
                {entry.folded ? <span className="text-muted-foreground">(other)</span> : null}
                {!entry.raw.length ? (
                  <span className="text-muted-foreground">· no points</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {pointCount === 1 ? (
        <p className="text-2xs text-muted-foreground">
          One point so far; the curve fills in as the run logs more.
        </p>
      ) : null}
      {pointCount > 1000 ? (
        <p className="text-2xs text-muted-foreground">
          Display downsampled; table summaries use every parsed value.
        </p>
      ) : null}
      {repeatedStepEvents > 0 ? (
        <p className="text-2xs text-muted-foreground">
          Repeated x-axis values show the last recorded value within each segment; source events are
          unchanged.
        </p>
      ) : null}
    </div>
  )
}
