import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import {
  AGENT_STATUS_STALE_AFTER_MS,
  agentStatusEvidenceObservedAt,
  isAgentStatusFresh
} from '../../../../shared/agent-status-freshness'
import type { ResearchDelegationRecord } from '../../../../shared/research/research-records'

/** How long a task that just finished reads "Done" before it leaves the live list. */
export const DELEGATION_DONE_LINGER_MS = 4_000
/** A just-launched task's tab may not be listed yet; after this, a missing tab means it closed. */
const TAB_LISTING_GRACE_MS = 60_000

/**
 * `running` and `attention` are live; `failed` stays until dismissed; `done` shows briefly;
 * `finished` (done, or no word for a whole freshness window) is history only.
 */
export type ResearchDelegationPhase = 'running' | 'attention' | 'failed' | 'done' | 'finished'

export type ResearchDelegationActivity = {
  phase: ResearchDelegationPhase
  label: string
  /** Newest evidence about the task; a dismissal older than this no longer hides it. */
  observedAt: number
  /** When a `done` task leaves the live list. */
  leavesAt: number | null
}

type ActivityInput = {
  delegation: ResearchDelegationRecord
  status: AgentStatusEntry | null
  reachable: boolean
  tabOpen: boolean
  now: number
}

function activity(
  phase: ResearchDelegationPhase,
  label: string,
  observedAt: number
): ResearchDelegationActivity {
  return { phase, label, observedAt, leavesAt: null }
}

export function researchDelegationActivity({
  delegation,
  status,
  reachable,
  tabOpen,
  now
}: ActivityInput): ResearchDelegationActivity {
  const recordedAt = Date.parse(delegation.updatedAt) || 0
  const unheard = (
    label: string,
    phase: 'running' | 'attention',
    observedAt = recordedAt
  ): ResearchDelegationActivity =>
    activity(now - observedAt > AGENT_STATUS_STALE_AFTER_MS ? 'finished' : phase, label, observedAt)
  const reported = status !== null && (status.state === 'done' || isAgentStatusFresh(status, now))

  switch (delegation.state) {
    case 'failed':
      return activity('failed', 'Launch failed', recordedAt)
    case 'cancelled':
      return activity('failed', 'Launch cancelled', recordedAt)
    case 'launching':
      return unheard('Launch requested…', 'running')
    case 'unknown':
      // Why: once its agent reports, that outranks the unconfirmed prompt delivery.
      if (!reported) {
        return unheard('Prompt delivery unconfirmed', 'attention')
      }
  }
  const statusAt = status ? agentStatusEvidenceObservedAt(status) : 0
  const observedAt = Math.max(recordedAt, statusAt)
  if (!reachable) {
    return unheard('Host disconnected · current progress unknown', 'attention', observedAt)
  }
  if (!tabOpen && now - recordedAt > TAB_LISTING_GRACE_MS) {
    return activity('finished', 'Agent tab closed', observedAt)
  }
  if (status?.state === 'done' && status.sessionBoundary !== true) {
    const leavesAt = statusAt + DELEGATION_DONE_LINGER_MS
    return now < leavesAt
      ? { phase: 'done', label: 'Done', observedAt, leavesAt }
      : activity('finished', 'Agent finished · verification not recorded', observedAt)
  }
  // Why: a waiting agent reports nothing until answered, so its question never goes stale.
  if ((status?.state === 'blocked' || status?.state === 'waiting') && !status.restoredUnconfirmed) {
    return activity('attention', 'Agent needs input', observedAt)
  }
  if (status?.state === 'working' && reported) {
    return activity('running', 'Agent working', observedAt)
  }
  return unheard('Prompt delivered · progress unknown', 'running', observedAt)
}

export function researchDelegationDismissed(
  activityState: ResearchDelegationActivity,
  dismissedAt: number | undefined
): boolean {
  return dismissedAt !== undefined && dismissedAt >= activityState.observedAt
}

/** Shown in the live list: still working, waiting on the user, failed, or only just done. */
export function researchDelegationIsLive(
  activityState: ResearchDelegationActivity,
  dismissedAt: number | undefined
): boolean {
  return (
    activityState.phase !== 'finished' && !researchDelegationDismissed(activityState, dismissedAt)
  )
}

/** Counted on the Background tasks trigger: work that is running or waiting on the user. */
export function researchDelegationIsActive(
  activityState: ResearchDelegationActivity,
  dismissedAt: number | undefined
): boolean {
  return (
    (activityState.phase === 'running' || activityState.phase === 'attention') &&
    !researchDelegationDismissed(activityState, dismissedAt)
  )
}

/** Rows the user may dismiss: what waits on them or failed; running and done rows go by themselves. */
export function researchDelegationDismissible(phase: ResearchDelegationPhase): boolean {
  return phase === 'attention' || phase === 'failed'
}
