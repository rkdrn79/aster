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
import { projectWritingRecordId } from './research-writing-project'

export function useWritingAgentFocus(
  record: Pick<ExperimentRecord, 'id' | 'hostId' | 'workspaceId'>,
  setActivePane: Dispatch<SetStateAction<WritingPane>>,
  setVisiblePanes: Dispatch<SetStateAction<WritingPaneVisibility>>
): void {
  const { id: layoutKey, hostId, workspaceId } = record
  useEffect(() => {
    const focus = (): void => {
      const accepted = consumeWritingAgentFocus((focusId) =>
        writingAgentFocusMatches(
          { id: layoutKey, hostId, workspaceId },
          focusId,
          useResearchRecords.getState().document?.experiments ?? []
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

export function writingAgentFocusMatches(
  record: Pick<ExperimentRecord, 'id' | 'hostId' | 'workspaceId'>,
  focusId: string,
  experiments: readonly ExperimentRecord[]
): boolean {
  return (
    focusId === record.id ||
    focusId === projectWritingRecordId(record) ||
    experiments.some(
      (entry) =>
        !entry.archived &&
        entry.id === focusId &&
        entry.hostId === record.hostId &&
        entry.workspaceId === record.workspaceId
    )
  )
}
