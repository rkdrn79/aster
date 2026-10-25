import type { Tab } from '../../../../shared/tab-types'
import type { ResearchDocument } from '../../../../shared/research/research-records'
import { conversationExperiment } from '../../../../shared/research/research-conversation-context'

/** Each Experiment's chats: its docked chat first, then the conversations linked to it. */
export function groupExperimentConversations(
  document: ResearchDocument | null,
  tabs: readonly Tab[],
  workspaceId: string | null,
  hostId: string | null
): Map<string, Tab[]> {
  const grouped = new Map<string, Tab[]>()
  if (!document || !workspaceId || !hostId) {
    return grouped
  }
  for (const tab of tabs) {
    if (
      tab.worktreeId !== workspaceId ||
      (tab.executionHostId && tab.executionHostId !== hostId) ||
      (tab.contentType !== 'agent-session' &&
        !(tab.contentType === 'terminal' && tab.viewMode === 'chat'))
    ) {
      continue
    }
    // Why the docked fallback: a chat bound while its tab was closed was never linked explicitly.
    const experiment =
      conversationExperiment(document, tab.id, workspaceId, hostId, tab.entityId) ??
      (Object.hasOwn(document.conversationExperimentIds, tab.id)
        ? null
        : document.experiments.find(
            (entry) =>
              entry.experimentAgentSessionId === tab.entityId &&
              entry.workspaceId === workspaceId &&
              entry.hostId === hostId
          ))
    if (experiment) {
      const tabs = [...(grouped.get(experiment.id) ?? []), tab]
      // Why: the Experiment's own docked chat leads its list.
      grouped.set(
        experiment.id,
        tabs.toSorted(
          (left, right) =>
            Number(right.entityId === experiment.experimentAgentSessionId) -
            Number(left.entityId === experiment.experimentAgentSessionId)
        )
      )
    }
  }
  return grouped
}
