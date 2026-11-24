import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { _resetTracerForTests, setActiveSink } from '../../../observability/tracer'
import { AGENT_SESSION_ACCEPTED_SEND_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'

const host = vi.hoisted(() => ({
  send: vi.fn(),
  waitForSendSettlement: vi.fn(async () => null)
}))

vi.mock('./structured-agent-session-gate', () => ({
  requireStructuredSessionHost: () => host,
  structuredCallerFor: () => ({ callerKey: 'desktop' })
}))

import { sendStructuredAgentSessionForClient } from './structured-agent-session-send-compatibility'

const records: unknown[] = []
const Span = z.object({
  name: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  exit: z.object({ _tag: z.string() })
})
const context = {
  clientKind: 'runtime' as const,
  clientCapabilities: [AGENT_SESSION_ACCEPTED_SEND_RUNTIME_CAPABILITY]
}
const body = {
  kind: 'message' as const,
  role: 'user' as const,
  blocks: [{ type: 'text' as const, text: 'private words' }]
}
const params = {
  envelope: {
    sessionId: 's',
    clientOperationId: 'op',
    expectedRuntimeFence: 1,
    payloadFingerprint: 'f'
  },
  body,
  delivery: 'queue-if-active' as const
}

beforeEach(() => {
  records.length = 0
  host.send.mockReset()
  setActiveSink({
    push: (record) => records.push(record),
    flush: () => {},
    close: () => {}
  })
})
afterEach(() => _resetTracerForTests())

function sendSpan(): z.infer<typeof Span> {
  const spans = records.map((record) => Span.parse(record))
  const span = spans.find((record) => record.name === 'agentSession.send')
  if (!span) {
    throw new Error('no agentSession.send span')
  }
  return span
}

// A send a client could not confirm is matched in the host's trace to what the host did with it.
it('traces a send the host held as a card, with its timing and never its words', async () => {
  host.send.mockResolvedValue({
    ok: true,
    replayed: false,
    fence: 1,
    cursor: { epoch: 'e', sequence: 1 },
    value: { clientMessageId: 'op', queued: { messageId: 'op', position: 1, state: 'waiting' } }
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the fields the method reads.
  await sendStructuredAgentSessionForClient(params as never, context as never)
  const span = sendSpan()
  expect(span.attributes).toMatchObject({
    'agent_session.send.result': 'queued',
    'agent_session.send.delivery': 'queue-if-active',
    'agent_session.send.replayed': false
  })
  expect(typeof span.attributes['agent_session.send.accept_ms']).toBe('number')
  expect(JSON.stringify(records)).not.toContain('private words')
})

it('names a refusal by its code, and a held submission as held', async () => {
  host.send.mockResolvedValueOnce({
    ok: false,
    refusal: { code: 'agent_session_conflict', message: 'busy' }
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the fields the method reads.
  await sendStructuredAgentSessionForClient(params as never, context as never)
  expect(sendSpan().attributes).toMatchObject({
    'agent_session.send.result': 'refused',
    'agent_session.send.refusal': 'agent_session_conflict'
  })
  records.length = 0
  host.send.mockResolvedValueOnce({
    ok: true,
    replayed: true,
    fence: 1,
    cursor: { epoch: 'e', sequence: 2 },
    value: {
      clientMessageId: 'op',
      submission: { clientMessageId: 'op', dispatchState: 'pending', handoverRecorded: true }
    }
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the fields the method reads.
  await sendStructuredAgentSessionForClient(params as never, context as never)
  expect(sendSpan().attributes).toMatchObject({
    'agent_session.send.result': 'held',
    'agent_session.send.replayed': true
  })
})
