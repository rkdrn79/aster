import type { ResearchLibraryDocument } from '../../../../shared/research/research-library'
import { libraryScopeKey } from '../../../../shared/research/research-library'
import type { ResearchDocument } from '../../../../shared/research/research-records'

export type ResearchConversationHome =
  | { kind: 'workbench' }
  | { kind: 'library' }
  | { kind: 'writing'; experimentId: string }
  | { kind: 'experiment'; experimentId: string }

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
  if (
    (saved?.kind === 'writing' || saved?.kind === 'experiment') &&
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
  const writing = records?.experiments.find(
    (entry) =>
      entry.hostId === hostId &&
      entry.workspaceId === workspaceId &&
      entry.writingAgentSessionId === sessionId
  )
  if (writing) {
    return { kind: 'writing', experimentId: writing.id }
  }
  const docked = records?.experiments.find(
    (entry) =>
      entry.hostId === hostId &&
      entry.workspaceId === workspaceId &&
      entry.experimentAgentSessionId === sessionId
  )
  return docked ? { kind: 'experiment', experimentId: docked.id } : { kind: 'workbench' }
}
