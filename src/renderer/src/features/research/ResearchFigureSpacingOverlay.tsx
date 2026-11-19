import { useEffect, useRef, useState } from 'react'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { FIGURE_UNITS_PER_POINT } from '../../../../research-harness/research-figures-model.mjs'
import { setUnitsGap, unitsBox } from './research-figure-align'
import { selectionUnits } from './research-figure-geometry-edit'
import { startLiveEdit } from './research-figure-live-edit'
import {
  dragSpacing,
  gapHandles,
  spacingNeighbours,
  type GapHandle,
  type SpacingMark
} from './research-figure-spacing'
import type { CanvasViewport } from './ResearchFigureCanvasOverlays'
import type { SettleScene } from './use-figure-inspector'

type View = { marks: SpacingMark[]; handles: GapHandle[]; viewport: CanvasViewport }
const EMPTY: View = { marks: [], handles: [], viewport: { scrollX: 0, scrollY: 0, zoom: 1 } }

const pt = (units: number): string => `${Math.round((units / FIGURE_UNITS_PER_POINT) * 10) / 10} pt`

function selectedOf(elements: readonly ExcalidrawElement[], appState: AppState) {
  return elements.filter((element) => appState.selectedElementIds[element.id] && !element.isDeleted)
}

/** What to draw for this canvas state: distances while dragging, gap handles when still. */
function viewOf(elements: readonly ExcalidrawElement[], appState: AppState): View {
  const viewport = {
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    zoom: appState.zoom.value
  }
  const selected = selectedOf(elements, appState)
  if (!selected.length || appState.isResizing || appState.editingTextElement) {
    return { ...EMPTY, viewport }
  }
  const units = selectionUnits(selected, elements)
  if (appState.selectedElementsAreBeingDragged) {
    const moving = unitsBox(units)
    const ids = new Set(units.flatMap((unit) => unit.members.map((member) => member.id)))
    return {
      marks: moving ? dragSpacing(moving, spacingNeighbours(elements, ids)) : [],
      handles: [],
      viewport
    }
  }
  return { marks: [], handles: gapHandles(units), viewport }
}

const toPx = (value: number, scroll: number, zoom: number): number => (value + scroll) * zoom

function Mark({ mark, viewport }: { mark: SpacingMark; viewport: CanvasViewport }) {
  const { scrollX, scrollY, zoom } = viewport
  const horizontal = mark.axis === 'x'
  const a = toPx(mark.from, horizontal ? scrollX : scrollY, zoom)
  const b = toPx(mark.to, horizontal ? scrollX : scrollY, zoom)
  const across = toPx(mark.at, horizontal ? scrollY : scrollX, zoom)
  const line = horizontal
    ? { left: a, top: across, width: Math.max(1, b - a), height: 1 }
    : { left: across, top: a, width: 1, height: Math.max(1, b - a) }
  const middle = (a + b) / 2
  return (
    <>
      <span className="research-figure-measure-line absolute" style={line} />
      <span
        className="research-figure-measure-pill absolute"
        style={
          horizontal
            ? { left: middle, top: across - 20, transform: 'translateX(-50%)' }
            : { left: across + 6, top: middle - 8 }
        }
      >
        {mark.equal ? '= ' : ''}
        {pt(mark.gap)}
      </span>
    </>
  )
}

/**
 * Spacing you can see (Figma's smart selection, PowerPoint's smart guides): while a selection is
 * dragged, its distance in points to the nearest box on each side, with equal gaps marked; with
 * three or more evenly spaced things selected, a handle in each gap that moves every gap at once.
 */
export function ResearchFigureSpacingOverlay({
  api,
  settleEdit
}: {
  api: ExcalidrawImperativeAPI | null
  settleEdit: SettleScene
}): React.JSX.Element | null {
  const [view, setView] = useState<View>(EMPTY)
  const [dragging, setDragging] = useState<number | null>(null)
  const drag = useRef<{
    x: number
    y: number
    gap: number
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
      frame = window.requestAnimationFrame(() => setView(viewOf(elements, appState)))
    })
    return () => {
      off()
      window.cancelAnimationFrame(frame)
    }
  }, [api])
  if (!api || (!view.marks.length && !view.handles.length)) {
    return null
  }
  /** The scene with every gap between the selected units at `gap` scene units. */
  const withGap =
    (gap: number) =>
    (elements: readonly ExcalidrawElement[]): ExcalidrawElement[] => {
      const selected = selectedOf(elements, api.getAppState())
      return setUnitsGap(elements, selectionUnits(selected, elements), gap)
    }
  const { zoom } = view.viewport
  return (
    <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden">
      {view.marks.map((mark) => (
        <Mark key={`${mark.axis}-${mark.from}-${mark.to}`} mark={mark} viewport={view.viewport} />
      ))}
      {view.handles.map((handle) => {
        const left = toPx(handle.x, view.viewport.scrollX, zoom)
        const top = toPx(handle.y, view.viewport.scrollY, zoom)
        const across = handle.axis === 'y'
        const shown = dragging === handle.index
        return (
          <div key={handle.index}>
            <button
              type="button"
              aria-label={`Gap ${pt(handle.gap)}: drag to change every gap`}
              title={`Gap ${pt(handle.gap)}: drag to change every gap`}
              data-dragging={shown ? '' : undefined}
              className="research-figure-gap-handle pointer-events-auto absolute"
              style={{
                left: left - (across ? 8 : 2.5),
                top: top - (across ? 2.5 : 8),
                width: across ? 16 : 5,
                height: across ? 5 : 16,
                cursor: across ? 'ns-resize' : 'ew-resize'
              }}
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                event.currentTarget.setPointerCapture(event.pointerId)
                const selected = selectedOf(api.getSceneElements(), api.getAppState())
                drag.current = {
                  x: event.clientX,
                  y: event.clientY,
                  gap: handle.gap,
                  last: handle.gap,
                  live: startLiveEdit(
                    api,
                    settleEdit,
                    new Set(selected.map((element) => element.id))
                  )
                }
                setDragging(handle.index)
              }}
              onPointerMove={(event) => {
                const start = drag.current
                if (!start) {
                  return
                }
                const delta = (across ? event.clientY - start.y : event.clientX - start.x) / zoom
                // Why whole units: a gap moves in half-point steps, as the Inspector's Gap field.
                const gap = Math.max(0, Math.round(start.gap + delta))
                if (gap !== start.last) {
                  start.last = gap
                  start.live.preview(withGap(gap))
                }
              }}
              onPointerCancel={() => {
                drag.current?.live.cancel()
                drag.current = null
                setDragging(null)
              }}
              onPointerUp={(event) => {
                const start = drag.current
                drag.current = null
                setDragging(null)
                event.currentTarget.releasePointerCapture(event.pointerId)
                if (start && start.last !== start.gap) {
                  start.live.finish(withGap(start.last))
                }
              }}
            />
            {shown ? (
              <span
                className="research-figure-measure-pill absolute"
                style={
                  across ? { left: left + 12, top: top - 8 } : { left: left - 16, top: top + 12 }
                }
              >
                {pt(handle.gap)}
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
