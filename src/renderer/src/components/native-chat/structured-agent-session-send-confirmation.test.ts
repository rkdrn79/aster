// A send nobody could confirm is asked about before anyone is told: a reply lost with the link, a
// host the link can't reach until it comes back, a budget that ran out with the request still out.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentJournalSubmission } from '../../../../shared/agent-session-journal-types'
import { agentJournalSubmissionKey } from '../../../../shared/agent-session-journal-item-key'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  tail: vi.fn(),
  item: vi.fn(async (): Promise<unknown> => null),
  itemDetail: vi.fn(async (): Promise<boolean> => true),
  handBack: vi.fn((): boolean => true),
  breadcrumb: vi.fn((_name: string, _data?: Record<string, unknown>): void => {}),
  contact: new Set<() => void>()
}))

vi.mock('@/runtime/structured-agent-session-client', () => ({
  callStructuredAgentSession: (_target: unknown, method: string, params: unknown) =>
    method === 'agentSession.send' ? mocks.send() : mocks.tail(params),
  readStructuredAgentSessionItem: mocks.item,
  supportsStructuredAgentSessionItemDetail: mocks.itemDetail
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  ensureRuntimeEnvironmentCompatible: async () => undefined
}))
vi.mock('@/runtime/runtime-host-contact-regained', () => ({
  subscribeRuntimeHostContactRegained: (_environmentId: string, listener: () => void) => {
    mocks.contact.add(listener)
    return () => mocks.contact.delete(listener)
  }
}))
vi.mock('./structured-agent-session-message-hand-back', () => ({
  handBackStructuredAgentSessionMessage: mocks.handBack
}))
vi.mock('@/lib/crash-breadcrumb-recorder', () => ({
  recordRendererCrashBreadcrumb: mocks.breadcrumb
}))

import {
  STRUCTURED_AGENT_SESSION_SEND_BUDGET_MS,
  resetStructuredAgentSessionSendsForTests,
  sendStructuredAgentSessionMessage,
  settleStructuredAgentSessionSendsFromJournal
} from './structured-agent-session-message-sender'
import {
  STRUCTURED_AGENT_SESSION_SEND_ABSENT_RECHECK_MS,
  STRUCTURED_AGENT_SESSION_SEND_CONFIRM_WINDOW_MS
} from './structured-agent-session-send-confirmation'
import {
  getStructuredAgentSessionPendingSends,
  getStructuredAgentSessionSendNotice,
  structuredAgentSessionSendOut,
  subscribeToStructuredAgentSessionPendingSends
} from './structured-agent-session-pending-sends'
import { noteStructuredAgentSessionFence } from './structured-agent-session-send-attempt'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-result'

const SESSION = 'session-1'
const target = { kind: 'environment', environmentId: 'vip' } as const
const LOST = "couldn't confirm your message reached the agent"

function lostLink(code = 'remote_runtime_unavailable'): RuntimeRpcCallError {
  return new RuntimeRpcCallError({
    id: 'agentSession.send',
    ok: false,
    error: { code, message: 'Remote Aster runtime closed the connection.' },
    _meta: { runtimeId: 'runtime-1' }
  })
}

function tail(
  extra: {
    queued?: string[]
    submissions?: Partial<AgentJournalSubmission>[]
    itemIds?: string[]
    hasOlder?: boolean
  } = {}
) {
  return {
    ok: true,
    page: {
      items: (extra.itemIds ?? []).map((itemId) => ({ itemId })),
      submissions: extra.submissions ?? [],
      queuedMessages: (extra.queued ?? []).map((messageId) => ({ messageId })),
      hasOlder: extra.hasOlder ?? false,
      window: { newest: null },
      liveCursor: { epoch: 'e', sequence: 9 }
    }
  }
}

function send(text = 'resume the training run') {
  const sent = sendStructuredAgentSessionMessage({ sessionId: SESSION, target, text })
  if (!sent) {
    throw new Error('refused')
  }
  return sent
}

function deferredSend(): { resolve: (value: unknown) => void; reject: (error: unknown) => void } {
  const handle = { resolve: (_value: unknown) => {}, reject: (_error: unknown) => {} }
  mocks.send.mockImplementationOnce(
    () =>
      new Promise((resolve, reject) => {
        handle.resolve = resolve
        handle.reject = reject
      })
  )
  return handle
}

