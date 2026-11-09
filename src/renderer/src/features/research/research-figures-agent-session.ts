import { create } from 'zustand'
import { sendMessageToAgent } from '@/lib/agent-message-send'
import { withAsterContext } from '../../../../shared/aster-context-block'
import { useAppStore } from '@/store'
import type { ResearchDocument } from '../../../../shared/research/research-records'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { researchConversationHomeKey, writingAgentScopeKey } from './research-conversation-home'
import { useResearchRecords } from './research-records-store'

export type FiguresAgentScope = { hostId: string; workspaceId: string }

const FOCUS_EVENT = 'aster:research-figures-agent-focus'
let pendingFocusKey: string | null = null

/** Asks the Figures page of `scope` to show its agent pane once it is on screen. */
export function requestFiguresAgentFocus(scope: FiguresAgentScope): void {
  pendingFocusKey = writingAgentScopeKey(scope)
  window.dispatchEvent(new Event(FOCUS_EVENT))
}

export function consumeFiguresAgentFocus(scope: FiguresAgentScope): boolean {
  if (pendingFocusKey !== writingAgentScopeKey(scope)) {
    return false
  }
  pendingFocusKey = null
  return true
}

export function subscribeFiguresAgentFocus(listener: () => void): () => void {
  window.addEventListener(FOCUS_EVENT, listener)
  return () => window.removeEventListener(FOCUS_EVENT, listener)
}

export function figuresAgentSessionId(
  document: ResearchDocument | null,
  scope: FiguresAgentScope
): string | undefined {
  return document?.figuresAgentSessionByScope?.[writingAgentScopeKey(scope)]
}

/** One Figure chat per project; a chat bound here leaves any other page it was kept on. */
export function withFiguresAgentSession(
  current: ResearchDocument,
  scope: FiguresAgentScope,
  sessionId: string | null
): ResearchDocument {
  const key = writingAgentScopeKey(scope)
  const sessions = { ...current.figuresAgentSessionByScope }
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
  const rebuttal = current.rebuttalAgentSessionByScope
  return {
    ...current,
    conversationHomes,
    figuresAgentSessionByScope: sessions,
    ...(rebuttal && sessionId && rebuttal[key] === sessionId
      ? {
          rebuttalAgentSessionByScope: Object.fromEntries(
            Object.entries(rebuttal).filter(([entry]) => entry !== key)
          )
        }
      : {})
  }
}

export async function bindFiguresAgentSession(
  scope: FiguresAgentScope,
  sessionId: string | null
): Promise<void> {
  await useResearchRecords
    .getState()
    .update((current) => withFiguresAgentSession(current, scope, sessionId))
}

/** Starts the project's Figure chat and binds it; an optional first prompt is sent once ready. */
export async function launchFiguresAgent(
  scope: FiguresAgentScope,
  agent: TuiAgent,
  prompt?: string
): Promise<string | null> {
  const { launchResearchChat } = await import('./ResearchAgentChatPane')
  const result = await launchResearchChat({
    hostId: scope.hostId,
    workspaceId: scope.workspaceId,
    agent,
    ...(prompt ? { prompt } : {}),
    label: 'Figure agent',
    activate: false
  })
  if ('error' in result) {
    return result.error
  }
  try {
    await bindFiguresAgentSession(scope, result.sessionId)
    return null
  } catch (cause) {
    return `Figure chat started but was not linked. ${String(cause)}`
  }
}

export type FigureMessageContext = { key: string; label: string; body: string }

// Why per chat: the agent keeps a context it was given; a new chat or another figure needs it again.
const contextSentBySession = new Map<string, string>()

/** The figure each Figure chat last heard about, so the pane can mark a switch of figure. */
export const useFigureChatScope = create<{ figureBySession: Record<string, string | null> }>(
  () => ({ figureBySession: {} })
)

/** The figure slug a context key names (its scene path), or null for the figures folder. */
export function figureSlugFromContextKey(key: string): string | null {
  const path = key.split('|')[0] ?? ''
  const match = /([^/\\]+)\.excalidraw$/.exec(path)
  return match ? match[1] : null
}

export function noteFigureContextSent(sessionId: string, key: string): void {
  contextSentBySession.set(sessionId, key)
  const figure = figureSlugFromContextKey(key)
  useFigureChatScope.setState((state) =>
    state.figureBySession[sessionId] === figure
      ? state
      : { figureBySession: { ...state.figureBySession, [sessionId]: figure } }
  )
}

/**
 * What a message typed in the Figure chat sends: the open figure's context block on the first
 * message of a chat and whenever the figure (or its page) changed since; plain text otherwise.
 */
export function withFigureMessageContext(
  sessionId: string,
  text: string,
  context: FigureMessageContext | null
): string {
  if (!context || !text.trim() || text.startsWith('/')) {
    return text
  }
  if (contextSentBySession.get(sessionId) === context.key) {
    return text
  }
  noteFigureContextSent(sessionId, context.key)
  return withAsterContext(text, { label: context.label, body: context.body })
}

/** Sends to the bound Figure chat, starting a Claude chat with the prompt when none is open. */
export async function sendFiguresPrompt(
  scope: FiguresAgentScope,
  prompt: string,
  /** The figure context the prompt already carries, so typed messages need not repeat it. */
  contextKey?: string
): Promise<string | null> {
  const sessionId = figuresAgentSessionId(useResearchRecords.getState().document, scope)
  const { researchChatSessionTabs } = await import('./ResearchAgentChatPane')
  const state = useAppStore.getState()
  const open = researchChatSessionTabs(
    state,
    state.unifiedTabsByWorktree[scope.workspaceId] ?? [],
    scope.hostId
  ).some((tab) => tab.entityId === sessionId)
  if (!sessionId || !open) {
    const failure = await launchFiguresAgent(scope, 'claude', prompt)
    const launched = figuresAgentSessionId(useResearchRecords.getState().document, scope)
    if (!failure && launched && contextKey) {
      noteFigureContextSent(launched, contextKey)
    }
    return failure
  }
  const result = await sendMessageToAgent({
    worktreeId: scope.workspaceId,
    target: { kind: 'structured-session', sessionId },
    prompt
  })
  if (result.status === 'sent') {
    if (contextKey) {
      noteFigureContextSent(sessionId, contextKey)
    }
    return null
  }
  return result.status === 'not-ready'
    ? 'The Figure chat is still starting. Try again shortly.'
    : result.status === 'unconfirmed'
      ? 'Delivery could not be confirmed. Check the chat first.'
      : 'The Figure chat did not accept the request.'
}
