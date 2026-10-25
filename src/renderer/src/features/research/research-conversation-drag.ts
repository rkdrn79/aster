export const RESEARCH_CONVERSATION_DRAG_TYPE = 'application/x-aster-conversation'

export type ResearchConversationDrag = {
  tabId: string
  workspaceId: string
  hostId: string
}

export function readResearchConversationDrag(data: DataTransfer): ResearchConversationDrag | null {
  if (!Array.from(data.types).includes(RESEARCH_CONVERSATION_DRAG_TYPE)) {
    return null
  }
  const raw = data.getData(RESEARCH_CONVERSATION_DRAG_TYPE)
  if (!raw || raw.length > 2_000) {
    return null
  }
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') {
      return null
    }
    const tabId = 'tabId' in value ? value.tabId : null
    const workspaceId = 'workspaceId' in value ? value.workspaceId : null
    const hostId = 'hostId' in value ? value.hostId : null
    return typeof tabId === 'string' &&
      typeof workspaceId === 'string' &&
      typeof hostId === 'string' &&
      tabId.length > 0 &&
      workspaceId.length > 0 &&
      hostId.length > 0
      ? { tabId, workspaceId, hostId }
      : null
  } catch {
    return null
  }
}
