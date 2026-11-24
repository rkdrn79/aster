import type {
  AgentJournalCursor,
  AgentJournalSubmission
} from '../../../../shared/agent-session-journal-types'
import {
  agentSessionUnconfirmedSendParts,
  agentSessionWriteNoticeParts,
  agentSessionWriteNotDoneParts
} from '../../../../shared/agent-session-refusal-notice'
import type { AgentSessionWriteNoticePart } from '../../../../shared/agent-session-write-notice-copy'
import type { AgentSessionWriteFailure } from '../../../../shared/agent-session-write-failure'
import { dispatchWasWithdrawn } from '../../../../shared/structured-agent-session-dispatch-rejection'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { agentSessionWriteNoticeText } from './agent-session-write-notice-text'
import { nativeChatRewindReasonCopy } from './native-chat-rewind-copy'
import { handBackStructuredAgentSessionMessage } from './structured-agent-session-message-hand-back'
import {
  publishStructuredAgentSessionSends,
  structuredAgentSessionSendsWatched,
  updateStructuredAgentSessionPendingSend,
  type StructuredAgentSessionPendingSend
} from './structured-agent-session-pending-sends'
import {
  noteStructuredAgentSessionSendIssued,
  noteStructuredAgentSessionSendStarted,
  recordStructuredAgentSessionSendOutcome,
  type StructuredAgentSessionSendSettledBy
} from './structured-agent-session-send-diagnostics'

/** How long a send may go without an answer before the sender asks the host about it. */
export const STRUCTURED_AGENT_SESSION_SEND_BUDGET_MS = 30_000

export type StructuredAgentSessionSendOutcome = 'recorded' | 'returned' | 'unconfirmed' | 'dropped'

export type SendRuntime = {
  target: RuntimeClientTarget
  abort: AbortController
  deadline: ReturnType<typeof setTimeout>
  resolve: (outcome: StructuredAgentSessionSendOutcome) => void
  /** Its one request is out and unanswered. */
  requestOut: boolean
  /** Settles when that request is answered, however. */
  requestEnded: Promise<void>
  endRequest: () => void
  /** The sender is asking the host about it (`confirmStructuredAgentSessionSend`). */
  confirming: boolean
  /** The words it goes back with if nobody can confirm it. */
  unconfirmedParts: AgentSessionWriteNoticePart[]
}

export const runtimes = new Map<string, SendRuntime>()

/** Ends a send for good: the entry leaves (or stays as `recorded`) and its caller is answered. */
export function finish(
  entry: StructuredAgentSessionPendingSend,
  outcome: StructuredAgentSessionSendOutcome,
  keep?: Partial<StructuredAgentSessionPendingSend>,
  settledBy: StructuredAgentSessionSendSettledBy = 'reply'
): void {
  const runtime = runtimes.get(entry.clientMessageId)
  if (runtime) {
    clearTimeout(runtime.deadline)
    runtimes.delete(entry.clientMessageId)
    runtime.endRequest()
    runtime.resolve(outcome)
    recordStructuredAgentSessionSendOutcome(entry.clientMessageId, outcome, settledBy)
  }
  updateStructuredAgentSessionPendingSend(entry.sessionId, entry.clientMessageId, keep ?? null)
}

/** Its one request goes out now: from here on it may reach the host. */
export function markStructuredAgentSessionSendIssued(
  entry: StructuredAgentSessionPendingSend
): void {
  const runtime = runtimes.get(entry.clientMessageId)
  if (runtime) {
    runtime.requestOut = true
  }
  noteStructuredAgentSessionSendIssued(entry.clientMessageId)
  updateStructuredAgentSessionPendingSend(entry.sessionId, entry.clientMessageId, { issued: true })
}

/** Its request was answered, whatever the answer proves. */
export function markStructuredAgentSessionSendAnswered(clientMessageId: string): void {
  runtimes.get(clientMessageId)?.endRequest()
}

/** Puts the text back in the chat's composer; false, reported, when the draft write threw. */
function returnToComposer(entry: StructuredAgentSessionPendingSend): boolean {
  try {
    handBackStructuredAgentSessionMessage(
      entry.sessionId,
      entry.clientMessageId,
      entry.body,
      entry.imageConnectionIds
    )
    return true
  } catch (error) {
    console.error('[native-chat-send] a message could not be put back in the composer', error)
    return false
  }
}

