import { useEffect, useRef, useState } from 'react'
import { newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { moveRun, segmentHandles, type SegmentHandle } from './research-figure-connector-edit'
import { startLiveEdit } from './research-figure-live-edit'
import type { Point } from './research-figure-orthogonal-route'
import { localPoints } from './research-figure-scene-updates'
import type { CanvasViewport } from './ResearchFigureCanvasOverlays'
import type { SettleScene } from './use-figure-inspector'

type View = {
  arrow: string
  path: Point[]
  handles: SegmentHandle[]
  viewport: CanvasViewport
} | null

/** The one selected connector, when it is a plain polyline Aster can bend (not Excalidraw's elbow). */
function viewOf(elements: readonly ExcalidrawElement[], appState: AppState): View {
  const selected = elements.filter(
    (element) => appState.selectedElementIds[element.id] && !element.isDeleted
  )
  const [arrow] = selected
  if (
    selected.length !== 1 ||
    arrow.type !== 'arrow' ||
    ('elbowed' in arrow && arrow.elbowed) ||
    arrow.locked ||
    appState.selectedElementsAreBeingDragged ||
    appState.editingLinearElement ||
    appState.isResizing
  ) {
    return null
  }
  const path = arrow.points.map(([px, py]) => [arrow.x + px, arrow.y + py] as const)
  const handles = segmentHandles(path)
  return handles.length
    ? {
        arrow: arrow.id,
        path,
        handles,
        viewport: {
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
          zoom: appState.zoom.value
        }
      }
    : null
}

/** The scene with the connector's path replaced (its first point is its origin). */
function withPath(
  elements: readonly ExcalidrawElement[],
  id: string,
  path: readonly Point[]
): ExcalidrawElement[] {
  const [x, y] = path[0]
  const points = path.map(([px, py]) => [px - x, py - y] as const)
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  return elements.map((element) =>
    element.id === id && element.type === 'arrow'
      ? newElementWith(element, {
          x,
          y,
          points: localPoints(points),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys)
        })
      : element
  )
}

/**
 * PowerPoint's elbow connector handle for the kit's connectors: one handle on each straight run
 * of a selected connector moves that run sideways, the runs beside it stretch, and an end run
 * keeps its stub at the shape, so the connector stays at right angles and glued. One undo step.
 */
export function ResearchFigureSegmentHandles({
  api,
  settleEdit
}: {
  api: ExcalidrawImperativeAPI | null
  settleEdit: SettleScene
}): React.JSX.Element | null {
  const [view, setView] = useState<View>(null)
  const drag = useRef<{
    x: number
    y: number
    handle: SegmentHandle
    path: Point[]
    last: number
    live: ReturnType<typeof startLiveEdit>
  } | null>(null)
  useEffect(() => {
    if (!api) {
      return
    }
    let frame = 0
    const off = api.onChange((elements, appState) => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        if (!drag.current) {
          setView(viewOf(elements, appState))
        }
      })
    })
    return () => {
      off()
      window.cancelAnimationFrame(frame)
    }
  }, [api])
  if (!api || !view) {
    return null
  }
  const { scrollX, scrollY, zoom } = view.viewport
  const across = (handle: SegmentHandle): number =>
    handle.axis === 'h' ? handle.mid[1] : handle.mid[0]
  return (
    <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden">
      {view.handles.map((handle) => {
        const left = (handle.mid[0] + scrollX) * zoom
        const top = (handle.mid[1] + scrollY) * zoom
        const flat = handle.axis === 'h'
        return (
          <button
            key={handle.run}
            type="button"
            aria-label="Connector segment: drag to move it sideways"
            title="Drag to move this segment sideways; the connector stays at right angles"
            className="research-figure-gap-handle pointer-events-auto absolute"
            style={{
              left: left - (flat ? 8 : 2.5),
              top: top - (flat ? 2.5 : 8),
              width: flat ? 16 : 5,
              height: flat ? 5 : 16,
              cursor: flat ? 'ns-resize' : 'ew-resize'
            }}
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              event.currentTarget.setPointerCapture(event.pointerId)
              drag.current = {
                x: event.clientX,
                y: event.clientY,
                handle,
                path: view.path,
                last: across(handle),
                live: startLiveEdit(api, settleEdit, new Set([view.arrow]))
              }
            }}
            onPointerMove={(event) => {
              const start = drag.current
              if (!start) {
                return
              }
              const delta = (flat ? event.clientY - start.y : event.clientX - start.x) / zoom
              const at = Math.round(across(start.handle) + delta)
              if (at !== start.last) {
                start.last = at
                const path = moveRun(start.path, start.handle.run, at)
                start.live.preview((elements) => withPath(elements, view.arrow, path))
              }
            }}
            onPointerCancel={() => {
              drag.current?.live.cancel()
              drag.current = null
            }}
            onPointerUp={(event) => {
              const start = drag.current
              drag.current = null
              event.currentTarget.releasePointerCapture(event.pointerId)
              if (start && start.last !== across(start.handle)) {
                const path = moveRun(start.path, start.handle.run, start.last)
                start.live.finish((elements) => withPath(elements, view.arrow, path))
              }
            }}
          />
        )
      })}
    </div>
  )
}
