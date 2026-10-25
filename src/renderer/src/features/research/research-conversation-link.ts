import { useAppStore } from '@/store'
import { structuredAgentSessionOwnerForTab } from '@/runtime/structured-agent-session-owner'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import { setConversationExperiment } from '../../../../shared/research/research-conversation-context'
import { useResearchRecords } from './research-records-store'
import type { ResearchConversationDrag } from './research-conversation-drag'

export async function linkResearchConversation(
  source: ResearchConversationDrag,
  experimentId: string | null
): Promise<void> {
  const tab = (useAppStore.getState().unifiedTabsByWorktree[source.workspaceId] ?? []).find(
    (entry) => entry.id === source.tabId
  )
  if (!tab) {
    throw new Error('This conversation is no longer open.')
  }
  if (
    tab.contentType !== 'agent-session' &&
    !(tab.contentType === 'terminal' && tab.viewMode === 'chat')
  ) {
    throw new Error('Only agent conversations can be linked to an Experiment.')
  }
  const owner =
    tab.contentType === 'agent-session'
      ? structuredAgentSessionOwnerForTab(useAppStore.getState(), tab)
      : (tab.executionHostId ??
        getResolvedExecutionHostIdForWorktree(useAppStore.getState(), source.workspaceId))
  if (owner !== source.hostId) {
    throw new Error('The conversation belongs to another host.')
  }
  await useResearchRecords
    .getState()
    .update((current) =>
      setConversationExperiment(
        current,
        source.tabId,
        experimentId,
        source.workspaceId,
        source.hostId
      )
    )
}
