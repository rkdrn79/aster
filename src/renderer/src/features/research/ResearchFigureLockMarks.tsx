import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { Lock } from 'lucide-react'
import { lockedSpots, unlockElements, type LockedSpot } from './research-figure-lock'
import { viewportBox, type CanvasViewport } from './ResearchFigureCanvasOverlays'

/** The smallest locked thing under a scene point (a box on a locked panel wins over the panel). */
function spotAt(spots: readonly LockedSpot[], x: number, y: number): LockedSpot | null {
  const under = spots.filter(
    ({ box }) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height
  )
  return (
    under.toSorted((a, b) => a.box.width * a.box.height - b.box.width * b.box.height)[0] ?? null
  )
}

/**
 * Figma's lock in the layers row, on the canvas: hovering a locked thing shows a small lock at
 * its corner, and clicking the lock unlocks it (one undo step). Locked things take no clicks, so
 * without this a person cannot tell why a panel no longer moves.
 */
export function useFigureLockHover(apiRef: React.RefObject<ExcalidrawImperativeAPI | null>) {
  const [spot, setSpot] = useState<LockedSpot | null>(null)
  const frame = useRef(0)
  const overMark = useRef(false)
  useEffect(() => () => window.cancelAnimationFrame(frame.current), [])
  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (event.buttons || overMark.current) {
        return
      }
      const { clientX, clientY } = event
      window.cancelAnimationFrame(frame.current)
      frame.current = window.requestAnimationFrame(() => {
        const api = apiRef.current
        if (!api) {
          return
        }
        const state = api.getAppState()
        const x = (clientX - state.offsetLeft) / state.zoom.value - state.scrollX
        const y = (clientY - state.offsetTop) / state.zoom.value - state.scrollY
        const next = spotAt(lockedSpots(api.getSceneElements()), x, y)
        setSpot((current) => (current?.key === next?.key ? current : next))
      })
    },
    [apiRef]
  )
  const onPointerLeave = useCallback(() => {
    if (!overMark.current) {
      setSpot(null)
    }
  }, [])
  return { spot, setSpot, overMark, onPointerMove, onPointerLeave }
}

export function ResearchFigureLockMark({
  hover,
  viewport,
  api
}: {
  hover: ReturnType<typeof useFigureLockHover>
  viewport: CanvasViewport
  api: () => ExcalidrawImperativeAPI | null
}): React.JSX.Element | null {
  const { spot } = hover
  if (!spot) {
    return null
  }
  const box = viewportBox(spot.box, viewport)
  return (
    <button
      type="button"
      aria-label="Locked: click to unlock"
      title="Locked: click to unlock (⌥⌘L)"
      className="research-canvas-island research-canvas-tool absolute z-[5] flex size-5 items-center justify-center rounded-md [&_svg]:size-2.5"
      // Why the top-left corner: badges sit on the top-right one.
      style={{ left: box.x - 10, top: box.y - 10 }}
      onPointerEnter={() => {
        hover.overMark.current = true
      }}
      onPointerLeave={() => {
        hover.overMark.current = false
      }}
      onClick={() => {
        const current = api()
        hover.overMark.current = false
        hover.setSpot(null)
        if (current) {
          unlockElements(current, spot.ids)
        }
      }}
    >
      <Lock aria-hidden />
    </button>
  )
}
