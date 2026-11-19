import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResearchProposal } from '../../../shared/research/research-proposals'

const host = vi.hoisted(() => ({
  support: vi.fn(),
  proposals: vi.fn(),
  plans: vi.fn()
}))
vi.mock('@/web/web-research-decisions', () => ({
  hostResearchDecisionsSupport: host.support,
  listHostProposals: host.proposals,
  listHostPlans: host.plans,
  isOldHostError: (cause: unknown) => /method_not_found/.test(String(cause))
}))

const { phoneDecisionItems, refreshPhoneDecisions, usePhoneDecisions } =
  await import('./phone-research-decisions')

function proposal(id: string, at: string): ResearchProposal {
  return {
    id,
    at,
    experiment: 'seeds',
    title: id,
    rationale: 'why',
    command: 'run',
    cwd: null,
    configChanges: null,
    findings: [],
    runs: [],
    state: 'pending',
    decision: null,
    launchedRun: null,
    needsCode: false,
    handoff: null
  }
}

const plan = (id: string, status: 'submitted' | 'draft' | 'approved') => ({
  id,
  title: id,
  status,
  revision: 1,
  updatedAt: null,
  path: ''
})

beforeEach(() => {
  usePhoneDecisions.setState({ byWorktreeId: {} })
  host.support.mockReset().mockResolvedValue('supported')
  host.proposals.mockReset().mockResolvedValue({ proposals: [], unreadable: [] })
  host.plans.mockReset().mockResolvedValue({ directory: '', plans: [] })
})

describe('phone decisions read', () => {
  it('asks no RPC of a host that lacks the capability and says it needs an update', async () => {
    host.support.mockResolvedValue('update-needed')
    await refreshPhoneDecisions('w1', true)
    expect(usePhoneDecisions.getState().byWorktreeId.w1).toEqual({ status: 'update-needed' })
    expect(host.proposals).not.toHaveBeenCalled()
  })

  it('reads an unknown-method answer as an old host, not as an error', async () => {
    host.support.mockResolvedValue('unknown')
    host.proposals.mockRejectedValue(new Error('method_not_found: researchProposals.list'))
    await refreshPhoneDecisions('w1', true)
    expect(usePhoneDecisions.getState().byWorktreeId.w1).toEqual({ status: 'update-needed' })
  })

  it('keeps only submitted plans, and lists plans before proposals oldest first', async () => {
    host.proposals.mockResolvedValue({
      proposals: [proposal('proposal-2', '2026-11-02'), proposal('proposal-1', '2026-11-01')],
      unreadable: []
    })
    host.plans.mockResolvedValue({
      directory: '',
      plans: [plan('draft-plan', 'draft'), plan('to-approve', 'submitted')]
    })
    await refreshPhoneDecisions('w1', true)
    const items = phoneDecisionItems(usePhoneDecisions.getState().byWorktreeId, ['w1'])
    expect(items.map((item) => (item.kind === 'plan' ? item.plan.id : item.proposal.id))).toEqual([
      'to-approve',
      'proposal-1',
      'proposal-2'
    ])
  })
})
