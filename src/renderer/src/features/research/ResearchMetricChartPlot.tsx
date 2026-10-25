import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatMetricInColumn } from './research-metric-column-format'
import {
  downsampleForDisplay,
  formatTick,
  logTicks,
  nearestIndex,
  niceTicks,
  valueAtX,
  type ChartPoint
} from './research-metric-chart'

export type PlotSeries = {
  id: string
  name: string
  color: string
  /** Beyond the five categorical colors: drawn in muted ink, still listed in the tooltip. */
  folded: boolean
  raw: ChartPoint[][]
  /** Smoothed segments when smoothing is on; raw then draws faintly underneath. */
  smoothed: ChartPoint[][] | null
}

const HEIGHT = 228
const MARGIN = { top: 10, right: 18, bottom: 36 }
const FALLBACK_WIDTH = 600

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(FALLBACK_WIDTH)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry?.contentRect.width ?? 0)
      if (next > 0) {
        setWidth(next)
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

function pathOf(
  segments: ChartPoint[][],
  x: (value: number) => number,
  y: (value: number) => number | null
): string {
  let d = ''
  for (const segment of segments) {
    let pen = false
    for (const point of downsampleForDisplay(segment)) {
      const py = Number.isFinite(point.value) ? y(point.value) : null
      if (py === null) {
        pen = false
        continue
      }
      d += `${pen ? 'L' : 'M'}${x(point.x).toFixed(1)} ${py.toFixed(1)}`
      pen = true
    }
  }
  return d
}

/** Axes, gridlines, lines and a crosshair readout; arrow keys move the crosshair. */
export function ResearchMetricChartPlot({
  series,
  xLabel,
  valueLabel,
  logY,
  decimals
}: {
  series: PlotSeries[]
  xLabel: string
  valueLabel: string
  logY: boolean
  decimals: number
}): React.JSX.Element {
  const [containerRef, width] = useWidth()
  const [activeX, setActiveX] = useState<number | null>(null)
  const [fromKeyboard, setFromKeyboard] = useState(false)

  const frame = useMemo(() => {
    const points = series.flatMap((entry) => entry.raw.flat())
    // Why loops, not Math.min(...): long runs have more points than a call can take arguments.
    let [xMin, xMax, yMin, yMax] = [Infinity, -Infinity, Infinity, -Infinity]
    for (const point of points) {
      xMin = Math.min(xMin, point.x)
      xMax = Math.max(xMax, point.x)
      if (Number.isFinite(point.value) && (!logY || point.value > 0)) {
        yMin = Math.min(yMin, point.value)
        yMax = Math.max(yMax, point.value)
      }
    }
    if (xMin === xMax) {
      const pad = Math.abs(xMin) * 0.1 || 1
      xMin -= pad
      xMax += pad
    }
    const yTicks = logY ? logTicks(yMin, yMax) : niceTicks(yMin, yMax, 5)
    const yStep = logY ? 0 : (yTicks[1] ?? 0) - (yTicks[0] ?? 0)
    const yLabels = yTicks.map((tick) => formatTick(tick, logY ? tick : yStep))
    const xs = [...new Set(points.map((point) => point.x))].sort((a, b) => a - b)
    return { xMin, xMax, yTicks, yLabels, xs }
  }, [series, logY])

  const left = Math.max(28, Math.max(...frame.yLabels.map((label) => label.length)) * 6 + 12)
  const plotWidth = Math.max(40, width - left - MARGIN.right)
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom
  const yLow = frame.yTicks[0] ?? 0
  const yHigh = frame.yTicks.at(-1) ?? 1
  const x = (value: number): number =>
    left + ((value - frame.xMin) / (frame.xMax - frame.xMin)) * plotWidth
  const y = (value: number): number | null => {
    if (logY) {
      if (value <= 0) {
        return null
      }
      const span = Math.log10(yHigh) - Math.log10(yLow) || 1
      return MARGIN.top + (1 - (Math.log10(value) - Math.log10(yLow)) / span) * plotHeight
    }
    return MARGIN.top + (1 - (value - yLow) / (yHigh - yLow || 1)) * plotHeight
  }
  const xStep = niceTicks(frame.xMin, frame.xMax, Math.max(2, Math.floor(plotWidth / 90)))
  const xTicks = xStep.filter((tick) => tick >= frame.xMin && tick <= frame.xMax)
  const xTickStep = (xStep[1] ?? 1) - (xStep[0] ?? 0)

  const readout =
    activeX === null
      ? []
      : series.map((entry) => ({
          entry,
          point: valueAtX(entry.smoothed ?? entry.raw, activeX),
          raw: entry.smoothed ? valueAtX(entry.raw, activeX) : null
        }))

  function moveTo(index: number): void {
    const next = frame.xs[Math.max(0, Math.min(frame.xs.length - 1, index))]
    setActiveX(next ?? null)
  }

  function onKeyDown(event: React.KeyboardEvent): void {
    const current = activeX === null ? -1 : frame.xs.indexOf(activeX)
    const jump = event.shiftKey ? 10 : 1
    const moves: Record<string, number> = {
      ArrowRight: current < 0 ? 0 : current + jump,
      ArrowLeft: current < 0 ? frame.xs.length - 1 : current - jump,
      Home: 0,
      End: frame.xs.length - 1
    }
    if (event.key in moves) {
      event.preventDefault()
      setFromKeyboard(true)
      moveTo(moves[event.key])
    } else if (event.key === 'Escape') {
      setActiveX(null)
    }
  }

  function onPointerMove(event: React.PointerEvent<SVGRectElement>): void {
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - bounds.left) / (bounds.width || 1)
    const target = frame.xMin + ratio * (frame.xMax - frame.xMin)
    setFromKeyboard(false)
    moveTo(nearestIndex(frame.xs, target))
  }

  const activeLeft = activeX === null ? 0 : x(activeX)
  const tooltipOnLeft = activeLeft > left + plotWidth / 2
  const readoutText = readout
    .flatMap(({ entry, point }) =>
      point ? [`${entry.name} ${formatMetricInColumn(point.value, decimals)}`] : []
    )
    .join(', ')

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="group"
      aria-label={`${valueLabel} over ${xLabel}. Arrow keys read values at each ${xLabel}.`}
      onKeyDown={onKeyDown}
      onBlur={() => fromKeyboard && setActiveX(null)}
      className="relative rounded-md border border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`Metric curve over ${xLabel}`}
        className="block max-w-full select-none text-muted-foreground"
      >
        {frame.yTicks.map((tick, index) => {
          const py = y(tick)
          return py === null ? null : (
            <g key={`y${tick}`}>
              <line x1={left} x2={left + plotWidth} y1={py} y2={py} stroke="var(--border)" />
              <text
                x={left - 6}
                y={py}
                dy="0.32em"
                textAnchor="end"
                fontSize={10}
                fill="currentColor"
              >
                {frame.yLabels[index]}
              </text>
            </g>
          )
        })}
        {xTicks.map((tick) => (
          <text
            key={`x${tick}`}
            x={x(tick)}
            y={HEIGHT - MARGIN.bottom + 14}
            textAnchor="middle"
            fontSize={10}
            fill="currentColor"
          >
            {formatTick(tick, xTickStep)}
          </text>
        ))}
        <text
          x={left + plotWidth / 2}
          y={HEIGHT - 5}
          textAnchor="middle"
          fontSize={10}
          fill="currentColor"
        >
          {xLabel}
        </text>
        {series.map((entry) => (
          <g
            key={entry.id}
            stroke={entry.color}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            <path
              d={pathOf(entry.raw, x, y)}
              strokeWidth={entry.folded ? 1.5 : 2}
              strokeOpacity={entry.smoothed ? 0.25 : entry.folded ? 0.6 : 1}
            />
            {entry.smoothed ? (
              <path d={pathOf(entry.smoothed, x, y)} strokeWidth={entry.folded ? 1.5 : 2} />
            ) : null}
            {entry.raw
              .filter((segment) => segment.length === 1)
              .map((segment, index) => {
                const py = y(segment[0].value)
                return py === null ? null : (
                  <circle
                    key={index}
                    cx={x(segment[0].x)}
                    cy={py}
                    r={3}
                    fill={entry.color}
                    stroke="none"
                  />
                )
              })}
          </g>
        ))}
        {activeX !== null ? (
          <g pointerEvents="none">
            <line
              x1={activeLeft}
              x2={activeLeft}
              y1={MARGIN.top}
              y2={MARGIN.top + plotHeight}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.5}
            />
            {readout.map(({ entry, point }) => {
              const py = point ? y(point.value) : null
              return py === null || !point ? null : (
                <circle
                  key={entry.id}
                  cx={x(point.x)}
                  cy={py}
                  r={3.5}
                  fill={entry.color}
                  stroke="var(--background)"
                  strokeWidth={2}
                />
              )
            })}
          </g>
        ) : null}
        <rect
          x={left}
          y={MARGIN.top}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActiveX(null)}
        />
      </svg>
      {activeX !== null ? (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-md border border-border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-sm"
          style={tooltipOnLeft ? { right: width - activeLeft + 10 } : { left: activeLeft + 10 }}
        >
          <p className="mb-1 text-muted-foreground">
            {xLabel} {activeX}
          </p>
          <ul className="space-y-0.5">
            {readout.map(({ entry, point, raw }) => (
              <li key={entry.id} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-0.5 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="font-medium tabular-nums">
                  {point ? formatMetricInColumn(point.value, decimals) : '—'}
                </span>
                {raw && point ? (
                  <span className="tabular-nums text-muted-foreground">
                    raw {formatMetricInColumn(raw.value, decimals)}
                  </span>
                ) : null}
                <span className="ml-auto max-w-40 truncate pl-2 text-muted-foreground">
                  {entry.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {fromKeyboard && activeX !== null ? `${xLabel} ${activeX}: ${readoutText}` : ''}
      </p>
    </div>
  )
}
