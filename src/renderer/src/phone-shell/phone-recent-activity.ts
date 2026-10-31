import type { PhoneRunSummary } from './phone-run-summaries'
import { phoneSessionNeedsYou, type PhoneSession } from './phone-sessions'

export type PhoneActivityItem =
  | { kind: 'session'; at: number; session: PhoneSession }
  | { kind: 'run'; at: number; summary: PhoneRunSummary }

/**
 * The latest few things that happened on the host: agent turns and Run starts or finishes, newest
 * first. Questions stay out (Home lists them above), and so do plain shells and stale entries.
 */
export function recentPhoneActivity(
  sessions: readonly PhoneSession[],
  runs: readonly PhoneRunSummary[],
  now: number,
  options: { count: number; maxAgeMs: number }
): PhoneActivityItem[] {
  const items: PhoneActivityItem[] = [
    ...sessions
      .filter((session) => session.agentType && !phoneSessionNeedsYou(session.state))
      .map((session) => ({
        kind: 'session' as const,
        at: session.stateSince || session.activityAt,
        session
      })),
    ...runs.map((summary) => ({ kind: 'run' as const, at: summary.at, summary }))
  ]
  return items
    .filter((item) => item.at > 0 && item.at <= now && now - item.at <= options.maxAgeMs)
    .sort((a, b) => b.at - a.at)
    .slice(0, options.count)
}