export function handBack(
  entry: StructuredAgentSessionPendingSend,
  notice: readonly AgentSessionWriteNoticePart[] | null,
  settledBy: StructuredAgentSessionSendSettledBy = 'reply'
): void {
  try {
    if (entry.callerKeepsText) {
      return
    }
    const parts: readonly AgentSessionWriteNoticePart[] | null = returnToComposer(entry)
      ? notice
      : [...(notice ?? []), 'messageNotSaved']
    if (parts) {
      publishStructuredAgentSessionSends(entry.sessionId, {
        notice: agentSessionWriteNoticeText([...parts])
      })
    }
  } finally {
    // Bookkeeping never holds the chat: whatever the hand-back met, the send ends.
    finish(
      entry,
      notice?.includes('sendOutcomeLost') ? 'unconfirmed' : 'returned',
      undefined,
      settledBy
    )
  }
}

/** Settled by the host's answer: the send's own reply, the journal, or the sender's check, whichever
 *  comes first. */
export function settleRecorded(
  entry: StructuredAgentSessionPendingSend,
  submission: AgentJournalSubmission | null,
  from: 'reply' | 'journal' | 'check',
  cursor?: AgentJournalCursor | null
): void {
  // A message a Stop took back stays in the chat with its stop row, drawn by the host's row; the
  // composer is left alone. An open chat draws a recorded one until its row arrives, which can
  // trail the reply or the check.
  const keep =
    from !== 'journal' &&
    !(submission && dispatchWasWithdrawn(submission)) &&
    structuredAgentSessionSendsWatched(entry.sessionId)
  finish(
    entry,
    'recorded',
    keep
      ? {
          phase: 'recorded',
          issued: true,
          confirming: undefined,
          ...(cursor ? { recordedCursor: cursor } : {})
        }
      : undefined,
    from
  )
}

/** Why the host turned the send away. Behind a rewind whose outcome is unknown it was not sent: the
 *  rewind's words say why, and the next send has the host check it first. */
export function refusedSendParts(failure: AgentSessionWriteFailure): AgentSessionWriteNoticePart[] {
  return failure.kind === 'refused' && failure.details?.reason === 'rewindUnconfirmed'
    ? [
        { text: nativeChatRewindReasonCopy('outcome-unknown') },
        ...agentSessionWriteNotDoneParts('composer-send')
      ]
    : agentSessionWriteNoticeParts(failure, 'composer-send')
}

export type StructuredAgentSessionSent = {
  clientMessageId: string
  outcome: Promise<StructuredAgentSessionSendOutcome>
}

/** Sends a message holding its chat's slot; its budget starts now, and at its end `onDeadline`
 *  decides (`onStructuredAgentSessionSendDeadline`). */
export function beginSend(
  entry: StructuredAgentSessionPendingSend,
  target: RuntimeClientTarget,
  onDeadline: (sessionId: string, clientMessageId: string) => void,
  budgetMs = STRUCTURED_AGENT_SESSION_SEND_BUDGET_MS
): StructuredAgentSessionSent {
  const { clientMessageId, sessionId } = entry
  noteStructuredAgentSessionSendStarted(clientMessageId, target, entry.delivery)
  let endRequest = (): void => {}
  const requestEnded = new Promise<void>((resolve) => {
    endRequest = resolve
  })
  const outcome = new Promise<StructuredAgentSessionSendOutcome>((resolve) => {
    const runtime: SendRuntime = {
      target,
      abort: new AbortController(),
      deadline: setTimeout(() => onDeadline(sessionId, clientMessageId), budgetMs),
      resolve,
      requestOut: false,
      requestEnded,
      endRequest: () => {
        runtime.requestOut = false
        endRequest()
      },
      confirming: false,
      unconfirmedParts: agentSessionUnconfirmedSendParts(undefined)
    }
    runtimes.set(clientMessageId, runtime)
  })
  return { clientMessageId, outcome }
}
