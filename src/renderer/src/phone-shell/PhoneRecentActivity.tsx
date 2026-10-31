import { FlaskConical } from 'lucide-react'
import type { ResearchHomeProject } from '@/features/research/research-home-projects'
import { usePhoneResearchOverviews } from './phone-research-overviews'
import { recentPhoneActivity } from './phone-recent-activity'
import { listPhoneRuns } from './phone-run-summaries'
import type { PhoneSession } from './phone-sessions'
import { PhoneSection } from './PhoneListLayout'
import { PhoneRunRow } from './PhoneRunRow'
import { openPhoneRun } from './PhoneRunsScreen'
import { PhoneSessionRow } from './PhoneSessionRow'
import { phoneWorkspaceLabel, type PhoneWorkspaceEntry } from './use-phone-projects'

const SHOWN = 4
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** The newest agent turns and Run starts or finishes across projects, mixed by time. */
export function PhoneRecentActivity({
  projects,
  sessions,
  byWorkspaceId,
  now
}: {
  projects: readonly ResearchHomeProject[]
  sessions: readonly PhoneSession[]
  byWorkspaceId: ReadonlyMap<string, PhoneWorkspaceEntry>
  now: number
}): React.JSX.Element | null {
  const overviews = usePhoneResearchOverviews((state) => state.byWorktreeId)
  const runs = projects.flatMap((project) => {
    const worktreeId = project.workspaces[0]?.id
    const overview = worktreeId ? overviews[worktreeId] : undefined
    return worktreeId && overview?.status === 'ready'
      ? listPhoneRuns(worktreeId, overview.result)
      : []
  })
  const items = recentPhoneActivity(sessions, runs, now, { count: SHOWN, maxAgeMs: MAX_AGE_MS })
  if (items.length === 0) {
    return null
  }
  const several = projects.length > 1
  return (
    <PhoneSection label="Recent activity">
      {items.map((item) => {
        if (item.kind === 'session') {
          const { session } = item
          return (
            <PhoneSessionRow
              key={`session:${session.worktreeId}\0${session.tabId}`}
              session={session}
              headerSubtitle={phoneWorkspaceLabel(byWorkspaceId.get(session.worktreeId))}
              now={now}
            />
          )
        }
        const { summary } = item
        const project = byWorkspaceId.get(summary.worktreeId)?.project
        return (
          <PhoneRunRow
            key={`run:${summary.worktreeId}/${summary.experimentSlug}/${summary.run.id}`}
            summary={summary}
            now={now}
            context={
              several && project
                ? `${project.name} · ${summary.experimentName}`
                : summary.experimentName
            }
            leading={<FlaskConical className="size-[18px]" aria-hidden />}
            onOpen={() => openPhoneRun(summary)}
          />
        )
      })}
    </PhoneSection>
  )
}
