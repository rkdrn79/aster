import { describe, expect, it } from 'vitest'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import {
  experimentPlanItems,
  planItemStatus,
  planItemStatusLabel
} from './research-experiment-plan'
import { proposalRecord } from './research-experiment-notebook.test-fixture'

const states = new Map<string, ResearchRunRecord['execution']>([['exp/cand-2', 'running']])
const runState = (reference: string): ResearchRunRecord['execution'] | null =>
  states.get(reference) ?? null

describe('Experiment plan', () => {
  it('derives where each planned Run stands, from proposal to result', () => {
    const cases = [
      [proposalRecord('p1', 'pending'), 'proposed', 'Proposed'],
      [proposalRecord('p2', 'approved'), 'approved', 'Approved'],
      [proposalRecord('p3', 'approved', { needsCode: true }), 'needs-code', 'Needs code'],
      [
        proposalRecord('p4', 'approved', {
          needsCode: true,
          handoff: { at: '2026-10-24T10:00:00Z', sessionId: 'session-1' }
        }),
        'handed-off',
        'Handed to Workbench'
      ],
      [proposalRecord('p5', 'launched', { launchedRun: 'exp/cand-2' }), 'launched', 'Running'],
      [proposalRecord('p6', 'launched', { launchedRun: 'exp/unread' }), 'launched', 'Launched'],
      [proposalRecord('p7', 'rejected'), 'rejected', 'Rejected']
    ] as const
    for (const [proposal, kind, label] of cases) {
      const status = planItemStatus(proposal, runState)
      expect(status.kind).toBe(kind)
      expect(planItemStatusLabel(status)).toBe(label)
    }
    expect(
      planItemStatus(
        proposalRecord('p4', 'approved', {
          needsCode: true,
          handoff: { at: '2026-10-24T10:00:00Z', sessionId: 'session-1' }
        }),
        runState
      )
    ).toEqual({ kind: 'handed-off', sessionId: 'session-1', at: '2026-10-24T10:00:00Z' })
  })

  it('lists planned Runs in proposal order and keeps rejected ones apart', () => {
    const plan = experimentPlanItems(
      [
        proposalRecord('later', 'pending', { at: '2026-10-24T12:00:00Z' }),
        proposalRecord('dropped', 'rejected', { at: '2026-10-24T09:00:00Z' }),
        proposalRecord('first', 'launched', { at: '2026-10-24T08:00:00Z' })
      ],
      runState
    )
    expect(plan.items.map((item) => item.proposal.id)).toEqual(['first', 'later'])
    expect(plan.rejected.map((item) => item.proposal.id)).toEqual(['dropped'])
  })
})
