import { useCallback, useState, type ComponentProps, type ReactNode } from 'react'
import { useMeasuredWidth } from '@/components/right-sidebar/right-sidebar-measured-width'
import { ResearchClaimsPanel } from './ResearchClaimsPanel'
import { ResearchResizableSidePane, useStoredSidePaneWidth } from './ResearchResizableSidePane'
import { clampToSidePaneBounds } from './research-side-pane-width'
import {
  WRITING_CLAIMS_DRAWER_WIDTH_LIMITS,
  WRITING_CLAIMS_DRAWER_WIDTH_STORAGE_KEY,
  writingClaimsDrawerBounds
} from './research-writing-claims-drawer-width'
import type { WritingPaneVisibility } from './research-writing-pane-ratios'

type Props = {
  wide: boolean
  visiblePanes: WritingPaneVisibility
  panes: ReactNode
  /** The open drawer, or null while it is closed. */
  claimsPanel: Omit<ComponentProps<typeof ResearchClaimsPanel>, 'className'> | null
}

/** The Writing panes beside the Claims drawer, which takes its own column instead of covering them. */
export function ResearchWritingClaimsSplit({
  wide,
  visiblePanes,
  panes,
  claimsPanel
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
      {claimsPanel && bounds ? (
        <ResearchResizableSidePane
          side="end"
          label="Resize Writing panes and claims"
          width={clampToSidePaneBounds(preferredWidth, bounds)}
          bounds={bounds}
          defaultWidth={WRITING_CLAIMS_DRAWER_WIDTH_LIMITS.defaultWidth}
          onWidthChange={commitWidth}
        >
          <ResearchClaimsPanel {...claimsPanel} className="flex-1" />
        </ResearchResizableSidePane>
      ) : claimsPanel ? (
        <ResearchClaimsPanel
          {...claimsPanel}
          onOpenSource={(file, line) => {
            claimsPanel.onOpenSource(file, line)
            // Why: floating over the panes, the drawer would hide the line it just revealed.
            claimsPanel.onClose()
          }}
          className="absolute inset-y-0 right-0 z-20 w-[min(24rem,100%)] border-l border-border shadow-floating"
        />
      ) : null}
    </div>
  )
}
