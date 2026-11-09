import { sendMessageToAgent } from '@/lib/agent-message-send'
import { withAsterContext } from '../../../../shared/aster-context-block'
import { useAppStore } from '@/store'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { figureFilePaths } from '../../../../research-harness/research-figures-model.mjs'
import { researchChatTitle } from './research-chat-label'
import { writingAgentScopeKey } from './research-conversation-home'
import {
  figureAgentSessionId,
  figureChatsDecided,
  figureOfChat,
  withFigureAgentSession,
  withLegacyChatDecided,
  withRenamedFigureChat,
  withRestoredFigureChat,
  type FiguresAgentScope
} from './research-figure-chat-slots'
import { figureSceneMeta } from './research-figure-list-model'
import { readProjectText } from './research-project-files'
import { selectFigure, useResearchFigures } from './research-figures-store'
import { useResearchRecords } from './research-records-store'

export type { FiguresAgentScope } from './research-figure-chat-slots'
export {
  figureAgentSessionId,
  figureChatSessions,
  figureOfChat
} from './research-figure-chat-slots'

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

export async function bindFigureAgentSession(
  scope: FiguresAgentScope,
  slug: string | null,
  sessionId: string | null
): Promise<void> {
  await useResearchRecords
    .getState()
    .update((current) => withFigureAgentSession(current, scope, slug, sessionId))
}

/** "Figure agent · <title>", so a figure's chat is recognisable in the sidebar. */
export function figureChatLabel(name: string | null): string {
  return name ? researchChatTitle('Figure agent', name) : 'Figure agent'
}

async function figureTitle(scope: FiguresAgentScope, slug: string): Promise<string | null> {
  const { owner, listing } = useResearchFigures.getState()
  const figure = listing.figures.find((entry) => entry.slug === slug)
  if (!owner || !figure || owner.workspaceId !== scope.workspaceId) {
    return null
  }
  const text = await readProjectText(owner, figureFilePaths(figure.folder, slug).scene).catch(
    () => null
  )
  return text ? figureSceneMeta(text).title : null
}

/**
 * Starts a chat for one figure (or, with `slug` null, for the project) and binds it; an optional
 * first prompt is sent once ready. `onSession` hears the chat's id before it is bound.
 */
export async function launchFigureAgent(
  scope: FiguresAgentScope,
  slug: string | null,
  agent: TuiAgent,
  prompt?: string,
  onSession?: (sessionId: string) => void
): Promise<string | null> {
  const { launchResearchChat } = await import('./ResearchAgentChatPane')
  const title = slug ? ((await figureTitle(scope, slug)) ?? slug) : null
  const result = await launchResearchChat({
    hostId: scope.hostId,
    workspaceId: scope.workspaceId,
    agent,
    ...(prompt ? { prompt } : {}),
    label: figureChatLabel(title),
    activate: false
  })
  if ('error' in result) {
    return result.error
  }
  onSession?.(result.sessionId)
  try {
    await bindFigureAgentSession(scope, slug, result.sessionId)
    return null
  } catch (cause) {
    return `Figure chat started but was not linked. ${String(cause)}`
  }
}

/** Keeps a renamed figure's chat, and its automatic name in step with the figure's. */
export async function renameFigureAgentChat(
  scope: FiguresAgentScope,
  from: { slug: string; title: string | null },
  to: { slug: string; title: string | null }
): Promise<void> {
  await useResearchRecords
    .getState()
    .update((current) => withRenamedFigureChat(current, scope, from.slug, to.slug))
  const sessionId = figureAgentSessionId(useResearchRecords.getState().document, scope, to.slug)
  const state = useAppStore.getState()
  const tab = (state.unifiedTabsByWorktree[scope.workspaceId] ?? []).find(
    (entry) => entry.entityId === sessionId
  )
  // Why compare: a chat the person renamed keeps the name they gave it.
  if (tab?.customLabel === figureChatLabel(from.title ?? from.slug)) {
    state.setTabCustomTitle(tab.id, figureChatLabel(to.title ?? to.slug), {
      recordInteraction: false
    })
  }
}

/** Forgets a deleted figure's chat binding; the chat stays open and listed. */
export async function unbindDeletedFigure(
  scope: FiguresAgentScope,
  slug: string
): Promise<string | null> {
  const sessionId = figureAgentSessionId(useResearchRecords.getState().document, scope, slug)
  if (sessionId) {
    await bindFigureAgentSession(scope, slug, null)
  }
  return sessionId ?? null
}

