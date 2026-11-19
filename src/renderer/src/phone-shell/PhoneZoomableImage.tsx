import { useRef, useState } from 'react'

type View = { scale: number; x: number; y: number }
type Point = { x: number; y: number }

const MIN_SCALE = 1
const MAX_SCALE = 8
const DOUBLE_TAP_MS = 300
const REST: View = { scale: 1, x: 0, y: 0 }

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** Keeps the content point under `from` (at `start`) under `to` at `scale`. */
function zoomAbout(start: View, from: Point, to: Point, scale: number, center: Point): View {
  const ratio = scale / start.scale
  return {
    scale,
    x: to.x - center.x - (from.x - center.x - start.x) * ratio,
    y: to.y - center.y - (from.y - center.y - start.y) * ratio
  }
}

/**
 * An image the person can pinch to zoom, drag when zoomed, and double-tap to zoom in or back.
 * Owns its gestures (touch-action none), so the page itself never zooms.
 */
export function PhoneZoomableImage({ src, alt }: { src: string; alt: string }): React.JSX.Element {
  const [view, setRenderedView] = useState<View>(REST)
  // Why a ref too: pointer events can land faster than renders, so each one reads the latest view.
  const current = useRef<View>(REST)
  const setView = (next: View): void => {
    current.current = next
    setRenderedView(next)
  }
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<{ start: View; from: Point; spread: number } | null>(null)
  const lastTap = useRef(0)
  const frame = useRef<HTMLDivElement>(null)

  const center = (): Point => {
    const rect = frame.current?.getBoundingClientRect()
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 0, y: 0 }
  }
  const begin = (): void => {
    const points = [...pointers.current.values()]
    gesture.current =
      points.length >= 2
        ? {
            start: current.current,
            from: midpoint(points[0], points[1]),
            spread: distance(points[0], points[1])
          }
        : points.length === 1
          ? { start: current.current, from: points[0], spread: 0 }
          : null
  }

  return (
    <div
      ref={frame}
      className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden select-none"
      onPointerDown={(event) => {
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // Why: a pointer the browser no longer tracks cannot be captured; the gesture still runs.
        }
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (pointers.current.size === 1) {
          const now = Date.now()
          if (now - lastTap.current < DOUBLE_TAP_MS) {
            const tap = { x: event.clientX, y: event.clientY }
            setView(
              current.current.scale > 1 ? REST : zoomAbout(current.current, tap, tap, 2.5, center())
            )
            lastTap.current = 0
          } else {
            lastTap.current = now
          }
        }
        begin()
      }}
      onPointerMove={(event) => {
        if (!pointers.current.has(event.pointerId) || !gesture.current) {
          return
        }
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
        const points = [...pointers.current.values()]
        const { start, from, spread } = gesture.current
        if (points.length >= 2 && spread > 0) {
          const scale = Math.min(
            MAX_SCALE,
            Math.max(MIN_SCALE, (start.scale * distance(points[0], points[1])) / spread)
          )
          setView(zoomAbout(start, from, midpoint(points[0], points[1]), scale, center()))
        } else if (points.length === 1 && start.scale > 1) {
          setView({
            ...start,
            x: start.x + points[0].x - from.x,
            y: start.y + points[0].y - from.y
          })
        }
      }}
      onPointerUp={(event) => {
        pointers.current.delete(event.pointerId)
        if (pointers.current.size === 0 && current.current.scale < 1.05) {
          setView(REST)
        }
        begin()
      }}
      onPointerCancel={(event) => {
        pointers.current.delete(event.pointerId)
        begin()
      }}
      data-phone-zoom-scale={view.scale.toFixed(2)}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="size-full object-contain will-change-transform"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      />
    </div>
  )
}
