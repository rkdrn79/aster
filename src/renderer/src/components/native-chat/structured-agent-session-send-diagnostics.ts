// One trace entry per structured chat send, so a send nobody could confirm can be explained from the
// logs: when its request went out, what answered it, how the host was asked afterwards, and how it
// ended. Timings and kinds only: never the message, its id or the chat's.

import { recordRendererCrashBreadcrumb } from '@/lib/crash-breadcrumb-recorder'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'

export const STRUCTURED_AGENT_SESSION_SEND_BREADCRUMB = 'structured_send_outcome'

/** What answered the send's one request. */
export type StructuredAgentSessionSendAnswerKind =
  | 'recorded'
  | 'not-recorded'
  | 'uncertain'
  | 'not-sent'

/** How the send ended: its own answer, the host's journal, a check the sender made, or none. */
export type StructuredAgentSessionSendSettledBy =
  | 'reply'
  | 'journal'
  | 'check'
  | 'deadline'
  | 'stop'
  | 'drop'

type SendMarks = {
  startedAt: number
  target: RuntimeClientTarget['kind']
  delivery: 'queue' | 'direct'
  issuedAt?: number
  answeredAt?: number
  answer?: StructuredAgentSessionSendAnswerKind
  /** The error code a thrown answer carried, when it carried one. */
  answerCode?: string
  /** The host's state for the message in its answer: a card, or its submission's dispatch state. */
  hostState?: string
  deadlinePassed?: true
  confirmStartedAt?: number
  checks: number
  unreachableChecks: number
}

const marks = new Map<string, SendMarks>()

export function noteStructuredAgentSessionSendStarted(
  clientMessageId: string,
  target: RuntimeClientTarget,
  delivery: 'queue-if-active' | undefined,
  now = Date.now()
): void {
  marks.set(clientMessageId, {
    startedAt: now,
    target: target.kind,
    delivery: delivery ? 'queue' : 'direct',
    checks: 0,
    unreachableChecks: 0
  })
}

export function noteStructuredAgentSessionSendIssued(clientMessageId: string): void {
  const mark = marks.get(clientMessageId)
  if (mark && mark.issuedAt === undefined) {
    mark.issuedAt = Date.now()
  }
}

export function noteStructuredAgentSessionSendAnswered(
  clientMessageId: string,
  answer: StructuredAgentSessionSendAnswerKind,
  details: { code?: string; hostState?: string } = {}
): void {
  const mark = marks.get(clientMessageId)
  if (mark) {
    mark.answeredAt = Date.now()
    mark.answer = answer
    if (details.code) {
      mark.answerCode = details.code
    }
    if (details.hostState) {
      mark.hostState = details.hostState
    }
  }
}

/** What a check found the host holding it as. */
export function noteStructuredAgentSessionSendHostState(
  clientMessageId: string,
  hostState: string
): void {
  const mark = marks.get(clientMessageId)
  if (mark) {
    mark.hostState = hostState
  }
}

export function noteStructuredAgentSessionSendDeadline(clientMessageId: string): void {
  const mark = marks.get(clientMessageId)
  if (mark) {
    mark.deadlinePassed = true
  }
}

export function noteStructuredAgentSessionSendCheck(
  clientMessageId: string,
  result: 'held' | 'absent' | 'unreachable'
): void {
  const mark = marks.get(clientMessageId)
  if (!mark) {
    return
  }
  mark.confirmStartedAt ??= Date.now()
  mark.checks += 1
  if (result === 'unreachable') {
    mark.unreachableChecks += 1
  }
}

/** Writes the send's one entry and forgets it. */
export function recordStructuredAgentSessionSendOutcome(
  clientMessageId: string,
  outcome: string,
  settledBy: StructuredAgentSessionSendSettledBy
): void {
  const mark = marks.get(clientMessageId)
  if (!mark) {
    return
  }
  marks.delete(clientMessageId)
  const now = Date.now()
  const since = (at: number | undefined): number | null =>
    at === undefined ? null : at - mark.startedAt
  recordRendererCrashBreadcrumb(STRUCTURED_AGENT_SESSION_SEND_BREADCRUMB, {
    outcome,
    settledBy,
    target: mark.target,
    delivery: mark.delivery,
    totalMs: now - mark.startedAt,
    issuedMs: since(mark.issuedAt),
    answeredMs: since(mark.answeredAt),
    answer: mark.answer ?? 'none',
    answerCode: mark.answerCode ?? null,
    hostState: mark.hostState ?? null,
    deadlinePassed: mark.deadlinePassed === true,
    confirmMs: mark.confirmStartedAt === undefined ? null : now - mark.confirmStartedAt,
    checks: mark.checks,
    unreachableChecks: mark.unreachableChecks
  })
}

export function resetStructuredAgentSessionSendDiagnosticsForTests(): void {
  marks.clear()
}
