import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, ExcalidrawImperativeAPI, LibraryItems } from '@excalidraw/excalidraw/types'
import {
  FIGURE_UNITS_PER_POINT,
  PAGE_FRAME_ID,
  PAPER_STYLE,
  figurePage
} from '../../../../research-harness/research-figures-model.mjs'
import { figureLibraryItems } from '../../../../research-harness/research-figures-parts.mjs'

export type SelectionInfo = {
  count: number
  frameId: string | null
  fontPt: number | null
  /** The figure's style and accent from its page, for the Colors menu. */
  style: string | null
  accent: string | null
}

export const NO_SELECTION: SelectionInfo = {
  count: 0,
  frameId: null,
  fontPt: null,
  style: null,
  accent: null
}
const LIBRARY_KEY = 'aster.research-figures-library.v1'
export const UI_OPTIONS = {
  canvasActions: {
    loadScene: false,
    saveToActiveFile: false,
    export: false as const,
    saveAsImage: false,
    toggleTheme: false,
    changeViewBackgroundColor: false
  }
}
export const PAPER_APP_STATE: Partial<AppState> = {
  currentItemRoughness: PAPER_STYLE.roughness,
  currentItemFontFamily: PAPER_STYLE.fontFamily,
  currentItemFontSize: PAPER_STYLE.fontSize,
  currentItemStrokeWidth: PAPER_STYLE.strokeWidth,
  currentItemStrokeColor: PAPER_STYLE.strokeColor,
  currentItemBackgroundColor: PAPER_STYLE.backgroundColor,
  currentItemFillStyle: 'solid',
  // Why sharp: Excalidraw's round corner grows with the box; paper boxes keep a small radius.
  currentItemRoundness: 'sharp',
  // Why elbow: a person's new arrow stays orthogonal like the kit's connectors.
  currentItemArrowType: 'elbow',
  currentItemEndArrowhead: 'triangle',
  gridModeEnabled: true,
  objectsSnapModeEnabled: true,
  viewBackgroundColor: '#ffffff'
}

/** The ML parts first, then what the user added to the library on this machine. */
export function libraryItems(): LibraryItems {
  let saved: unknown = []
  try {
    saved = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '[]')
  } catch {
    saved = []
  }
  // Why the JSON round trip: Excalidraw restores library items itself; this only types them.
  const parts: LibraryItems = JSON.parse(JSON.stringify(figureLibraryItems()))
  const own: LibraryItems = Array.isArray(saved) ? JSON.parse(JSON.stringify(saved)) : []
  return [...parts, ...own]
}

export function saveLibrary(items: LibraryItems): void {
  try {
    const own = items.filter((item) => !item.id.startsWith('aster-'))
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(own))
  } catch {
    // Why: without storage the user's own items last for this session only.
  }
}

export function selectionInfo(
  elements: readonly ExcalidrawElement[],
  appState: AppState
): SelectionInfo {
  const selected = elements.filter(
    (element) =>
      appState.selectedElementIds[element.id] && !element.isDeleted && element.id !== PAGE_FRAME_ID
  )
  const sizes = new Set(
    selected.flatMap((element) => (element.type === 'text' ? [element.fontSize] : []))
  )
  const only = selected.length === 1 ? selected[0] : null
  const page = figurePage(elements)
  return {
    style: page?.style ?? null,
    accent: page?.accent ?? null,
    count: selected.length,
    frameId: only?.type === 'frame' ? only.id : null,
    fontPt: sizes.size === 1 ? Math.round(([...sizes][0] / FIGURE_UNITS_PER_POINT) * 10) / 10 : null
  }
}

const fitted = new WeakSet<ExcalidrawImperativeAPI>()
const adjusted = new WeakSet<ExcalidrawImperativeAPI>()
const rightInsets = new WeakMap<ExcalidrawImperativeAPI, number>()

/** Room a column over the canvas's right edge takes (the Inspector); fits keep the page clear of it. */
export function setFigureViewInset(api: ExcalidrawImperativeAPI, right: number): void {
  rightInsets.set(api, right)
}

/** The person zoomed or panned: leave the view where they put it until the next fit. */
export function noteViewAdjusted(api: ExcalidrawImperativeAPI): void {
  adjusted.add(api)
}

/** True while the view is still the one the last fit left (the person has not zoomed or panned). */
export function viewStillFitted(api: ExcalidrawImperativeAPI): boolean {
  return fitted.has(api) && !adjusted.has(api)
}

/** Fits the page frame (or the drawing, or the selection) in view, clear of Excalidraw's bars. */
export function fitFigureInView(api: ExcalidrawImperativeAPI, only: 'page' | 'selection' = 'page') {
  const elements = api.getSceneElements()
  const selectedIds = api.getAppState().selectedElementIds
  const selected = elements.filter((element) => selectedIds[element.id])
  const page = elements.find((element) => element.id === PAGE_FRAME_ID)
  const target = only === 'selection' && selected.length ? selected : (page ?? elements)
  if (!elements.length) {
    return
  }
  api.refresh()
  api.scrollToContent(target, {
    fitToViewport: true,
    viewportZoomFactor: 0.92,
    animate: false,
    maxZoom: 2,
    canvasOffsets: { top: 72, bottom: 64, left: 24, right: 24 + (rightInsets.get(api) ?? 0) }
  })
  fitted.add(api)
  // Why: zooming to the selection is the person's view, not the page's.
  if (only === 'selection') {
    adjusted.add(api)
  } else {
    adjusted.delete(api)
  }
}

/**
 * Shift+1 / Shift+2 run Excalidraw's zoom-to-fit, which measures its toolbar in window
 * coordinates and so pushes the page down when the canvas is not at the window's corner.
 */
export function fitShortcut(event: React.KeyboardEvent): 'page' | 'selection' | null {
  const target = event.target
  const typing =
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')
  if (typing || !event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
    return null
  }
  return event.code === 'Digit1' ? 'page' : event.code === 'Digit2' ? 'selection' : null
}
