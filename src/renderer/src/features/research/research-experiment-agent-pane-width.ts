import {
  sidePaneWidthBounds,
  type SidePaneWidthBounds,
  type SidePaneWidthLimits
} from './research-side-pane-width'

export const EXPERIMENT_AGENT_PANE_WIDTH_LIMITS: SidePaneWidthLimits = {
  defaultWidth: 384,
  minWidth: 300,
  maxWidth: 1200,
  minSiblingWidth: 420
}
export const EXPERIMENT_AGENT_PANE_WIDTH_STORAGE_KEY = 'aster.research-experiment-agent-width.v1'

const MAX_SHARE = 0.6

/** The notebook keeps its minimum first, and the agent never takes more than 60% of the screen. */
export function experimentAgentPaneBounds(containerWidth: number): SidePaneWidthBounds {
  const limits = EXPERIMENT_AGENT_PANE_WIDTH_LIMITS
  const shareCap = Math.floor(containerWidth * MAX_SHARE)
  return sidePaneWidthBounds(containerWidth, {
    ...limits,
    maxWidth:
      shareCap > 0
        ? Math.max(limits.minWidth, Math.min(limits.maxWidth, shareCap))
        : limits.maxWidth
  })
}
