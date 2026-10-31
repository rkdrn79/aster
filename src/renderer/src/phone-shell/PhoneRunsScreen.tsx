import { FlaskConical } from 'lucide-react'
import { useDeadlineClock } from '@/features/research/use-deadline-clock'
import { usePhoneNavigation } from './phone-navigation-store'
import {
  usePhoneResearchOverviewRefresh,
  usePhoneResearchOverviews
} from './phone-research-overviews'
import { compareRunsNewestFirst, listPhoneRuns, type PhoneRunSummary } from './phone-run-summaries'
import { PhoneEmptyState, PhoneScrollBody, PhoneSection } from './PhoneListLayout'
import { PhoneRunRow } from './PhoneRunRow'
import { usePhoneProjects } from './use-phone-projects'

export function openPhoneRun(summary: PhoneRunSummary): void {
  usePhoneNavigation.getState().push({
    kind: 'run',
    worktreeId: summary.worktreeId,
    experiment: summary.experimentSlug,
    run: summary.run.id,
    title: summary.run.name || summary.run.id,
    subtitle: summary.experimentName
  })
}

/** Every Run the host's projects record in `.aster/`, running first, then newest. */
export function PhoneRunsScreen(): React.JSX.Element {
  const { projects } = usePhoneProjects()
  const now = useDeadlineClock(30_000)
  const primaries = projects.flatMap((project) =>
    project.workspaces[0] ? [{ project, worktreeId: project.workspaces[0].id }] : []
  )
  usePhoneResearchOverviewRefresh(primaries.map((entry) => entry.worktreeId))
  const overviews = usePhoneResearchOverviews((state) => state.byWorktreeId)
  const multipleProjects = primaries.length > 1
  const rows = primaries
    .flatMap(({ project, worktreeId }) => {
      const overview = overviews[worktreeId]
      return overview?.status === 'ready'
        ? listPhoneRuns(worktreeId, overview.result).map((summary) => ({
            summary,
            context: multipleProjects
              ? `${project.name} · ${summary.experimentName}`
              : summary.experimentName
          }))
        : []
    })
    .sort((a, b) => compareRunsNewestFirst(a.summary, b.summary))
  const loading = primaries.some(({ worktreeId }) => overviews[worktreeId]?.status !== 'ready')
  const failures = primaries.flatMap(({ project, worktreeId }) => {
    const overview = overviews[worktreeId]
    return overview?.status === 'error' ? [`${project.name}: ${overview.message}`] : []
  })

  if (rows.length === 0) {
    return (
      <PhoneScrollBody>
        <PhoneEmptyState
          icon={FlaskConical}
          title={loading && failures.length === 0 ? 'Reading Runs…' : 'No Runs yet'}
        >
          {failures.length > 0
            ? failures.join('\n')
            : 'Runs launched through the Aster harness appear here from each project’s .aster/ folder.'}
        </PhoneEmptyState>
      </PhoneScrollBody>
    )
  }
  return (
    <PhoneScrollBody>
      {/* Why one list: rows are already sorted running first, and the pill marks them. */}
      <PhoneSection>
        {rows.map(({ summary, context }) => (
          <PhoneRunRow
            key={`${summary.worktreeId}/${summary.experimentSlug}/${summary.run.id}`}
            summary={summary}
            now={now}
            context={context}
            onOpen={() => openPhoneRun(summary)}
          />
        ))}
      </PhoneSection>
      {failures.map((failure) => (
        <p key={failure} className="px-8 pt-3 text-[13px] text-muted-foreground">
          {failure}
        </p>
      ))}
    </PhoneScrollBody>
  )
}
