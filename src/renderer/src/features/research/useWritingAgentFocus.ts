import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { useResearchRecords } from './research-records-store'
import type { WritingPane } from './ResearchWritingSplitLayout'
import {
  saveWritingPaneVisibility,
  type WritingPaneVisibility
} from './research-writing-pane-ratios'
import {
  consumeWritingAgentFocus,
  subscribeWritingAgentFocus
} from './research-writing-agent-focus'

export function useWritingAgentFocus(
  record: Pick<ExperimentRecord, 'id' | 'hostId' | 'workspaceId'>,
  setActivePane: Dispatch<SetStateAction<WritingPane>>,
  setVisiblePanes: Dispatch<SetStateAction<WritingPaneVisibility>>
): void {
  const { id: layoutKey, hostId, workspaceId } = record
  useEffect(() => {
    const focus = (): void => {
      const accepted = consumeWritingAgentFocus(
        (experimentId) =>
          experimentId === layoutKey ||
          Boolean(
            useResearchRecords
              .getState()
              .document?.experiments.some(
                (entry) =>
                  entry.id === experimentId &&
                  entry.hostId === hostId &&
                  entry.workspaceId === workspaceId
              )
          )
      )
      if (!accepted) {
        return
      }
      setActivePane('agent')
      setVisiblePanes((current) => {
        const next: WritingPaneVisibility = [true, current[1], current[2]]
        saveWritingPaneVisibility(layoutKey, next)
        return next
      })
    }
    const unsubscribe = subscribeWritingAgentFocus(focus)
    focus()
    return unsubscribe
  }, [layoutKey, hostId, workspaceId, setActivePane, setVisiblePanes])
}
