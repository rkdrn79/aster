import {
  clampToSidePaneBounds,
  saveSidePaneWidth,
  sidePaneWidthBounds,
  type SidePaneWidthBounds,
  type SidePaneWidthLimits
} from './research-side-pane-width'

const LIBRARY_READER_MIN_WIDTH = 360

export const LIBRARY_LIST_WIDTH_LIMITS: SidePaneWidthLimits = {
  defaultWidth: 288,
  minWidth: 200,
  maxWidth: 480,
  minSiblingWidth: LIBRARY_READER_MIN_WIDTH
}
export const LIBRARY_PANEL_WIDTH_LIMITS: SidePaneWidthLimits = {
  defaultWidth: 400,
  minWidth: 280,
  maxWidth: 960,
  minSiblingWidth: LIBRARY_READER_MIN_WIDTH
}
export const LIBRARY_LIST_WIDTH_STORAGE_KEY = 'aster.research-library-list-width.v1'
export const LIBRARY_PANEL_WIDTH_STORAGE_KEY = 'aster.research-library-panel-width.v1'

export type LibraryPaneWidth = SidePaneWidthBounds & { width: number }

const PANEL_DEFAULT_SHARE = 0.32

/**
 * The reading panel's width until the user drags it: about a third of the Library, so a narrow
 * window keeps most of its width for the PDF instead of a fixed 400 px.
 */
export function libraryPanelDefaultWidth(containerWidth: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return LIBRARY_PANEL_WIDTH_LIMITS.defaultWidth
  }
  return Math.min(
    LIBRARY_PANEL_WIDTH_LIMITS.defaultWidth,
    Math.max(LIBRARY_PANEL_WIDTH_LIMITS.minWidth, Math.round(containerWidth * PANEL_DEFAULT_SHARE))
  )
}

/** A width the user dragged to on this device, or null while the default still applies. */
export function readStoredLibraryPaneWidth(storageKey: string): number | null {
  try {
    const value = Number(localStorage.getItem(storageKey))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export function saveLibraryPaneWidth(
  storageKey: string,
  width: number | null,
  limits: SidePaneWidthLimits
): void {
  if (width !== null) {
    saveSidePaneWidth(storageKey, width, limits)
    return
  }
  try {
    localStorage.removeItem(storageKey)
  } catch {
    // The pane still follows the default when browser storage is unavailable.
  }
}

function paneWidth(
  preferred: number,
  availableWidth: number,
  limits: SidePaneWidthLimits
): LibraryPaneWidth {
  const bounds = sidePaneWidthBounds(availableWidth, limits)
  return { ...bounds, width: clampToSidePaneBounds(preferred, bounds) }
}

/**
 * The reader keeps its minimum first, then the paper list yields before the reading panel.
 * Each pane's bounds use its neighbour's rendered width, so a drag never shifts the other pane.
 */
export function libraryPaneWidths(
  containerWidth: number,
  listOpen: boolean,
  listPreferred: number,
  panelPreferred: number
): { list: LibraryPaneWidth | null; panel: LibraryPaneWidth } {
  if (!listOpen) {
    return {
      list: null,
      panel: paneWidth(panelPreferred, containerWidth, LIBRARY_PANEL_WIDTH_LIMITS)
    }
  }
  const panelFirst = paneWidth(
    panelPreferred,
    containerWidth - LIBRARY_LIST_WIDTH_LIMITS.minWidth,
    LIBRARY_PANEL_WIDTH_LIMITS
  ).width
  const list = paneWidth(listPreferred, containerWidth - panelFirst, LIBRARY_LIST_WIDTH_LIMITS)
  return {
    list,
    panel: paneWidth(panelFirst, containerWidth - list.width, LIBRARY_PANEL_WIDTH_LIMITS)
  }
}
