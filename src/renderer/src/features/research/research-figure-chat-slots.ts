import type { ResearchDocument } from '../../../../shared/research/research-records'
import { researchConversationHomeKey, writingAgentScopeKey } from './research-conversation-home'

export type FiguresAgentScope = { hostId: string; workspaceId: string }

// Why bounded: the list only keeps old chats reachable from the sidebar, and a long-lived project
// must not grow it forever; the chats themselves stay open either way.
const PAST_CHATS_KEPT = 100

/**
 * The chat bound to one figure of a project; `slug` null is the project's chat for requests made
 * with no figure open (the only chat older versions had).
 */
export function figureAgentSessionId(
  document: ResearchDocument | null,
  scope: FiguresAgentScope,
  slug: string | null
): string | undefined {
  const key = writingAgentScopeKey(scope)
  return slug === null
    ? document?.figuresAgentSessionByScope?.[key]
    : document?.figureAgentSessionsByScope?.[key]?.[slug]
}

/** The figure a chat is bound to, or null when no figure holds it. */
export function figureOfChat(
  document: ResearchDocument | null,
  scope: FiguresAgentScope,
  sessionId: string
): string | null {
  const figures = document?.figureAgentSessionsByScope?.[writingAgentScopeKey(scope)]
  return Object.entries(figures ?? {}).find(([, id]) => id === sessionId)?.[0] ?? null
}

/** Every chat a figure of the project holds, plus the project's own. */
export function figureChatSessions(
  document: ResearchDocument | null,
  scope: FiguresAgentScope
): string[] {
  const key = writingAgentScopeKey(scope)
  const figures = Object.values(document?.figureAgentSessionsByScope?.[key] ?? {})
  const project = document?.figuresAgentSessionByScope?.[key]
  return [...new Set(project ? [...figures, project] : figures)].sort()
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([entry]) => entry !== key))
}

/**
 * Binds or clears one figure's chat. A chat lives in one place: binding moves it off any other
 * figure and off the project's slot, and a chat that loses its place stays listed under Figures.
 */
export function withFigureAgentSession(
  current: ResearchDocument,
  scope: FiguresAgentScope,
  slug: string | null,
  sessionId: string | null
): ResearchDocument {
  const key = writingAgentScopeKey(scope)
  const figures = { ...current.figureAgentSessionsByScope?.[key] }
  let projectChat = current.figuresAgentSessionByScope?.[key] ?? null
  const past = (current.figureAgentPastSessionsByScope?.[key] ?? []).filter(
    (entry) => entry !== sessionId
  )
  const previous = slug === null ? projectChat : (figures[slug] ?? null)
  if (sessionId) {
    for (const [figure, entry] of Object.entries(figures)) {
      if (entry === sessionId) {
        delete figures[figure]
      }
    }
    if (projectChat === sessionId) {
      projectChat = null
    }
  }
  if (slug === null) {
    projectChat = sessionId
  } else if (sessionId) {
    figures[slug] = sessionId
  } else {
    delete figures[slug]
  }
  if (previous && previous !== sessionId && !past.includes(previous)) {
    past.push(previous)
  }
  const conversationHomes = { ...current.conversationHomes }
  if (sessionId) {
    delete conversationHomes[
      researchConversationHomeKey(scope.hostId, scope.workspaceId, sessionId)
    ]
  }
  const rebuttal = current.rebuttalAgentSessionByScope
  const projectChats = withoutKey(current.figuresAgentSessionByScope ?? {}, key)
  return {
    ...current,
    conversationHomes,
    figuresAgentSessionByScope: projectChat
      ? { ...projectChats, [key]: projectChat }
      : projectChats,
    figureAgentSessionsByScope: {
      ...current.figureAgentSessionsByScope,
      [key]: figures
    },
    figureAgentPastSessionsByScope: {
      ...current.figureAgentPastSessionsByScope,
      [key]: past.slice(-PAST_CHATS_KEPT)
    },
    ...(rebuttal && sessionId && rebuttal[key] === sessionId
      ? { rebuttalAgentSessionByScope: withoutKey(rebuttal, key) }
      : {})
  }
}

/** A renamed figure keeps its chat. */
export function withRenamedFigureChat(
  current: ResearchDocument,
  scope: FiguresAgentScope,
  from: string,
  to: string
): ResearchDocument {
  const key = writingAgentScopeKey(scope)
  const sessionId = current.figureAgentSessionsByScope?.[key]?.[from]
  if (!sessionId || from === to) {
    return current
  }
  const { [from]: _moved, ...others } = current.figureAgentSessionsByScope?.[key] ?? {}
  return {
    ...current,
    figureAgentSessionsByScope: {
      ...current.figureAgentSessionsByScope,
      [key]: { ...others, [to]: sessionId }
    }
  }
}

/** Gives a figure back the chat it had when it was deleted, unless it has a new one by now. */
export function withRestoredFigureChat(
  current: ResearchDocument,
  scope: FiguresAgentScope,
  slug: string,
  sessionId: string
): ResearchDocument {
  return figureAgentSessionId(current, scope, slug)
    ? current
    : withFigureAgentSession(current, scope, slug, sessionId)
}

/**
 * The once-per-project step from one chat to one per figure: the chat an older version kept moves
 * onto `slug` (the figure it last worked on), or stays the project's when `slug` is null or that
 * figure has a chat by now. A later chat for "no figure open" is never moved.
 */
export function withLegacyChatDecided(
  current: ResearchDocument,
  scope: FiguresAgentScope,
  slug: string | null
): ResearchDocument {
  const key = writingAgentScopeKey(scope)
  if (current.figureAgentSessionsByScope?.[key]) {
    return current
  }
  const legacy = figureAgentSessionId(current, scope, null)
  return legacy && slug && !figureAgentSessionId(current, scope, slug)
    ? withFigureAgentSession(current, scope, slug, legacy)
    : {
        ...current,
        figureAgentSessionsByScope: { ...current.figureAgentSessionsByScope, [key]: {} }
      }
}

/** Whether this project already made that step (any per-figure binding made it). */
export function figureChatsDecided(
  document: ResearchDocument | null,
  scope: FiguresAgentScope
): boolean {
  return Boolean(document?.figureAgentSessionsByScope?.[writingAgentScopeKey(scope)])
}
