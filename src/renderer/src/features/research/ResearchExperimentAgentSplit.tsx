import { useCallback, useState, type ReactNode } from 'react'
import { useMeasuredWidth } from '@/components/right-sidebar/right-sidebar-measured-width'
import { ResearchResizableSidePane, useStoredSidePaneWidth } from './ResearchResizableSidePane'
import { clampToSidePaneBounds } from './research-side-pane-width'
import {
  EXPERIMENT_AGENT_PANE_WIDTH_LIMITS,
  EXPERIMENT_AGENT_PANE_WIDTH_STORAGE_KEY,
  experimentAgentPaneBounds
} from './research-experiment-agent-pane-width'

type Props = {
  chatOpen: boolean
  main: ReactNode
  pane: ReactNode
}

/**
 * The notebook beside its docked agent, split by a draggable edge. Width state lives here so a
 * resize re-renders neither the notebook nor the chat; a closed chat stays mounted, hidden.
 */
export function ResearchExperimentAgentSplit({ chatOpen, main, pane }: Props): React.JSX.Element {
  const [containerWidth, setContainerWidth] = useState(0)
  const measureContainer = useMeasuredWidth(
    useCallback((width: number | null) => setContainerWidth(width ?? 0), [])
  )
  const [preferredWidth, commitWidth] = useStoredSidePaneWidth(
    EXPERIMENT_AGENT_PANE_WIDTH_STORAGE_KEY,
    EXPERIMENT_AGENT_PANE_WIDTH_LIMITS
  )
  const bounds = experimentAgentPaneBounds(containerWidth)

  return (
    <div ref={measureContainer} className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{main}</div>
      <ResearchResizableSidePane
        side="end"
        label="Resize notebook and experiment agent"
        width={clampToSidePaneBounds(preferredWidth, bounds)}
        bounds={bounds}
        defaultWidth={EXPERIMENT_AGENT_PANE_WIDTH_LIMITS.defaultWidth}
        onWidthChange={commitWidth}
        hidden={!chatOpen}
      >
        {pane}
      </ResearchResizableSidePane>
    </div>
  )
}