function lastOutcome(): Record<string, unknown> {
  const call = mocks.breadcrumb.mock.calls.at(-1)
  expect(call?.[0]).toBe('structured_send_outcome')
  return call?.[1] ?? {}
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.send.mockReset()
  mocks.tail.mockReset()
  mocks.tail.mockResolvedValue(tail())
  mocks.item.mockClear()
  mocks.itemDetail.mockClear()
  mocks.handBack.mockClear()
  mocks.breadcrumb.mockClear()
  mocks.contact.clear()
  noteStructuredAgentSessionFence(SESSION, 2)
})
afterEach(() => {
  resetStructuredAgentSessionSendsForTests()
  vi.useRealTimers()
})

describe('a send whose reply was lost with the link', () => {
  it('counts as delivered when the host holds it as a card, and nothing goes back', async () => {
    mocks.send.mockRejectedValueOnce(lostLink())
    const sent = send()
    mocks.tail.mockResolvedValueOnce(tail({ queued: [sent.clientMessageId] }))
    expect(await sent.outcome).toBe('recorded')
    expect(mocks.handBack).not.toHaveBeenCalled()
    expect(getStructuredAgentSessionSendNotice(SESSION)).toBeNull()
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(lastOutcome()).toMatchObject({
      outcome: 'recorded',
      settledBy: 'check',
      answer: 'uncertain',
      answerCode: 'remote_runtime_unavailable',
      hostState: 'queued',
      checks: 1
    })
  })

  it('counts as delivered when the host holds its row for after the current step', async () => {
    const stop = subscribeToStructuredAgentSessionPendingSends(SESSION, () => {})
    mocks.send.mockRejectedValueOnce(lostLink('runtime_timeout'))
    const sent = send()
    mocks.tail.mockResolvedValueOnce(
      tail({
        submissions: [
          {
            clientMessageId: sent.clientMessageId,
            dispatchState: 'pending',
            handoverRecorded: true
          }
        ]
      })
    )
    expect(await sent.outcome).toBe('recorded')
    // The open chat keeps drawing it until the host's row reaches the view.
    expect(getStructuredAgentSessionPendingSends(SESSION)).toMatchObject([
      { clientMessageId: sent.clientMessageId, phase: 'recorded' }
    ])
    expect(lastOutcome()).toMatchObject({ hostState: 'held', answerCode: 'runtime_timeout' })
    stop()
  })

  it('finds a row the agent has written past, by its id', async () => {
    mocks.send.mockRejectedValueOnce(lostLink())
    mocks.tail.mockResolvedValueOnce(tail({ hasOlder: true }))
    mocks.item.mockResolvedValueOnce({ itemId: 'found' })
    const sent = send()
    expect(await sent.outcome).toBe('recorded')
    expect(mocks.item).toHaveBeenCalledWith(
      target,
      SESSION,
      agentJournalSubmissionKey(sent.clientMessageId)
    )
  })

  it('still says it could not confirm a message the host never got, and gives it back', async () => {
    mocks.send.mockRejectedValueOnce(lostLink())
    const sent = send()
    await vi.advanceTimersByTimeAsync(STRUCTURED_AGENT_SESSION_SEND_ABSENT_RECHECK_MS)
    expect(await sent.outcome).toBe('unconfirmed')
    expect(mocks.tail).toHaveBeenCalledTimes(2)
    expect(mocks.handBack).toHaveBeenCalledTimes(1)
    expect(getStructuredAgentSessionSendNotice(SESSION)).toContain(LOST)
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(lastOutcome()).toMatchObject({ outcome: 'unconfirmed', settledBy: 'check', checks: 2 })
  })

  it('reads the message text nowhere in its trace', async () => {
    mocks.send.mockRejectedValueOnce(lostLink())
    const sent = send('the secret training config')
    await vi.advanceTimersByTimeAsync(STRUCTURED_AGENT_SESSION_SEND_ABSENT_RECHECK_MS)
    await sent.outcome
    const data = JSON.stringify(mocks.breadcrumb.mock.calls)
    expect(data).not.toContain('secret')
    expect(data).not.toContain(sent.clientMessageId)
    expect(data).not.toContain(SESSION)
  })
})

