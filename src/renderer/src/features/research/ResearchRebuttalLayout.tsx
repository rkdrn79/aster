import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useMeasuredWidth } from '@/components/right-sidebar/right-sidebar-measured-width'
import { cn } from '@/lib/utils'
import { ResearchResizableSidePane, useStoredSidePaneWidth } from './ResearchResizableSidePane'
import {
  clampToSidePaneBounds,
  sidePaneWidthBounds,
  type SidePaneWidthLimits
} from './research-side-pane-width'

const SIDE_LIMITS: SidePaneWidthLimits = {
  defaultWidth: 420,
  minWidth: 320,
  maxWidth: 680,
  minSiblingWidth: 420
}
/** Below this, the panel floats over the page instead of squeezing the replies. */
export const REBUTTAL_OVERLAY_BELOW = 860

type Props = {
  main: ReactNode
  side: ReactNode
  sideOpen: boolean
  /** Reports the page width (for narrow windows) and the replies column's width. */
  onWidth: (width: number, mainWidth: number) => void
}

/** The reviewer's concerns and replies, with the review and chats in a panel beside them. */
export function ResearchRebuttalLayout({
  main,
  side,
  sideOpen,
  onWidth
}: Props): React.JSX.Element {
  const [width, setWidth] = useState(0)
  const measure = useMeasuredWidth(useCallback((value: number | null) => setWidth(value ?? 0), []))
  const [preferred, commit] = useStoredSidePaneWidth(
    'aster.research-rebuttal-side-width.v1',
    SIDE_LIMITS
  )
  const overlay = width > 0 && width < REBUTTAL_OVERLAY_BELOW
  const bounds = sidePaneWidthBounds(width, SIDE_LIMITS)
  const sideWidth = overlay
    ? Math.min(420, Math.floor(width * 0.92))
    : clampToSidePaneBounds(preferred, bounds)
  const mainWidth = width - (sideOpen && !overlay ? sideWidth : 0)
  useEffect(() => {
    onWidth(width, mainWidth)
  }, [width, mainWidth, onWidth])
  return (
    <div ref={measure} className="relative flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{main}</div>
      <ResearchResizableSidePane
        side="end"
        label="Resize the side panel"
        width={sideWidth}
        bounds={bounds}
        defaultWidth={SIDE_LIMITS.defaultWidth}
        hidden={!sideOpen}
        className={cn(
          overlay &&
            'absolute inset-y-0 right-0 z-20 border-l border-border bg-background shadow-xl'
        )}
        onWidthChange={commit}
      >
        {side}
      </ResearchResizableSidePane>
    </div>
  )
}
