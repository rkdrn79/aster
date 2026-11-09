import { sendMessageToAgent } from '@/lib/agent-message-send'
import { useAppStore } from '@/store'
import type { ResearchDocument } from '../../../../shared/research/research-records'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { researchConversationHomeKey, writingAgentScopeKey } from './research-conversation-home'
import { useResearchRecords } from './research-records-store'

export type RebuttalAgentScope = { hostId: string; workspaceId: string }

const FOCUS_EVENT = 'aster:research-rebuttal-agent-focus'
let pendingFocusKey: string | null = null

/** Asks the Rebuttal page of `scope` to show its agent pane once it is on screen. */
export function requestRebuttalAgentFocus(scope: RebuttalAgentScope): void {
  pendingFocusKey = writingAgentScopeKey(scope)
  window.dispatchEvent(new Event(FOCUS_EVENT))
}

export function consumeRebuttalAgentFocus(scope: RebuttalAgentScope): boolean {
  if (pendingFocusKey !== writingAgentScopeKey(scope)) {
    return false
  }
  pendingFocusKey = null
  return true
}

export function subscribeRebuttalAgentFocus(listener: () => void): () => void {
  window.addEventListener(FOCUS_EVENT, listener)
  return () => window.removeEventListener(FOCUS_EVENT, listener)
}

export function rebuttalAgentSessionId(
  document: ResearchDocument | null,
  scope: RebuttalAgentScope
): string | undefined {
  return document?.rebuttalAgentSessionByScope?.[writingAgentScopeKey(scope)]
}

/** One Rebuttal chat per project; a chat bound here leaves any other page it was kept on. */
export function withRebuttalAgentSession(
  current: ResearchDocument,
  scope: RebuttalAgentScope,
  sessionId: string | null
): ResearchDocument {
  const sessions = { ...current.rebuttalAgentSessionByScope }
  const key = writingAgentScopeKey(scope)
  if (sessionId) {
    sessions[key] = sessionId
  } else {
    delete sessions[key]
  }
  const conversationHomes = { ...current.conversationHomes }
  if (sessionId) {
    delete conversationHomes[
      researchConversationHomeKey(scope.hostId, scope.workspaceId, sessionId)
    ]
  }
  return { ...current, conversationHomes, rebuttalAgentSessionByScope: sessions }
}

export async function bindRebuttalAgentSession(
  scope: RebuttalAgentScope,
  sessionId: string | null
): Promise<void> {
  await useResearchRecords
    .getState()
    .update((current) => withRebuttalAgentSession(current, scope, sessionId))
}

/** Starts the project's Rebuttal (author-side) chat and binds it; an optional first prompt is sent once ready. */
export async function launchRebuttalAgent(
  scope: RebuttalAgentScope,
  agent: TuiAgent,
  prompt?: string
): Promise<string | null> {
  const { launchResearchChat } = await import('./ResearchAgentChatPane')
  const result = await launchResearchChat({
    hostId: scope.hostId,
    workspaceId: scope.workspaceId,
    agent,
    ...(prompt ? { prompt } : {}),
    label: 'Rebuttal agent',
    activate: false
  })
  if ('error' in result) {
    return result.error
  }
  try {
    await bindRebuttalAgentSession(scope, result.sessionId)
    return null
  } catch (cause) {
    return `Rebuttal chat started but was not linked. ${String(cause)}`
  }
}

/** Sends to the bound Rebuttal chat, starting a Claude chat with the prompt when none is open. */
export async function sendRebuttalPrompt(
  scope: RebuttalAgentScope,
  prompt: string
): Promise<string | null> {
  const sessionId = rebuttalAgentSessionId(useResearchRecords.getState().document, scope)
  const { researchChatSessionTabs } = await import('./ResearchAgentChatPane')
  const state = useAppStore.getState()
  const open = researchChatSessionTabs(
    state,
    state.unifiedTabsByWorktree[scope.workspaceId] ?? [],
    scope.hostId
  ).some((tab) => tab.entityId === sessionId)
  if (!sessionId || !open) {
    return launchRebuttalAgent(scope, 'claude', prompt)
  }
  const result = await sendMessageToAgent({
    worktreeId: scope.workspaceId,
    target: { kind: 'structured-session', sessionId },
    prompt
  })
  if (result.status === 'sent') {
    return null
  }
  return result.status === 'not-ready'
    ? 'The Rebuttal chat is still starting. Try again shortly.'
    : result.status === 'unconfirmed'
      ? 'Delivery could not be confirmed. Check the chat first.'
      : 'The Rebuttal chat did not accept the request.'
}
