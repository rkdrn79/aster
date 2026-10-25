import type { ResearchProposal } from '../../../../shared/research/research-proposals'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'

type RunState = ResearchRunRecord['execution']

/** Where one planned Run (a proposal) stands, from the user's decision to its result. */
export type PlanItemStatus =
  | { kind: 'proposed' }
  /** Approved and config-only: the experiment agent launches it with run exec. */
  | { kind: 'approved' }
  /** Approved, but code must change first, and nobody has it yet. */
  | { kind: 'needs-code' }
  | { kind: 'handed-off'; sessionId: string | null; at: string }
  /** `state` is null while Aster has not read the launched Run. */
  | { kind: 'launched'; run: string | null; state: RunState | null }
  | { kind: 'rejected' }

export function planItemStatus(
  proposal: ResearchProposal,
  runState: (reference: string) => RunState | null
): PlanItemStatus {
  switch (proposal.state) {
    case 'pending':
      return { kind: 'proposed' }
    case 'rejected':
      return { kind: 'rejected' }
    case 'launched':
      return {
        kind: 'launched',
        run: proposal.launchedRun,
        state: proposal.launchedRun ? runState(proposal.launchedRun) : null
      }
    case 'approved':
      if (!proposal.needsCode) {
        return { kind: 'approved' }
      }
      return proposal.handoff
        ? { kind: 'handed-off', sessionId: proposal.handoff.sessionId, at: proposal.handoff.at }
        : { kind: 'needs-code' }
  }
}

const RUN_STATE_LABELS: Record<RunState, string> = {
  unknown: 'Launched',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled'
}

export function planItemStatusLabel(status: PlanItemStatus): string {
  switch (status.kind) {
    case 'proposed':
      return 'Proposed'
    case 'approved':
      return 'Approved'
    case 'needs-code':
      return 'Needs code'
    case 'handed-off':
      return 'Handed to Workbench'
    case 'launched':
      return RUN_STATE_LABELS[status.state ?? 'unknown']
    case 'rejected':
      return 'Rejected'
  }
}

export type PlanItem = { proposal: ResearchProposal; status: PlanItemStatus }

/** The planned Runs in the order they were proposed; rejected ones apart. */
export function experimentPlanItems(
  proposals: readonly ResearchProposal[],
  runState: (reference: string) => RunState | null
): { items: PlanItem[]; rejected: PlanItem[] } {
  const all = proposals
    .toSorted((left, right) => left.at.localeCompare(right.at))
    .map((proposal) => ({ proposal, status: planItemStatus(proposal, runState) }))
  return {
    items: all.filter((item) => item.status.kind !== 'rejected'),
    rejected: all.filter((item) => item.status.kind === 'rejected')
  }
}
