// Where a branch cuts the conversation it copies, from the journal alone: before a turn-opening
// message, as a rewind cuts, or after everything. A turn still running is never copied half done.

import type { AgentSessionBranchCut } from '../../../shared/agent-session-branch'
import {
  agentJournalSubmissionKey,
  parseAgentJournalItemKey
} from '../../../shared/agent-session-journal-item-key'
import type { AgentJournalRenderItem } from '../../../shared/agent-session-journal-types'
import { isQueuedAgentJournalSubmission } from '../../../shared/agent-session-queued-submission'
import { readAgentJournalTurn } from '../../../shared/agent-session-turn-record'
import type { AgentSessionJournal } from '../agent-session-journal/journal-store'
import {
  isStructuredRewindTarget,
  providerItemIdOf,
  structuredRewindCut
} from './structured-rewind-cut'

/** The cut, and how many of the chat's own messages it keeps. `busy`: a turn with no message of
 *  its own (a compaction) is running, so nothing ends cleanly. */
export type StructuredBranchCutAnswer =
  | { cut: AgentSessionBranchCut; keptMessages: number }
  | 'busy'
  | null

/** The turn still running: its record, and the message that opened it, or none for a compaction.
 *  Null when no turn runs. */
function runningTurn(
  items: readonly AgentJournalRenderItem[]
): { recordId: string; opener: string | null } | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const turn = readAgentJournalTurn(items[index]!.body)
    if (turn?.state === 'running') {
      return { recordId: items[index]!.itemId, opener: turn.userItemId ?? null }
    }
  }
  return null
}

/** Where the running turn's prompt sits. Its record may name it by the provider's key or by
 *  Aster's, so either matches; else the first of the person's messages the turn holds. */
function runningPromptIndex(
  journal: AgentSessionJournal,
  items: readonly AgentJournalRenderItem[],
  running: { recordId: string; opener: string | null }
): number {
  const named = running.opener
    ? items.findIndex(
        (item) =>
          item.itemId === running.opener ||
          providerItemIdOf(journal, item.itemId) === running.opener
      )
    : -1
  return named !== -1
    ? named
    : items.findIndex(
        (item) =>
          item.turnScope?.kind === 'turn' &&
          item.turnScope.turnItemId === running.recordId &&
          item.body.kind === 'message' &&
          item.body.role === 'user'
      )
}

/** The person's and the agent's messages as the chat lists them: not a subagent's, nor a send
 *  the agent never took (queued or refused), nor one with no words. */
function countMessages(
  items: readonly AgentJournalRenderItem[],
  journal: AgentSessionJournal
): number {
  const untaken = new Set(
    journal
      .snapshot()
      .submissions.filter(
        (submission) =>
          isQueuedAgentJournalSubmission(submission) || submission.dispatchState === 'rejected'
      )
      .map((submission) => agentJournalSubmissionKey(submission.clientMessageId))
  )
  return items.filter(
    (item) =>
      item.body.kind === 'message' &&
      (item.body.role === 'user' || item.body.role === 'assistant') &&
      item.agentId === undefined &&
      !untaken.has(item.itemId) &&
      item.body.blocks.some((block) => block.type === 'text' && block.text.trim().length > 0)
  ).length
}

/**
 * Before a turn still running, the provider has not answered its prompt yet, so the cut is named by
 * what the finished turns left: Claude's last entry of them, or Codex's last of its turns.
 */
function throughFinishedTurns(
  journal: AgentSessionJournal,
  kept: readonly AgentJournalRenderItem[],
  target: { provider: string; nativeId: string }
): AgentSessionBranchCut {
  for (let index = kept.length - 1; index >= 0; index -= 1) {
    const item = kept[index]!
    if (item.agentId !== undefined) {
      continue
    }
    const key = parseAgentJournalItemKey(providerItemIdOf(journal, item.itemId))
    if (key?.provider === 'claude' && target.provider === 'claude') {
      return { kind: 'through-entry', entry: { sessionId: key.sessionId, uuid: key.uuid } }
    }
    if (
      key?.provider === 'codex' &&
      target.provider === 'codex' &&
      key.threadId === target.nativeId
    ) {
      return { kind: 'before-turn', beforeTurnId: '', keptTurnId: key.turnId }
    }
  }
  return { kind: 'none' }
}

/**
 * The cut for a branch of a chat whose provider conversation is `nativeId`. `beforeItemId` null
 * branches from the latest finished message: a turn still running is left out. Null: the journal
 * can't be cut there.
 */
export function structuredBranchCut(
  journal: AgentSessionJournal,
  target: { provider: string; nativeId: string | null },
  beforeItemId: string | null
): StructuredBranchCutAnswer {
  const items = journal.snapshot().items
  const running = runningTurn(items)
  // The latest finished message, or the cut before the running turn's prompt, which the agent has
  // not answered yet: both keep the finished turns only.
  const prompt = running ? runningPromptIndex(journal, items, running) : -1
  if (beforeItemId === null || (prompt !== -1 && items[prompt]!.itemId === beforeItemId)) {
    if (!running) {
      return { cut: { kind: 'all' }, keptMessages: countMessages(items, journal) }
    }
    const boundary = prompt
    if (boundary === -1) {
      return 'busy'
    }
    const kept = items.slice(0, boundary)
    return {
      cut: target.nativeId
        ? throughFinishedTurns(journal, kept, {
            provider: target.provider,
            nativeId: target.nativeId
          })
        : { kind: 'none' },
      keptMessages: countMessages(kept, journal)
    }
  }
  const boundary = items.findIndex((item) => item.itemId === beforeItemId)
  if (!target.nativeId || boundary === -1 || !isStructuredRewindTarget(journal, beforeItemId)) {
    return null
  }
  let cut: ReturnType<typeof structuredRewindCut>
  try {
    cut = structuredRewindCut(journal, {
      itemId: beforeItemId,
      provider: target.provider,
      nativeId: target.nativeId
    })
  } catch {
    return null
  }
  if (!cut) {
    return null
  }
  const keptMessages = countMessages(items.slice(0, boundary), journal)
  return 'beforeMessage' in cut
    ? { cut: { kind: 'before-message', beforeMessage: cut.beforeMessage }, keptMessages }
    : {
        cut: { kind: 'before-turn', beforeTurnId: cut.beforeTurnId, keptTurnId: cut.keptTurnId },
        keptMessages
      }
}
