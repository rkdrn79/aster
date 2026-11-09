import { sendMessageToAgent } from '@/lib/agent-message-send'
import { useAppStore } from '@/store'
import type { ResearchDocument } from '../../../../shared/research/research-records'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { researchConversationHomeKey } from './research-conversation-home'
import { useResearchRecords } from './research-records-store'
import type { RebuttalAgentScope } from './research-rebuttal-agent-session'

// Why a chat per rebuttal and reviewer: each simulated reviewer has its own memory of the debate,
// and several can run at once while the author-side agent works.

/** The record key: JSON of [hostId, workspaceId, rebuttal slug, reviewer ID]. */
export function rebuttalReviewerSessionKey(
  scope: RebuttalAgentScope,
  slug: string,
  reviewerId: string
): string {
  return JSON.stringify([scope.hostId, scope.workspaceId, slug, reviewerId])
}

export function reviewerAgentSessionId(
  document: ResearchDocument | null,
  scope: RebuttalAgentScope,
  slug: string,
  reviewerId: string
): string | undefined {
  return document?.rebuttalReviewerSessions?.[rebuttalReviewerSessionKey(scope, slug, reviewerId)]
}

export function rebuttalReviewerSessionIds(
  document: ResearchDocument | null,
  scope: RebuttalAgentScope
): string[] {
  const prefix = JSON.stringify([scope.hostId, scope.workspaceId]).slice(0, -1)
  return Object.entries(document?.rebuttalReviewerSessions ?? {})
    .filter(([key]) => key.startsWith(prefix))
    .map(([, sessionId]) => sessionId)
}

export function withReviewerAgentSession(
  current: ResearchDocument,
  scope: RebuttalAgentScope,
  slug: string,
  reviewerId: string,
  sessionId: string | null
): ResearchDocument {
  const sessions = { ...current.rebuttalReviewerSessions }
  const key = rebuttalReviewerSessionKey(scope, slug, reviewerId)
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
  return { ...current, conversationHomes, rebuttalReviewerSessions: sessions }
}

export async function bindReviewerAgentSession(
  scope: RebuttalAgentScope,
  slug: string,
  reviewerId: string,
  sessionId: string | null
): Promise<void> {
  await useResearchRecords
    .getState()
    .update((current) => withReviewerAgentSession(current, scope, slug, reviewerId, sessionId))
}

/** Starts this reviewer's chat with a first prompt and binds it. */
export async function launchReviewerAgent(
  scope: RebuttalAgentScope,
  slug: string,
  reviewerId: string,
  agent: TuiAgent,
  prompt: string
): Promise<string | null> {
  const { launchResearchChat } = await import('./ResearchAgentChatPane')
  const result = await launchResearchChat({
    hostId: scope.hostId,
    workspaceId: scope.workspaceId,
    agent,
    prompt,
    label: `Simulated ${reviewerId}`,
    activate: false
  })
  if ('error' in result) {
    return result.error
  }
  try {
    await bindReviewerAgentSession(scope, slug, reviewerId, result.sessionId)
    return null
  } catch (cause) {
    return `Simulated ${reviewerId} started but was not linked. ${String(cause)}`
  }
}

/** Sends to this reviewer's chat, starting it with `openPrompt` when no chat is open. */
export async function sendReviewerPrompt(
  scope: RebuttalAgentScope,
  slug: string,
  reviewerId: string,
  prompt: string,
  openPrompt: (prompt: string) => string
): Promise<string | null> {
  const sessionId = reviewerAgentSessionId(
    useResearchRecords.getState().document,
    scope,
    slug,
    reviewerId
  )
  const { researchChatSessionTabs } = await import('./ResearchAgentChatPane')
  const state = useAppStore.getState()
  const open = researchChatSessionTabs(
    state,
    state.unifiedTabsByWorktree[scope.workspaceId] ?? [],
    scope.hostId
  ).some((tab) => tab.entityId === sessionId)
  if (!sessionId || !open) {
    return launchReviewerAgent(scope, slug, reviewerId, 'claude', openPrompt(prompt))
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
    ? `Simulated ${reviewerId} is still starting. Try again shortly.`
    : result.status === 'unconfirmed'
      ? 'Delivery could not be confirmed. Check the chat first.'
      : `Simulated ${reviewerId} did not accept the request.`
}
