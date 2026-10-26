import type { Tab } from '../../../../shared/tab-types'
import type {
  ResearchDelegationRecord,
  ResearchDocument
} from '../../../../shared/research/research-records'

export function researchBackgroundTaskForTab(
  records: ResearchDocument | null,
  tab: Tab,
  hostId: string | null,
  additionalTasks: readonly ResearchDelegationRecord[] = []
): ResearchDelegationRecord | null {
  if (!hostId) {
    return null
  }
  return (
    [...(records?.delegations ?? []), ...additionalTasks].find(
      (task) =>
        task.targetWorkspaceId === tab.worktreeId &&
        task.targetHostId === hostId &&
        (task.tabId === tab.id ||
          (tab.contentType === 'agent-session' && task.sessionId === tab.entityId))
    ) ?? null
  )
}

export function researchBackgroundTabIsHidden(
  records: ResearchDocument | null,
  tab: Tab,
  hostId: string | null,
  additionalTasks: readonly ResearchDelegationRecord[] = []
): boolean {
  const task = researchBackgroundTaskForTab(records, tab, hostId, additionalTasks)
  return task !== null && task.workbenchVisible !== true
}
