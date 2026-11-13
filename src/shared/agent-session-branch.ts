import { z } from 'zod'

// Branching a chat: a copy of its conversation, cut at a message, that a new chat takes over while
// the original keeps everything. The host makes the copy; the client starts the new chat from it.

const Key = z.string().min(1).max(4096)

/** `beforeItemId`: a message that opened a turn; the copy keeps every turn before it. Null keeps
 *  the whole conversation, less a turn still running, which the copy cannot finish. */
export const AgentSessionBranchParamsSchema = z
  .object({ sessionId: Key, beforeItemId: Key.nullable() })
  .strict()
export type AgentSessionBranchParams = z.infer<typeof AgentSessionBranchParamsSchema>

export const AGENT_SESSION_BRANCH_REASONS = [
  // The agent has no way to copy a conversation.
  'unsupported',
  // The agent copies a whole conversation only: it can branch from the latest message.
  'latest-only',
  'invalid-target',
  // Nothing of the conversation is saved yet.
  'not-saved',
  // A turn with no message to cut before is running (a compaction).
  'busy',
  'provider-refused'
] as const
export type AgentSessionBranchReason = (typeof AGENT_SESSION_BRANCH_REASONS)[number]

/** Where the host cuts the conversation it copies: all of it, or before one turn, named the way
 *  the provider names it (Claude: the opening prompt; Codex: the turn, with the last one kept). */
export type AgentSessionBranchCut =
  | { kind: 'all' }
  | { kind: 'before-message'; beforeMessage: { sessionId: string; uuid: string } }
  | { kind: 'before-turn'; beforeTurnId: string; keptTurnId: string | null }
  /** Claude, before a turn still running: through the last entry the finished turns wrote. */
  | { kind: 'through-entry'; entry: { sessionId: string; uuid: string } }
  /** Nothing before the cut was saved: the branch starts empty. */
  | { kind: 'none' }

/** An agent's copy. `providerSessionId`: the conversation a new chat adopts; null when the cut
 *  keeps nothing, so the branch starts empty. */
export type AgentSessionBranchCopy =
  | { ok: true; providerSessionId: string | null }
  | { ok: false; reason: AgentSessionBranchReason }

/** The host's answer: the copy, and how many of the chat's messages (the person's and the agent's,
 *  as the chat shows them) it keeps, which names where the branch was made. */
export type AgentSessionBranchResult =
  | { ok: true; providerSessionId: string | null; keptMessages: number }
  | { ok: false; reason: AgentSessionBranchReason }

export function isAgentSessionBranchResult(value: unknown): value is AgentSessionBranchResult {
  if (!value || typeof value !== 'object') {
    return false
  }
  const ok: unknown = Reflect.get(value, 'ok')
  if (ok === true) {
    const id: unknown = Reflect.get(value, 'providerSessionId')
    const kept: unknown = Reflect.get(value, 'keptMessages')
    return (
      (id === null || (typeof id === 'string' && id.length > 0)) &&
      typeof kept === 'number' &&
      Number.isInteger(kept) &&
      kept >= 0
    )
  }
  const reason: unknown = Reflect.get(value, 'reason')
  return ok === false && AGENT_SESSION_BRANCH_REASONS.some((known) => known === reason)
}

/** How far each agent's chats can branch: from any finished message, or only from the latest. */
export type AgentSessionBranchReach = 'any-message' | 'latest-only'

const BRANCH_REACH: Readonly<Record<string, AgentSessionBranchReach>> = {
  // Claude forks a transcript through any entry; Codex forks a thread through any finished turn.
  claude: 'any-message',
  codex: 'any-message',
  // ACP `session/fork` copies a whole session, and these chats can take one over.
  opencode: 'latest-only',
  opencode2: 'latest-only',
  omp: 'latest-only'
}

/** Null: chats of this agent cannot branch. */
export function agentSessionBranchReach(agent: string): AgentSessionBranchReach | null {
  return Object.hasOwn(BRANCH_REACH, agent) ? BRANCH_REACH[agent]! : null
}
