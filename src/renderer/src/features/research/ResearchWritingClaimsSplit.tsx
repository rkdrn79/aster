import { useCallback, useState, type ReactNode } from 'react'
import { useMeasuredWidth } from '@/components/right-sidebar/right-sidebar-measured-width'
import { ResearchResizableSidePane, useStoredSidePaneWidth } from './ResearchResizableSidePane'
import { clampToSidePaneBounds } from './research-side-pane-width'
import {
  WRITING_CLAIMS_DRAWER_WIDTH_LIMITS,
  WRITING_CLAIMS_DRAWER_WIDTH_STORAGE_KEY,
  writingClaimsDrawerBounds
} from './research-writing-claims-drawer-width'
import type { WritingPaneVisibility } from './research-writing-pane-ratios'

type OpenSource = (file: string, line: number) => void

/** The open drawer (Claims or Writing check): how it jumps to the source and how it draws. */
export type WritingDrawer = {
  onOpenSource: OpenSource
  onClose: () => void
  render: (props: { onOpenSource: OpenSource; className: string }) => ReactNode
}

type Props = {
  wide: boolean
  visiblePanes: WritingPaneVisibility
  panes: ReactNode
  /** The open drawer, or null while it is closed. */
  drawer: WritingDrawer | null
}

/**
 * The Writing panes beside a drawer (Claims or Writing check), which takes its own column instead
 * of covering them.
 */
export function ResearchWritingClaimsSplit({
  wide,
  visiblePanes,
  panes,
  drawer
}: Props): React.JSX.Element {
  const [containerWidth, setContainerWidth] = useState(0)
  const measureContainer = useMeasuredWidth(
    useCallback((width: number | null) => setContainerWidth(width ?? 0), [])
  )
  const [preferredWidth, commitWidth] = useStoredSidePaneWidth(
    WRITING_CLAIMS_DRAWER_WIDTH_STORAGE_KEY,
    WRITING_CLAIMS_DRAWER_WIDTH_LIMITS
  )
  const bounds = writingClaimsDrawerBounds(containerWidth, visiblePanes, wide)

  return (
    <div ref={measureContainer} className="relative flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{panes}</div>
      {drawer && bounds ? (
        <ResearchResizableSidePane
          side="end"
          label="Resize Writing panes and drawer"
          width={clampToSidePaneBounds(preferredWidth, bounds)}
          bounds={bounds}
          defaultWidth={WRITING_CLAIMS_DRAWER_WIDTH_LIMITS.defaultWidth}
          onWidthChange={commitWidth}
        >
          {drawer.render({ onOpenSource: drawer.onOpenSource, className: 'flex-1' })}
        </ResearchResizableSidePane>
      ) : drawer ? (
        drawer.render({
          onOpenSource: (file, line) => {
            drawer.onOpenSource(file, line)
            // Why: floating over the panes, the drawer would hide the line it just revealed.
            drawer.onClose()
          },
          className:
            'absolute inset-y-0 right-0 z-20 w-[min(24rem,100%)] border-l border-border shadow-floating'
        })
      ) : null}
    </div>
  )
}