/** Gives a figure whose delete was undone its chat back. */
export async function restoreDeletedFigureChat(
  scope: FiguresAgentScope,
  slug: string,
  sessionId: string
): Promise<void> {
  await useResearchRecords
    .getState()
    .update((current) => withRestoredFigureChat(current, scope, slug, sessionId))
}

/** Shows a chat's figure, when it is bound to one; the page opens on it. */
export function showFigureOfChat(scope: FiguresAgentScope, sessionId: string): void {
  const slug = figureOfChat(useResearchRecords.getState().document, scope, sessionId)
  if (slug) {
    selectFigure(scope, { kind: 'figure', slug })
  }
}

const legacyChatScanned = new Set<string>()

/**
 * Older versions kept one chat per project. It moves onto the figure with the latest agent turn in
 * its History (the figure it last talked about); with no such turn it stays the project's chat,
 * reachable from the sidebar and the pane's menu. Decided once and kept in the document.
 */
export async function adoptLegacyFigureChat(
  scope: FiguresAgentScope,
  slugs: readonly string[],
  lastAgentTurnFigure: (slugs: readonly string[]) => Promise<string | null>
): Promise<void> {
  const key = writingAgentScopeKey(scope)
  if (
    legacyChatScanned.has(key) ||
    !slugs.length ||
    figureChatsDecided(useResearchRecords.getState().document, scope) ||
    !(await openFigureChatSession(scope, null))
  ) {
    return
  }
  legacyChatScanned.add(key)
  const slug = await lastAgentTurnFigure(slugs)
  await useResearchRecords
    .getState()
    .update((current) => withLegacyChatDecided(current, scope, slug))
}

export type FigureMessageContext = { key: string; label: string; body: string }

// Why per chat: the agent keeps a context it was given; a new chat or a changed figure needs it again.
const contextSentBySession = new Map<string, string>()

export function noteFigureContextSent(sessionId: string, key: string): void {
  contextSentBySession.set(sessionId, key)
}

/**
 * What a message typed in a figure's chat sends: the figure's context block on the first message
 * of the chat and whenever the figure (or its page) changed since; plain text otherwise.
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

/** The figure's chat when its tab is still open. */
export async function openFigureChatSession(
  scope: FiguresAgentScope,
  slug: string | null
): Promise<string | null> {
  const sessionId = figureAgentSessionId(useResearchRecords.getState().document, scope, slug)
  if (!sessionId) {
    return null
  }
  const { researchChatSessionTabs } = await import('./ResearchAgentChatPane')
  const state = useAppStore.getState()
  const open = researchChatSessionTabs(
    state,
    state.unifiedTabsByWorktree[scope.workspaceId] ?? [],
    scope.hostId
  ).some((tab) => tab.entityId === sessionId)
  return open ? sessionId : null
}

// Why one at a time per figure: two quick sends to a figure without a chat must not start two.
const sendQueues = new Map<string, Promise<unknown>>()

function inFigureOrder<T>(
  scope: FiguresAgentScope,
  slug: string | null,
  task: () => Promise<T>
): Promise<T> {
  const key = `${writingAgentScopeKey(scope)}|${slug ?? ''}`
  const run = (sendQueues.get(key) ?? Promise.resolve()).then(task, task)
  sendQueues.set(
    key,
    run.catch(() => undefined)
  )
  return run
}

/**
 * Sends to one figure's chat (the project's when `slug` is null), starting a Claude chat with the
 * prompt when it has none. Other figures' chats are not touched.
 */
export function sendFigurePrompt(
  scope: FiguresAgentScope,
  slug: string | null,
  prompt: string,
  options: {
    /** The figure context the prompt already carries, so typed messages need not repeat it. */
    contextKey?: string
    onSession?: (sessionId: string) => void
  } = {}
): Promise<string | null> {
  return inFigureOrder(scope, slug, async () => {
    const { contextKey, onSession } = options
    const sessionId = await openFigureChatSession(scope, slug)
    if (!sessionId) {
      const failure = await launchFigureAgent(scope, slug, 'claude', prompt, onSession)
      const launched = figureAgentSessionId(useResearchRecords.getState().document, scope, slug)
      if (!failure && launched && contextKey) {
        noteFigureContextSent(launched, contextKey)
      }
      return failure
    }
    onSession?.(sessionId)
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
  })
}
