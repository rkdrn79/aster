import { useEffect } from 'react'
import { create } from 'zustand'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import {
  hostResearchDecisionsSupport,
  isOldHostError,
  listHostPlans,
  listHostProposals
} from '@/web/web-research-decisions'
import type { ResearchPlanSummary } from '../../../shared/research/research-plans'
import type { ResearchProposal } from '../../../shared/research/research-proposals'

const STALE_AFTER_MS = 10_000
const POLL_MS = 30_000

/** What waits for the person's decision in one workspace's `.aster/` records. */
export type PhoneDecisionsRead =
  | { status: 'loading' }
  | { status: 'update-needed' }
  | {
      status: 'ready'
      proposals: ResearchProposal[]
      /** Plans the agent submitted for approval. */
      plans: ResearchPlanSummary[]
      readAt: number
    }
  | { status: 'error'; message: string; readAt: number }

export const usePhoneDecisions = create<{
  byWorktreeId: Readonly<Record<string, PhoneDecisionsRead>>
}>(() => ({ byWorktreeId: {} }))

const inFlight = new Map<string, Promise<void>>()

function setRead(worktreeId: string, read: PhoneDecisionsRead): void {
  usePhoneDecisions.setState((state) => ({
    byWorktreeId: { ...state.byWorktreeId, [worktreeId]: read }
  }))
}

async function readDecisions(worktreeId: string): Promise<PhoneDecisionsRead> {
  if ((await hostResearchDecisionsSupport()) === 'update-needed') {
    return { status: 'update-needed' }
  }
  try {
    const [proposals, plans] = await Promise.all([
      listHostProposals(worktreeId, { state: 'pending' }),
      // Why tolerated: a project without plans still has proposals to decide.
      listHostPlans(worktreeId).catch((cause: unknown) => {
        if (isOldHostError(cause)) {
          throw cause
        }
        return { directory: '', plans: [] }
      })
    ])
    return {
      status: 'ready',
      proposals: proposals.proposals,
      plans: plans.plans.filter((plan) => plan.status === 'submitted'),
      readAt: Date.now()
    }
  } catch (cause) {
    return isOldHostError(cause)
      ? { status: 'update-needed' }
      : {
          status: 'error',
          message: cause instanceof Error ? cause.message : String(cause),
          readAt: Date.now()
        }
  }
}

export function refreshPhoneDecisions(worktreeId: string, force = false): Promise<void> {
  const current = usePhoneDecisions.getState().byWorktreeId[worktreeId]
  const fresh =
    current &&
    (current.status === 'update-needed' ||
      ((current.status === 'ready' || current.status === 'error') &&
        Date.now() - current.readAt < STALE_AFTER_MS))
  if (!force && fresh) {
    return Promise.resolve()
  }
  const pending = inFlight.get(worktreeId)
  if (pending) {
    return pending
  }
  if (!current) {
    setRead(worktreeId, { status: 'loading' })
  }
  const read = readDecisions(worktreeId)
    .then((result) => setRead(worktreeId, result))
    .finally(() => inFlight.delete(worktreeId))
  inFlight.set(worktreeId, read)
  return read
}

/** Reads the decisions of these workspaces now and every 30 s while the page is visible. */
export function usePhoneDecisionsRefresh(worktreeIds: readonly string[]): void {
  const key = worktreeIds.join('\0')
  useEffect(() => {
    const ids = key ? key.split('\0') : []
    if (ids.length === 0) {
      return
    }
    return installWindowVisibilityInterval({
      run: () => ids.forEach((id) => void refreshPhoneDecisions(id)),
      intervalMs: POLL_MS
    })
  }, [key])
}

export type PhoneDecisionItem =
  | { kind: 'proposal'; worktreeId: string; proposal: ResearchProposal }
  | { kind: 'plan'; worktreeId: string; plan: ResearchPlanSummary }

/** Plans first (they gate many Runs), then proposals oldest first, as they were asked. */
export function phoneDecisionItems(
  reads: Readonly<Record<string, PhoneDecisionsRead>>,
  worktreeIds: readonly string[]
): PhoneDecisionItem[] {
  const plans: PhoneDecisionItem[] = []
  const proposals: PhoneDecisionItem[] = []
  for (const worktreeId of worktreeIds) {
    const read = reads[worktreeId]
    if (read?.status !== 'ready') {
      continue
    }
    plans.push(...read.plans.map((plan) => ({ kind: 'plan' as const, worktreeId, plan })))
    proposals.push(
      ...read.proposals.map((proposal) => ({ kind: 'proposal' as const, worktreeId, proposal }))
    )
  }
  proposals.sort((a, b) =>
    a.kind === 'proposal' && b.kind === 'proposal' ? a.proposal.at.localeCompare(b.proposal.at) : 0
  )
  return [...plans, ...proposals]
}

/** Whether any of these workspaces' hosts needs an update before it can take decisions. */
export function phoneDecisionsNeedUpdate(
  reads: Readonly<Record<string, PhoneDecisionsRead>>,
  worktreeIds: readonly string[]
): boolean {
  return worktreeIds.some((id) => reads[id]?.status === 'update-needed')
}
