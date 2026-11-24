// A send whose one request ended without proof either way — its reply lost with a dropped link, a
// timeout, an answer that proves nothing, or the budget running out while it was still out — is
// asked about before anyone is told it could not be confirmed. Asking only reads the host: its queue
// and the journal's rows. Nothing is ever sent again. While the host can't be reached the sender
// waits for contact to come back, up to a window; a host that answers and holds no such message
// is a real loss, said as before.

import { agentJournalSubmissionKey } from '../../../../shared/agent-session-journal-item-key'
import type { AgentJournalCursor } from '../../../../shared/agent-session-journal-types'
import { isQueuedAgentJournalSubmission } from '../../../../shared/agent-session-queued-submission'
import type { AgentSessionHistoryResult } from '../../../../shared/agent-session-wire'
import {
  agentSessionUnconfirmedSendParts,
  agentSessionWriteNotDoneParts
} from '../../../../shared/agent-session-refusal-notice'
import {
  readAgentSessionErrorRefusal,
  type AgentSessionWriteFailure
} from '../../../../shared/agent-session-write-failure'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import {
  callStructuredAgentSession,
  readStructuredAgentSessionItem,
  supportsStructuredAgentSessionItemDetail
} from '@/runtime/structured-agent-session-client'
import {
  findStructuredAgentSessionPendingSend,
  updateStructuredAgentSessionPendingSend,
  type StructuredAgentSessionPendingSend
} from './structured-agent-session-pending-sends'
import {
  handBack,
  runtimes,
  settleRecorded,
  type SendRuntime
} from './structured-agent-session-send-runtime'
import {
  noteStructuredAgentSessionSendCheck,
  noteStructuredAgentSessionSendDeadline,
  noteStructuredAgentSessionSendHostState
} from './structured-agent-session-send-diagnostics'

/** How long, from the first doubt, the sender keeps asking a host it cannot reach. Covers an SSH
 *  reconnect (30 s), its serving probes, and one more request timeout. */
export const STRUCTURED_AGENT_SESSION_SEND_CONFIRM_WINDOW_MS = 90_000
/** Between checks of a host that could not be reached; contact coming back checks at once. */
const RECHECK_DELAYS_MS = [2_000, 4_000, 8_000, 15_000]
/** A host that answers without the message is asked once more, this long after, before it counts
 *  as lost: a request it is still taking in lands meanwhile. */
export const STRUCTURED_AGENT_SESSION_SEND_ABSENT_RECHECK_MS = 2_000
/** The tail the check reads: a message sent moments ago is on it unless the agent has written
 *  this many rows since; past that the item read names it exactly. */
const CHECK_PAGE_LIMIT = 100

export type StructuredAgentSessionHeldCheck =
  | { kind: 'held'; cursor: AgentJournalCursor | null; hostState: string }
  | { kind: 'absent' }
  | { kind: 'unreachable' }

/** Whether the host holds a message under this id: a card on its queue (or one it handed off), or
 *  a row in the journal. Reads only; a read that fails says nothing either way. */
export async function checkStructuredAgentSessionSendHeld(
  target: RuntimeClientTarget,
  sessionId: string,
  clientMessageId: string
): Promise<StructuredAgentSessionHeldCheck> {
  const key = agentJournalSubmissionKey(clientMessageId)
  let page: AgentSessionHistoryResult['page']
  try {
    const history = await callStructuredAgentSession<AgentSessionHistoryResult>(
      target,
      'agentSession.history',
      { sessionId, direction: 'tail', limit: CHECK_PAGE_LIMIT }
    )
    page = history.page
  } catch (error) {
    // A refusal is the host answering without it; anything else says nothing either way.
    return readAgentSessionErrorRefusal(error) ? { kind: 'absent' } : { kind: 'unreachable' }
  }
  const cursor = page.liveCursor ?? page.window.newest
  if (page.queuedMessages?.some((card) => card.messageId === clientMessageId)) {
    return { kind: 'held', cursor, hostState: 'queued' }
  }
  const submission = page.submissions.find(
    (entry) =>
      entry.clientMessageId === clientMessageId || entry.queuedMessageId === clientMessageId
  )
  if (submission) {
    const hostState = isQueuedAgentJournalSubmission(submission) ? 'held' : submission.dispatchState
    return { kind: 'held', cursor, hostState }
  }
  if (page.items.some((item) => item.itemId === key)) {
    return { kind: 'held', cursor, hostState: 'row' }
  }
  if (!page.hasOlder) {
    return { kind: 'absent' }
  }
  try {
    if (!(await supportsStructuredAgentSessionItemDetail(target))) {
      // An older host and a long chat: nothing here can tell, so it is not called lost.
      return { kind: 'unreachable' }
    }
    const item = await readStructuredAgentSessionItem(target, sessionId, key)
    return item ? { kind: 'held', cursor, hostState: 'row' } : { kind: 'absent' }
  } catch {
    return { kind: 'unreachable' }
  }
}

function live(runtime: SendRuntime, sessionId: string, clientMessageId: string): boolean {
  return (
    runtimes.get(clientMessageId) === runtime &&
    !runtime.abort.signal.aborted &&
    findStructuredAgentSessionPendingSend(sessionId, clientMessageId)?.phase === 'sending'
  )
}

/** Resolves after `delayMs`, or sooner: contact with the host coming back, the send's own request
 *  ending, or the send ending some other way. */
