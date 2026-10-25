import {
  SIDE_PANE_HANDLE_WIDTH,
  sidePaneWidthBounds,
  type SidePaneWidthBounds,
  type SidePaneWidthLimits
} from './research-side-pane-width'
import {
  DEFAULT_WRITING_PANE_VISIBILITY,
  WRITING_PANE_NARROWEST_WIDTH,
  writingPanesMinimumWidth,
  type WritingPaneVisibility
} from './research-writing-pane-ratios'

export const WRITING_CLAIMS_DRAWER_WIDTH_LIMITS: SidePaneWidthLimits = {
  defaultWidth: 360,
  minWidth: 280,
  maxWidth: 640,
  minSiblingWidth: writingPanesMinimumWidth(DEFAULT_WRITING_PANE_VISIBILITY, true)
}
export const WRITING_CLAIMS_DRAWER_WIDTH_STORAGE_KEY = 'aster.research-writing-claims-width.v1'

/**
 * The drawer's column beside the Writing panes: the panes keep their minimums first, the drawer
 * narrows to its own next, then both shrink together. Null when not even the narrowest pane fits
 * beside the drawer, so it floats over the panes instead.
 */
export function writingClaimsDrawerBounds(
  containerWidth: number,
  visibility: WritingPaneVisibility,
  wide: boolean
): SidePaneWidthBounds | null {
  const limits = WRITING_CLAIMS_DRAWER_WIDTH_LIMITS
  const dockedMinimum = limits.minWidth + SIDE_PANE_HANDLE_WIDTH + WRITING_PANE_NARROWEST_WIDTH
  if (containerWidth > 0 && containerWidth < dockedMinimum) {
    return null
  }
  return sidePaneWidthBounds(containerWidth, {
    ...limits,
    minSiblingWidth: writingPanesMinimumWidth(visibility, wide)
  })
}
