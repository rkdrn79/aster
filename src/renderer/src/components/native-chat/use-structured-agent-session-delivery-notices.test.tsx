// @vitest-environment happy-dom

import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { AgentJournalSubmission } from '../../../../shared/agent-session-journal-types'
import { DISPATCH_REJECTED_CANCELLED } from '../../../../shared/structured-agent-session-dispatch-rejection'
import { agentJournalSubmissionKey } from '../../../../shared/agent-session-journal-item-key'
import { useStructuredAgentSessionDeliveryNotices } from './use-structured-agent-session-delivery-notices'

afterEach(cleanup)

const EMPTY: never[] = []

function rejected(
  clientMessageId: string,
  kind: 'hostRestarted' | 'notDelivered'
): AgentJournalSubmission {
  return {
    clientMessageId,
    fence: 1,
    payloadFingerprint: clientMessageId,
    dispatchState: 'rejected',
    providerItemId: null,
    reason: null,
    rejection: { kind },
    submittedAt: 1,
    resolvedAt: 2
  }
}

function accepted(clientMessageId: string): AgentJournalSubmission {
  return {
    clientMessageId,
    fence: 1,
    payloadFingerprint: clientMessageId,
    dispatchState: 'accepted',
    providerItemId: `provider-${clientMessageId}`,
    reason: null,
    submittedAt: 3,
    resolvedAt: 4
  }
}

function withdrawn(clientMessageId: string): AgentJournalSubmission {
  return {
    clientMessageId,
    fence: 1,
    payloadFingerprint: clientMessageId,
    dispatchState: 'rejected',
    providerItemId: null,
    reason: DISPATCH_REJECTED_CANCELLED,
    rejection: { kind: 'cancelled' },
    submittedAt: 1,
    resolvedAt: 2
  }
}

// A Stop's withdrawn message draws no row, so a chat that has one rebuilds no notice per batch.
it('keeps the same notices across batches in a chat whose only rejection a Stop withdrew', () => {
  const { result, rerender } = renderHook(
    ({ submissions }: { submissions: readonly AgentJournalSubmission[] }) =>
      useStructuredAgentSessionDeliveryNotices({
        pending: EMPTY,
        submissions,
        journalItems: EMPTY,
        agentName: 'Claude'
      }),
    { initialProps: { submissions: [withdrawn('stopped')] } }
  )
  const first = result.current

  rerender({ submissions: [withdrawn('stopped')] })

  expect(result.current).toBe(first)
  expect(result.current.size).toBe(0)
})

function renderNotices(submissions: readonly AgentJournalSubmission[]) {
  return renderHook(
    ({ submissions: current }: { submissions: readonly AgentJournalSubmission[] }) =>
      useStructuredAgentSessionDeliveryNotices({
        pending: EMPTY,
        submissions: current,
        journalItems: EMPTY,
        agentName: 'Claude'
      }),
    { initialProps: { submissions } }
  )
}

// A batch for another message rebuilds the journal's rows; the rows already marked not sent keep
// the same notices, so no row wrapper re-renders.
it('keeps the same notices when a batch leaves every not-sent message as it was', () => {
  const { result, rerender } = renderNotices([rejected('lost', 'hostRestarted')])
  const first = result.current
  expect(first.size).toBe(1)

  rerender({ submissions: [rejected('lost', 'hostRestarted'), accepted('next')] })

  expect(result.current).toBe(first)
})

it('keeps the notice of a row that did not change when another one does', () => {
  const { result, rerender } = renderNotices([rejected('lost', 'hostRestarted')])
  const lost = result.current.get('orca:lost')

  rerender({
    submissions: [rejected('lost', 'hostRestarted'), rejected('other', 'notDelivered')]
  })

  expect(result.current.size).toBe(2)
  expect(result.current.get('orca:lost')).toBe(lost)
})

function heldForNextStep(clientMessageId: string, handedOverAt?: number): AgentJournalSubmission {
  return {
    clientMessageId,
    fence: 1,
    payloadFingerprint: clientMessageId,
    dispatchState: 'pending',
    providerItemId: null,
    reason: null,
    submittedAt: 5,
    resolvedAt: null,
    handoverRecorded: true,
    ...(handedOverAt === undefined ? {} : { handedOverAt })
  }
}

// A message the host accepted while the agent works waits for its current step: it says so,
// instead of reading as lost.
it('says a message the host holds while the agent works is queued for after the current step', () => {
  const { result, rerender } = renderHook(
    ({ isWorking, submissions }: { isWorking: boolean; submissions: AgentJournalSubmission[] }) =>
      useStructuredAgentSessionDeliveryNotices({
        pending: EMPTY,
        submissions,
        journalItems: EMPTY,
        agentName: 'Claude',
        startFailures: EMPTY,
        isWorking
      }),
    { initialProps: { isWorking: true, submissions: [heldForNextStep('m')] } }
  )
  expect(result.current.get(agentJournalSubmissionKey('m'))).toEqual({ queued: true })
  // A batch that changes nothing about it keeps the same map.
  const before = result.current
  rerender({ isWorking: true, submissions: [heldForNextStep('m')] })
  expect(result.current).toBe(before)
  // Handed over, or an agent at rest that hands it over at once: nothing to say.
  rerender({ isWorking: true, submissions: [heldForNextStep('m', 9)] })
  expect(result.current.has(agentJournalSubmissionKey('m'))).toBe(false)
  rerender({ isWorking: false, submissions: [heldForNextStep('m')] })
  expect(result.current.has(agentJournalSubmissionKey('m'))).toBe(false)
})

it('says a send nobody answered is being checked, not still sending', () => {
  const entry = {
    clientMessageId: 'c',
    sessionId: 'session-1',
    body: { kind: 'message' as const, role: 'user' as const, blocks: [] },
    previewUris: [],
    queuedAt: 1,
    phase: 'sending' as const,
    issued: true
  }
  const { result, rerender } = renderHook(
    ({ confirming }: { confirming: boolean }) =>
      useStructuredAgentSessionDeliveryNotices({
        pending: [confirming ? { ...entry, confirming: true as const } : entry],
        submissions: EMPTY,
        journalItems: EMPTY,
        agentName: 'Claude',
        startFailures: EMPTY
      }),
    { initialProps: { confirming: false } }
  )
  expect(result.current.get(agentJournalSubmissionKey('c'))).toEqual({ sending: true })
  rerender({ confirming: true })
  expect(result.current.get(agentJournalSubmissionKey('c'))).toEqual({
    sending: true,
    confirming: true
  })
})