function nextCheck(runtime: SendRuntime, delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    const cleanups: (() => void)[] = []
    const done = (): void => {
      for (const cleanup of cleanups.splice(0)) {
        cleanup()
      }
      resolve()
    }
    const timer = setTimeout(done, delayMs)
    cleanups.push(() => clearTimeout(timer))
    if (runtime.target.kind === 'environment') {
      const { environmentId } = runtime.target
      // Loaded on first use: the store it reads must never be in the sender's import graph.
      void import('@/runtime/runtime-host-contact-regained').then(
        ({ subscribeRuntimeHostContactRegained }) => {
          if (cleanups.length > 0) {
            cleanups.push(subscribeRuntimeHostContactRegained(environmentId, done))
          }
        },
        () => {}
      )
    }
    if (runtime.requestOut) {
      void runtime.requestEnded.then(done)
    }
    runtime.abort.signal.addEventListener('abort', done, { once: true })
    cleanups.push(() => runtime.abort.signal.removeEventListener('abort', done))
  })
}

function checkWithin(
  runtime: SendRuntime,
  entry: StructuredAgentSessionPendingSend,
  waitMs: number
): Promise<StructuredAgentSessionHeldCheck> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ kind: 'unreachable' }), Math.max(0, waitMs))
    void checkStructuredAgentSessionSendHeld(
      runtime.target,
      entry.sessionId,
      entry.clientMessageId
    ).then(
      (result) => {
        clearTimeout(timer)
        resolve(result)
      },
      () => {
        // A page this build can't read says nothing either way.
        clearTimeout(timer)
        resolve({ kind: 'unreachable' })
      }
    )
  })
}

/**
 * Asks the host about a send nobody could confirm, until it says, the send settles another way
 * (its request's answer, the journal), or the window ends. `thrownRefusal` is what the request's
 * answer said, kept for the words if it ends unconfirmed. One loop per send: a second doubt only
 * updates those words.
 */
export async function confirmStructuredAgentSessionSend(
  entry: StructuredAgentSessionPendingSend,
  thrownRefusal: AgentSessionWriteFailure | null
): Promise<void> {
  const { sessionId, clientMessageId } = entry
  const runtime = runtimes.get(clientMessageId)
  if (!runtime) {
    return
  }
  if (!runtime.confirming || thrownRefusal) {
    runtime.unconfirmedParts = agentSessionUnconfirmedSendParts(thrownRefusal)
  }
  if (runtime.confirming) {
    return
  }
  runtime.confirming = true
  clearTimeout(runtime.deadline)
  updateStructuredAgentSessionPendingSend(sessionId, clientMessageId, { confirming: true })
  const giveUpAt = Date.now() + STRUCTURED_AGENT_SESSION_SEND_CONFIRM_WINDOW_MS
  let unreachable = 0
  let absentOnce = false
  while (live(runtime, sessionId, clientMessageId)) {
    const check = await checkWithin(runtime, entry, giveUpAt - Date.now())
    noteStructuredAgentSessionSendCheck(clientMessageId, check.kind)
    if (!live(runtime, sessionId, clientMessageId)) {
      return
    }
    const current = findStructuredAgentSessionPendingSend(sessionId, clientMessageId)
    if (!current) {
      return
    }
    if (check.kind === 'held') {
      noteStructuredAgentSessionSendHostState(clientMessageId, check.hostState)
      settleRecorded(current, null, 'check', check.cursor)
      return
    }
    if (check.kind === 'absent' && !runtime.requestOut) {
      if (absentOnce) {
        // The host answered twice, its request long over, and holds nothing under the id.
        handBack(current, runtime.unconfirmedParts, 'check')
        return
      }
      absentOnce = true
    }
    if (Date.now() >= giveUpAt) {
      runtime.abort.abort()
      handBack(current, runtime.unconfirmedParts, 'check')
      return
    }
    // Not there while its request is still out: its answer, when it comes, wakes the next check.
    const delay =
      check.kind === 'absent' && !runtime.requestOut
        ? STRUCTURED_AGENT_SESSION_SEND_ABSENT_RECHECK_MS
        : RECHECK_DELAYS_MS[Math.min(unreachable++, RECHECK_DELAYS_MS.length - 1)]!
    await nextCheck(runtime, Math.min(delay, Math.max(0, giveUpAt - Date.now())))
  }
}

/** The send's budget ran out: one never sent goes back as not sent; one whose request is out is
 *  asked about instead of given up on. */
export function onStructuredAgentSessionSendDeadline(
  sessionId: string,
  clientMessageId: string
): void {
  const entry = findStructuredAgentSessionPendingSend(sessionId, clientMessageId)
  if (!entry || entry.phase === 'recorded') {
    return
  }
  noteStructuredAgentSessionSendDeadline(clientMessageId)
  if (!entry.issued) {
    runtimes.get(clientMessageId)?.abort.abort()
    handBack(entry, ['unreachable', ...agentSessionWriteNotDoneParts('composer-send')], 'deadline')
    return
  }
  void confirmStructuredAgentSessionSend(entry, null)
}

/** A launch's first message rides on its create, whose own recovery reads the chat once it
 *  exists: at the budget it goes back as before, as unconfirmed when its request went out. */
export function handBackStructuredAgentSessionSendAtDeadline(
  sessionId: string,
  clientMessageId: string
): void {
  const entry = findStructuredAgentSessionPendingSend(sessionId, clientMessageId)
  if (!entry || entry.phase === 'recorded') {
    return
  }
  noteStructuredAgentSessionSendDeadline(clientMessageId)
  runtimes.get(clientMessageId)?.abort.abort()
  handBack(
    entry,
    entry.issued
      ? agentSessionUnconfirmedSendParts(undefined)
      : ['unreachable', ...agentSessionWriteNotDoneParts('composer-send')],
    'deadline'
  )
}
