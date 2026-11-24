import {
  AGENT_SESSION_ACCEPTED_SEND_RUNTIME_CAPABILITY,
  AGENT_SESSION_PENDING_SEND_RESULT_RUNTIME_CAPABILITY
} from '../../../../shared/protocol-version'
import {
  agentSessionSendSubmission,
  type AgentSessionMutationResult,
  type AgentSessionSendResult
} from '../../../../shared/agent-session-wire'
import { isQueuedAgentJournalSubmission } from '../../../../shared/agent-session-queued-submission'
import { startSpan, type ActiveSpan } from '../../../observability/tracer'
import type { StructuredAgentSessionHost } from '../../../native-chat/agent-session-wire/structured-agent-session-host'
import { STRUCTURED_AGENT_SESSION_START_WAIT_MS } from '../../../native-chat/agent-session-wire/structured-agent-session-send-settlement'
import type { RpcContext } from '../core'
import { requireStructuredSessionHost, structuredCallerFor } from './structured-agent-session-gate'
import { readsQueuedImageCards } from './structured-agent-session-queued-image-capability'

/**
 * A send answers once the host accepts it. A client that predates that answer cannot show a
 * message rejected after it, so its reply is held until the message is handed over or rejected —
 * or queued behind a running command such as `/compact`, which could outlast the client's own
 * request timeout; one that predates pending replies at all waits, as before, for the provider's
 * answer.
 */
export async function sendStructuredAgentSessionForClient(
  params: Parameters<StructuredAgentSessionHost['send']>[1],
  context: RpcContext
) {
  // One span per send, so a send a client could not confirm can be matched to what the host did
  // with it and when: kinds and timings only, never the message.
  const span = startSpan('agentSession.send', {
    attributes: {
      kind: 'agent-session',
      'agent_session.send.delivery': params.delivery ?? 'direct',
      'agent_session.send.client': context.clientKind ?? 'unknown'
    }
  })
  const startedAt = Date.now()
  try {
    const result = await sendForClient(params, context, span, startedAt)
    describeSendResult(span, result)
    span.end()
    return result
  } catch (error) {
    span.fail(error instanceof Error ? error.name : 'thrown')
    throw error
  }
}

function describeSendResult(
  span: ActiveSpan,
  result: AgentSessionMutationResult<AgentSessionSendResult>
): void {
  if (!result.ok) {
    span.setAttribute('agent_session.send.result', 'refused')
    span.setAttribute('agent_session.send.refusal', result.refusal.code)
    return
  }
  span.setAttribute('agent_session.send.replayed', result.replayed === true)
  const submission = agentSessionSendSubmission(result.value)
  span.setAttribute(
    'agent_session.send.result',
    !submission
      ? 'queued'
      : isQueuedAgentJournalSubmission(submission)
        ? 'held'
        : submission.dispatchState
  )
}

async function sendForClient(
  params: Parameters<StructuredAgentSessionHost['send']>[1],
  context: RpcContext,
  span: ActiveSpan,
  startedAt: number
) {
  const host = requireStructuredSessionHost(context, params.envelope.sessionId)
  // Person provenance lets undelivered text recover as an ordinary queued card.
  const result = await host.send(structuredCallerFor(context), {
    ...params,
    userSend: true,
    queuedImageCards: readsQueuedImageCards(context)
  })
  span.setAttribute('agent_session.send.accept_ms', Date.now() - startedAt)
  const capabilities = context.clientCapabilities ?? []
  if (
    !result.ok ||
    // A queued answer only ever reaches a capable client, which renders it as-is.
    agentSessionSendSubmission(result.value)?.dispatchState !== 'pending' ||
    context.clientKind === undefined ||
    capabilities.includes(AGENT_SESSION_ACCEPTED_SEND_RUNTIME_CAPABILITY)
  ) {
    return result
  }
  // The start that used to run before the reply now runs after acceptance, so both waits cover it.
  span.setAttribute('agent_session.send.waited_for_settlement', true)
  const settled = await host.waitForSendSettlement(
    params.envelope.sessionId,
    result.value.clientMessageId,
    {
      until: capabilities.includes(AGENT_SESSION_PENDING_SEND_RESULT_RUNTIME_CAPABILITY)
        ? 'handed-over-or-behind-command'
        : 'answered',
      budgetMs: STRUCTURED_AGENT_SESSION_START_WAIT_MS,
      ...(context.signal ? { signal: context.signal } : {})
    }
  )
  return settled ? { ...result, ...settled } : result
}
