import { useRef } from 'react'
import type { ResearchProjectMetricPoint } from '../../../shared/research/research-project-api'

const HEIGHT = 36
const PAD = 4

/** Where each point sits, as fractions of the plot's width and height (0 = top). */
export function sparklinePositions(
  points: readonly ResearchProjectMetricPoint[]
): { x: number; y: number }[] {
  if (points.length === 0) {
    return []
  }
  const values = points.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  // Why steps when every point has one: logging can skip steps, so spacing follows them.
  const steps = points.every((point) => point.step !== null)
    ? points.map((point) => point.step ?? 0)
    : points.map((_, index) => index)
  const first = steps[0]
  const width = (steps.at(-1) ?? first) - first
  return points.map((point, index) => ({
    x:
      width > 0
        ? (steps[index] - first) / width
        : points.length === 1
          ? 1
          : index / (points.length - 1),
    y: span > 0 ? 1 - (point.value - min) / span : 0.5
  }))
}

/**
 * One metric's trend as a 2px line in ink, its newest point marked. Dragging along it reports the
 * nearest point, so the cell above can read that value out instead of the newest.
 */
export function PhoneMetricSparkline({
  points,
  active,
  onScrub,
  label
}: {
  points: readonly ResearchProjectMetricPoint[]
  active: number | null
  onScrub: (index: number | null) => void
  label: string
}): React.JSX.Element | null {
  const frame = useRef<HTMLDivElement>(null)
  const positions = sparklinePositions(points)
  if (positions.length < 2) {
    return null
  }
  const scrub = (clientX: number): void => {
    const rect = frame.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) {
      return
    }
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    let nearest = 0
    positions.forEach((position, index) => {
      if (Math.abs(position.x - fraction) < Math.abs(positions[nearest].x - fraction)) {
        nearest = index
      }
    })
    onScrub(nearest)
  }
  const marked = positions[active ?? positions.length - 1]
  const toY = (y: number): number => PAD + y * (HEIGHT - PAD * 2)
  return (
    <div
      ref={frame}
      role="img"
      aria-label={label}
      className="relative mt-2 touch-pan-y text-foreground"
      style={{ height: HEIGHT }}
      onPointerDown={(event) => scrub(event.clientX)}
      onPointerMove={(event) => event.buttons > 0 && scrub(event.clientX)}
      onPointerUp={() => onScrub(null)}
      onPointerLeave={() => onScrub(null)}
      onPointerCancel={() => onScrub(null)}
    >
      <svg
        className="absolute inset-0 size-full overflow-visible"
        viewBox={`0 0 100 ${HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <polyline
          points={positions
            .map((p) => `${(p.x * 100).toFixed(2)},${toY(p.y).toFixed(2)}`)
            .join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {active !== null ? (
        <span
          aria-hidden
          className="absolute inset-y-0 w-px bg-border"
          style={{ left: `${marked.x * 100}%` }}
        />
      ) : null}
      <span
        aria-hidden
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-card"
        style={{ left: `${marked.x * 100}%`, top: toY(marked.y) }}
      />
    </div>
  )
}
