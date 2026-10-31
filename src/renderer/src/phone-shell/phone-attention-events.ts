import type { AgentDotState } from '@/components/AgentStateDot'
import type { ResearchRunExecutionState } from '../../../shared/research/research-run-manifest'
import type { PhoneRunSummary } from './phone-run-summaries'
import { phoneSessionNeedsYou, type PhoneSession } from './phone-sessions'

// Why not idle: a session reads idle until the dashboard snapshot lands, so idle → waiting on
// launch or reconnect is the list loading, not the agent asking.
const NEEDS_YOU_NEWS_FROM: ReadonlySet<AgentDotState> = new Set([
  'working',
  'monitoring',
  'done',
  'failed',
  'interrupted',
  'unconfirmed'
])

export function phoneSessionKey(session: Pick<PhoneSession, 'worktreeId' | 'tabId'>): string {
  return `${session.worktreeId}\0${session.tabId}`
}

export function phoneRunKey(summary: PhoneRunSummary): string {
  return `${summary.worktreeId}\0${summary.experimentSlug}\0${summary.run.id}`
}

/** Sessions that started waiting on the user since `previous`; none on the first read. */
export function sessionsEnteringNeedsYou(
  previous: ReadonlyMap<string, AgentDotState> | null,
  sessions: readonly PhoneSession[]
): PhoneSession[] {
  if (!previous) {
    return []
  }
  return sessions.filter((session) => {
    const before = previous.get(phoneSessionKey(session))
    return (
      before !== undefined && NEEDS_YOU_NEWS_FROM.has(before) && phoneSessionNeedsYou(session.state)
    )
  })
}

/** Runs seen running that now report finished or failed; a cancel is the user's own doing. */
export function runsThatEnded(
  previous: ReadonlyMap<string, ResearchRunExecutionState>,
  runs: readonly PhoneRunSummary[]
): PhoneRunSummary[] {
  return runs.filter(
    (summary) =>
      previous.get(phoneRunKey(summary)) === 'running' &&
      (summary.run.state === 'succeeded' || summary.run.state === 'failed')
  )
}
