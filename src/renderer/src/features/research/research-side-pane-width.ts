export const SIDE_PANE_HANDLE_WIDTH = 6
export const SIDE_PANE_RESIZE_STEP = 16

export type SidePaneWidthLimits = {
  defaultWidth: number
  minWidth: number
  maxWidth: number
  /** Narrowest the neighbouring pane may get before both shrink below their minimums together. */
  minSiblingWidth: number
}

export type SidePaneWidthBounds = { minWidth: number; maxWidth: number }

export function sidePaneWidthBounds(
  availableWidth: number,
  limits: SidePaneWidthLimits
): SidePaneWidthBounds {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) {
    return { minWidth: limits.minWidth, maxWidth: limits.maxWidth }
  }
  const maxWidth = Math.min(
    limits.maxWidth,
    availableWidth - SIDE_PANE_HANDLE_WIDTH - limits.minSiblingWidth
  )
  if (maxWidth >= limits.minWidth) {
    return { minWidth: limits.minWidth, maxWidth }
  }
  const scaledWidth = Math.max(
    0,
    Math.floor(
      ((availableWidth - SIDE_PANE_HANDLE_WIDTH) * limits.minWidth) /
        (limits.minWidth + limits.minSiblingWidth)
    )
  )
  return { minWidth: scaledWidth, maxWidth: scaledWidth }
}

export function clampToSidePaneBounds(width: number, bounds: SidePaneWidthBounds): number {
  return Math.min(bounds.maxWidth, Math.max(bounds.minWidth, width))
}

export function clampSidePaneWidth(
  width: number,
  availableWidth: number,
  limits: SidePaneWidthLimits
): number {
  return clampToSidePaneBounds(width, sidePaneWidthBounds(availableWidth, limits))
}

export function readSidePaneWidth(storageKey: string, limits: SidePaneWidthLimits): number {
  try {
    const value = Number(localStorage.getItem(storageKey))
    return Number.isFinite(value) && value > 0
      ? clampSidePaneWidth(value, 0, limits)
      : limits.defaultWidth
  } catch {
    return limits.defaultWidth
  }
}

export function saveSidePaneWidth(
  storageKey: string,
  width: number,
  limits: SidePaneWidthLimits
): void {
  try {
    localStorage.setItem(storageKey, String(clampSidePaneWidth(width, 0, limits)))
  } catch {
    // The pane still resizes when browser storage is unavailable.
  }
}