describe('a send while the link is down', () => {
  it('waits for contact to come back, then settles from what the host holds', async () => {
    mocks.send.mockRejectedValueOnce(lostLink())
    mocks.tail.mockRejectedValue(new Error('Connection to vip is already in progress'))
    const sent = send()
    await vi.advanceTimersByTimeAsync(1)
    expect(getStructuredAgentSessionPendingSends(SESSION)).toMatchObject([
      { phase: 'sending', confirming: true }
    ])
    expect(structuredAgentSessionSendOut(SESSION)).toBe(true)
    // Back online: the next check runs at once, without waiting out its delay.
    mocks.tail.mockResolvedValue(tail({ queued: [sent.clientMessageId] }))
    for (const listener of Array.from(mocks.contact)) {
      listener()
    }
    expect(await sent.outcome).toBe('recorded')
    expect(mocks.handBack).not.toHaveBeenCalled()
    expect(lastOutcome()).toMatchObject({ outcome: 'recorded', unreachableChecks: 1 })
  })

  it('settles from the journal when the chat reads it again after the reconnect', async () => {
    mocks.send.mockRejectedValueOnce(lostLink())
    mocks.tail.mockRejectedValue(new Error('offline'))
    const sent = send()
    await vi.advanceTimersByTimeAsync(1)
    settleStructuredAgentSessionSendsFromJournal(SESSION, [], [sent.clientMessageId])
    expect(await sent.outcome).toBe('recorded')
    expect(lastOutcome()).toMatchObject({ settledBy: 'journal' })
  })

  it('gives up with the notice only once the window ends', async () => {
    mocks.send.mockRejectedValueOnce(lostLink())
    mocks.tail.mockRejectedValue(new Error('offline'))
    const sent = send()
    await vi.advanceTimersByTimeAsync(STRUCTURED_AGENT_SESSION_SEND_CONFIRM_WINDOW_MS - 1_000)
    expect(structuredAgentSessionSendOut(SESSION)).toBe(true)
    expect(mocks.handBack).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await sent.outcome).toBe('unconfirmed')
    expect(getStructuredAgentSessionSendNotice(SESSION)).toContain(LOST)
  })
})

describe('a send past its budget with its request still out', () => {
  it('asks the host at the deadline instead of giving up, and counts what it holds', async () => {
    deferredSend()
    const sent = send()
    await vi.advanceTimersByTimeAsync(STRUCTURED_AGENT_SESSION_SEND_BUDGET_MS - 1)
    expect(mocks.tail).not.toHaveBeenCalled()
    mocks.tail.mockResolvedValueOnce(tail({ queued: [sent.clientMessageId] }))
    await vi.advanceTimersByTimeAsync(1)
    expect(await sent.outcome).toBe('recorded')
    expect(mocks.handBack).not.toHaveBeenCalled()
    expect(lastOutcome()).toMatchObject({ deadlinePassed: true, settledBy: 'check' })
  })

  it("takes the request's own late answer, which the old deadline threw away", async () => {
    const request = deferredSend()
    const sent = send()
    await vi.advanceTimersByTimeAsync(STRUCTURED_AGENT_SESSION_SEND_BUDGET_MS + 5_000)
    expect(mocks.handBack).not.toHaveBeenCalled()
    request.resolve({
      ok: true,
      replayed: false,
      fence: 2,
      cursor: { epoch: 'e', sequence: 3 },
      value: { clientMessageId: sent.clientMessageId, queued: { messageId: sent.clientMessageId } }
    })
    expect(await sent.outcome).toBe('recorded')
    expect(getStructuredAgentSessionSendNotice(SESSION)).toBeNull()
    expect(lastOutcome()).toMatchObject({
      settledBy: 'reply',
      answer: 'recorded',
      hostState: 'queued',
      deadlinePassed: true
    })
  })

  it('gives back with the notice when the request ends unanswered and the host has nothing', async () => {
    const request = deferredSend()
    const sent = send()
    await vi.advanceTimersByTimeAsync(STRUCTURED_AGENT_SESSION_SEND_BUDGET_MS)
    request.reject(lostLink('runtime_timeout'))
    await vi.advanceTimersByTimeAsync(STRUCTURED_AGENT_SESSION_SEND_ABSENT_RECHECK_MS * 2)
    expect(await sent.outcome).toBe('unconfirmed')
    expect(getStructuredAgentSessionSendNotice(SESSION)).toContain(LOST)
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
})
