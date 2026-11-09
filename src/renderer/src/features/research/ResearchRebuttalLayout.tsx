import { useCallback, useState, type ReactNode } from 'react'
import { useMeasuredWidth } from '@/components/right-sidebar/right-sidebar-measured-width'
import { ResearchResizableSidePane, useStoredSidePaneWidth } from './ResearchResizableSidePane'
import {
  SIDE_PANE_HANDLE_WIDTH,
  clampToSidePaneBounds,
  sidePaneWidthBounds,
  type SidePaneWidthLimits
} from './research-side-pane-width'

const REVIEWS_LIMITS: SidePaneWidthLimits = {
  defaultWidth: 440,
  minWidth: 280,
  maxWidth: 760,
  minSiblingWidth: 380
}
const AGENT_LIMITS: SidePaneWidthLimits = {
  defaultWidth: 380,
  minWidth: 300,
  maxWidth: 680,
  minSiblingWidth: 380
}

type Props = {
  reviews: ReactNode
  center: ReactNode
  agent: ReactNode
  agentOpen: boolean
}

/** Reviews | clusters and outputs | agent chat; the chat stays mounted while hidden. */
export function ResearchRebuttalLayout({
  reviews,
  center,
  agent,
  agentOpen
}: Props): React.JSX.Element {
  const [width, setWidth] = useState(0)
  const measure = useMeasuredWidth(useCallback((value: number | null) => setWidth(value ?? 0), []))
  const [reviewsPreferred, commitReviews] = useStoredSidePaneWidth(
    'aster.research-rebuttal-reviews-width.v1',
    REVIEWS_LIMITS
  )
  const [agentPreferred, commitAgent] = useStoredSidePaneWidth(
    'aster.research-rebuttal-agent-width.v1',
    AGENT_LIMITS
  )
  const agentBounds = sidePaneWidthBounds(
    width - (agentOpen ? REVIEWS_LIMITS.minWidth + SIDE_PANE_HANDLE_WIDTH : 0),
    AGENT_LIMITS
  )
  const agentWidth = clampToSidePaneBounds(agentPreferred, agentBounds)
  const reviewsBounds = sidePaneWidthBounds(
    width - (agentOpen ? agentWidth + SIDE_PANE_HANDLE_WIDTH : 0),
    REVIEWS_LIMITS
  )
  return (
    <div ref={measure} className="flex min-h-0 min-w-0 flex-1">
      <ResearchResizableSidePane
        side="start"
        label="Resize reviews"
        width={clampToSidePaneBounds(reviewsPreferred, reviewsBounds)}
        bounds={reviewsBounds}
        defaultWidth={REVIEWS_LIMITS.defaultWidth}
        onWidthChange={commitReviews}
      >
        {reviews}
      </ResearchResizableSidePane>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{center}</div>
      <ResearchResizableSidePane
        side="end"
        label="Resize Rebuttal agent"
        width={agentWidth}
        bounds={agentBounds}
        defaultWidth={AGENT_LIMITS.defaultWidth}
        hidden={!agentOpen}
        onWidthChange={commitAgent}
      >
        {agent}
      </ResearchResizableSidePane>
    </div>
  )
}
