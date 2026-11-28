/**
 * Which chats on a managed server an update would cut, and continuing the ones it did cut.
 *
 * The chat agents (Claude, Codex) run as children of orcad, and their supervisor ends them a few
 * seconds after orcad exits. A chat that was idle loses nothing: its next message starts the
 * provider again on the same Claude session or Codex thread. A reply in progress is cut; the new
 * orcad marks that turn as stopped by Orca, and `agentSession.continueInterrupted` carries it on.
 * Every method used here is one the outgoing (older) server already answers.
 */
import type {
  AgentSessionHistoryResult,
  AgentSessionStatusSummary
} from '../../../shared/agent-session-wire'
import { latestNativeChatOrcaStopCut } from '../../../shared/native-chat-orca-stop-cut'

export type ServerChatActivity = {
  /** Chats with a reply in progress, or a live agent waiting on the user mid-reply. */
  busy: { sessionId: string; agent: string }[]
  /** Chats that moved shortly before the probe: a send can start one between probe and stop. */
  recent: string[]
}

/** A reply started this close to the stop may not show as working yet. */
export const RECENT_CHAT_WINDOW_MS = 60_000

export function summarizeChatActivity(
  sessions: readonly AgentSessionStatusSummary[],
  now: number
): ServerChatActivity {
  const busy: ServerChatActivity['busy'] = []
  const recent: string[] = []
  for (const session of sessions) {
    const live = session.hostExecutionOwned === true
    if (
      session.status === 'working' ||
      (live && session.status === 'attention') ||
      (live && session.hostExecutionPhase === 'starting')
    ) {
      busy.push({ sessionId: session.sessionId, agent: String(session.agent) })
    } else if (now - session.updatedAt <= RECENT_CHAT_WINDOW_MS) {
      recent.push(session.sessionId)
    }
  }
  return { busy, recent }
}

export type ServerChatCaller = {
  /** The host's status snapshot; rejects when the server cannot be reached. */
  statusSnapshot: () => Promise<AgentSessionStatusSummary[]>
  call: (method: string, params: unknown) => Promise<unknown>
}

export async function readServerChatActivity(
  caller: ServerChatCaller,
  now: number
): Promise<ServerChatActivity | null> {
  try {
    return summarizeChatActivity(await caller.statusSnapshot(), now)
  } catch {
    // Unreachable is not idle: an update must not assume nothing runs on a host it cannot see.
    return null
  }
}

const HISTORY_TAIL = 60

/** The page's shape as far as finding the cut needs; the rows themselves come from the host. */
function isHistoryResult(value: unknown): value is Pick<AgentSessionHistoryResult, 'page'> {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const page: unknown = Reflect.get(value, 'page')
  return (
    typeof page === 'object' &&
    page !== null &&
    Array.isArray(Reflect.get(page, 'items')) &&
    Array.isArray(Reflect.get(page, 'submissions'))
  )
}

/**
 * Continues each chat whose latest turn an Orca stop cut, among those the update may have cut.
 * The host re-checks the cut under the session lock, so a chat continued from elsewhere first
 * sends nothing twice. Returns the chats it continued.
 */
export async function continueChatsCutByUpdate(
  caller: ServerChatCaller,
  sessionIds: readonly string[]
): Promise<string[]> {
  const continued: string[] = []
  for (const sessionId of new Set(sessionIds)) {
    try {
      const history = await caller.call('agentSession.history', {
        sessionId,
        direction: 'tail',
        limit: HISTORY_TAIL
      })
      const cut = isHistoryResult(history)
        ? latestNativeChatOrcaStopCut(history.page.items, history.page.submissions)
        : null
      if (!cut) {
        continue
      }
      const answer = await caller.call('agentSession.continueInterrupted', {
        sessionId,
        turnItemId: cut.turnItemId
      })
      const outcome = typeof answer === 'object' && answer ? Reflect.get(answer, 'outcome') : null
      if (outcome === 'continued' || outcome === 'pending') {
        continued.push(sessionId)
      }
    } catch (error) {
      console.warn(`[server-auto-update] Could not continue chat ${sessionId}:`, error)
    }
  }
  return continued
}
