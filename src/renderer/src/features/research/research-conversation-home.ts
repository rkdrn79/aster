import type { ResearchLibraryDocument } from '../../../../shared/research/research-library'
import { libraryScopeKey } from '../../../../shared/research/research-library'
import type { ResearchDocument } from '../../../../shared/research/research-records'

export type ResearchConversationHome =
  | { kind: 'workbench' }
  | { kind: 'library' }
  | { kind: 'writing'; experimentId: string | null }
  | { kind: 'experiment'; experimentId: string }

export function researchChatAvailableForHome(
  placement: ResearchConversationHome,
  home: Exclude<ResearchConversationHome, { kind: 'workbench' }>
): boolean {
  if (placement.kind === 'workbench') {
    return true
  }
  if (placement.kind !== home.kind) {
    return false
  }
  return (
    home.kind !== 'experiment' ||
    (placement.kind === 'experiment' && placement.experimentId === home.experimentId)
  )
}

export function writingAgentScopeKey(scope: { hostId: string; workspaceId: string }): string {
  return JSON.stringify([scope.hostId, scope.workspaceId])
}

/** Session IDs are only unique within the workspace and execution host that owns them. */
export function researchConversationHomeKey(
  hostId: string,
  workspaceId: string,
  sessionId: string
): string {
  return JSON.stringify([hostId, workspaceId, sessionId])
}

export function researchConversationHome(
  records: ResearchDocument | null,
  library: ResearchLibraryDocument | null,
  hostId: string | null,
  workspaceId: string,
  sessionId: string
): ResearchConversationHome {
  if (!hostId || !sessionId) {
    return { kind: 'workbench' }
  }
  const saved =
    records?.conversationHomes[researchConversationHomeKey(hostId, workspaceId, sessionId)]
  if (saved?.kind === 'library') {
    return saved
  }
  if (saved?.kind === 'writing') {
    return { kind: 'writing', experimentId: null }
  }
  if (
    saved?.kind === 'experiment' &&
    records?.experiments.some(
      (entry) =>
        entry.id === saved.experimentId &&
        entry.hostId === hostId &&
        entry.workspaceId === workspaceId
    )
  ) {
    return saved
  }
  if (library?.readingAgentSessionByScope[libraryScopeKey({ hostId, workspaceId })] === sessionId) {
    return { kind: 'library' }
  }
  if (
    records?.writingAgentSessionByScope[writingAgentScopeKey({ hostId, workspaceId })] === sessionId
  ) {
    return { kind: 'writing', experimentId: null }
  }
  const writing = records?.experiments.find(
    (entry) =>
      entry.hostId === hostId &&
      entry.workspaceId === workspaceId &&
      entry.writingAgentSessionId === sessionId
  )
  if (writing) {
    return { kind: 'writing', experimentId: null }
  }
  const docked = records?.experiments.find(
    (entry) =>
      entry.hostId === hostId &&
      entry.workspaceId === workspaceId &&
      entry.experimentAgentSessionId === sessionId
  )
  return docked ? { kind: 'experiment', experimentId: docked.id } : { kind: 'workbench' }
}
