import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useMeasuredWidth } from '@/components/right-sidebar/right-sidebar-measured-width'
import { cn } from '@/lib/utils'
import { ResearchResizableSidePane, useStoredSidePaneWidth } from './ResearchResizableSidePane'
import {
  SIDE_PANE_HANDLE_WIDTH,
  clampToSidePaneBounds,
  sidePaneWidthBounds,
  type SidePaneWidthLimits
} from './research-side-pane-width'
import {
  STRIP_WIDTH,
  closeFiguresDrawer,
  figuresLayoutMode,
  setFiguresWindowWidth,
  useFiguresLayout
} from './research-figures-layout-mode'

const LIST_LIMITS: SidePaneWidthLimits = {
  defaultWidth: 200,
  minWidth: 150,
  maxWidth: 360,
  minSiblingWidth: 420
}
const AGENT_LIMITS: SidePaneWidthLimits = {
  defaultWidth: 360,
  minWidth: 300,
  maxWidth: 640,
  minSiblingWidth: 420
}

/** The figure list's mode, side panel's mode and the pill, from the window and the user's choices. */
export function useFiguresLayoutMode() {
  return useFiguresLayout(useShallow(figuresLayoutMode))
}

/**
 * Figure list (or its strip) | canvas | side panel. The side panel stays mounted in one place
 * whether it is docked, floating as a drawer, or hidden, so the chat keeps its state.
 */
export function ResearchFiguresLayout({
  list,
  strip,
  center,
  side,
  pill
}: {
  list: ReactNode
  strip: ReactNode
  center: ReactNode
  side: ReactNode
  pill: ReactNode
}): React.JSX.Element {
  const mode = useFiguresLayoutMode()
  const [width, setWidth] = useState(0)
  const measure = useMeasuredWidth(useCallback((value: number | null) => setWidth(value ?? 0), []))
  const [listPreferred, commitList] = useStoredSidePaneWidth(
    'aster.research-figures-list-width.v1',
    LIST_LIMITS
  )
  const [agentPreferred, commitAgent] = useStoredSidePaneWidth(
    'aster.research-figures-agent-width.v1',
    AGENT_LIMITS
  )
  useEffect(() => {
    const onResize = (): void => setFiguresWindowWidth(window.innerWidth)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const docked = mode.side === 'docked'
  const listFull = mode.list === 'full'
  const agentBounds = sidePaneWidthBounds(
    width - (listFull ? LIST_LIMITS.minWidth + SIDE_PANE_HANDLE_WIDTH : STRIP_WIDTH),
    AGENT_LIMITS
  )
  const agentWidth = clampToSidePaneBounds(agentPreferred, agentBounds)
  const listBounds = sidePaneWidthBounds(
    width - (docked ? agentWidth + SIDE_PANE_HANDLE_WIDTH : 0),
    LIST_LIMITS
  )
  return (
    <div
      ref={measure}
      className="relative flex min-h-0 min-w-0 flex-1"
      onKeyDown={(event) => {
        const target = event.target
        // Why: Esc in the chat composer or a field belongs to it (it may stop the agent).
        const typing =
          target instanceof HTMLElement &&
          (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
        if (event.key === 'Escape' && mode.side === 'drawer' && !typing) {
          closeFiguresDrawer()
        }
      }}
    >
      {listFull ? (
        <ResearchResizableSidePane
          side="start"
          label="Resize figure list"
          width={clampToSidePaneBounds(listPreferred, listBounds)}
          bounds={listBounds}
          defaultWidth={LIST_LIMITS.defaultWidth}
          onWidthChange={commitList}
        >
          {list}
        </ResearchResizableSidePane>
      ) : (
        <div
          className="flex min-h-0 shrink-0 flex-col border-r border-border"
          style={{ width: STRIP_WIDTH }}
        >
          {strip}
        </div>
      )}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {center}
        {mode.pill ? pill : null}
      </div>
      <ResearchResizableSidePane
        side="end"
        label="Resize side panel"
        width={agentWidth}
        bounds={agentBounds}
        defaultWidth={AGENT_LIMITS.defaultWidth}
        hidden={mode.side === 'hidden'}
        className={cn(
          mode.side === 'drawer' &&
            'absolute inset-y-0 right-0 z-40 border-l border-border bg-background shadow-xl'
        )}
        onWidthChange={commitAgent}
      >
        {side}
      </ResearchResizableSidePane>
    </div>
  )
}
