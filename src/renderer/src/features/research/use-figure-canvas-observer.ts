import { useCallback, useState } from 'react'
import { hashElementsVersion } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState } from '@excalidraw/excalidraw/types'
import { NO_SELECTION, selectionInfo, type SelectionInfo } from './research-figure-editor-config'
import { elementsOutsidePage } from './research-figure-page-bounds'
import type { CanvasViewport, SceneBox } from './ResearchFigureCanvasOverlays'

export type FrameBox = SceneBox & { id: string }
/** The selection and the scene around it, for the Inspector; `key` changes when either does. */
export type Inspected = {
  key: string
  selected: readonly ExcalidrawElement[]
  elements: readonly ExcalidrawElement[]
}
const NOTHING: Inspected = { key: '', selected: [], elements: [] }

/** A lone selected text holding `$…$`, which can be typeset as math. */
export type MathCandidate = FrameBox | null
export type PageCheck = { page: SceneBox | null; outside: string[] }

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * What the chrome around the canvas shows, read from each Excalidraw change: frames (areas),
 * the selection summary, the viewport, what reaches past the page, and the selected ids.
 */
export function useFigureCanvasObserver() {
  const [selection, setSelection] = useState<SelectionInfo>(NO_SELECTION)
  const [viewport, setViewport] = useState<CanvasViewport>({ scrollX: 0, scrollY: 0, zoom: 1 })
  const [frames, setFrames] = useState<FrameBox[]>([])
  const [pageCheck, setPageCheck] = useState<PageCheck>({ page: null, outside: [] })
  /** Changes whenever a selected element changes, so panels about the selection re-read it. */
  const [selectionKey, setSelectionKey] = useState('')
  const [mathCandidate, setMathCandidate] = useState<MathCandidate>(null)
  const [inspected, setInspected] = useState<Inspected>(NOTHING)
  const [toggles, setToggles] = useState({ grid: true, snap: true })

  const observe = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState): FrameBox[] => {
      const boxes = elements
        .filter((element) => element.type === 'frame' && !element.isDeleted)
        .map(({ id, x, y, width, height }) => ({ id, x, y, width, height }))
      setFrames((current) => (sameJson(current, boxes) ? current : boxes))
      const info = selectionInfo(elements, appState)
      setSelection((current) =>
        current.count === info.count &&
        current.frameId === info.frameId &&
        current.fontPt === info.fontPt &&
        current.style === info.style &&
        current.accent === info.accent
          ? current
          : info
      )
      const selected = elements.filter(
        (element) => appState.selectedElementIds[element.id] && !element.isDeleted
      )
      const key = selected.map((element) => `${element.id}:${element.version}`).join(',')
      setSelectionKey(key)
      setInspected((current) => {
        if (!selected.length && !current.selected.length) {
          return current
        }
        const next = `${key}|${hashElementsVersion(elements)}`
        return current.key === next ? current : { key: next, selected, elements }
      })
      const [only] = selected
      const candidate =
        selected.length === 1 &&
        only.type === 'text' &&
        !appState.editingTextElement &&
        /\$[^$]+\$/.test(only.text)
          ? { id: only.id, x: only.x, y: only.y, width: only.width, height: only.height }
          : null
      setMathCandidate((current) => (sameJson(current, candidate) ? current : candidate))
      const grid = appState.gridModeEnabled
      const snap = appState.objectsSnapModeEnabled
      setToggles((current) =>
        current.grid === grid && current.snap === snap ? current : { grid, snap }
      )
      const check = elementsOutsidePage(elements)
      setPageCheck((current) => (sameJson(current, check) ? current : check))
      const next = {
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        zoom: appState.zoom.value
      }
      setViewport((current) =>
        current.scrollX === next.scrollX &&
        current.scrollY === next.scrollY &&
        current.zoom === next.zoom
          ? current
          : next
      )
      return boxes
    },
    []
  )

  return {
    selection,
    viewport,
    frames,
    pageCheck,
    selectionKey,
    mathCandidate,
    inspected,
    toggles,
    observe
  }
}
