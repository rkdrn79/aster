import type { SidePaneWidthLimits } from './research-side-pane-width'

export const WRITING_FILE_TREE_WIDTH_LIMITS: SidePaneWidthLimits = {
  defaultWidth: 160,
  minWidth: 120,
  maxWidth: 480,
  minSiblingWidth: 240
}

export function writingFileTreeWidthStorageKey(experimentId: string): string {
  return `aster.research-writing-file-tree-width.v1:${experimentId}`
}
