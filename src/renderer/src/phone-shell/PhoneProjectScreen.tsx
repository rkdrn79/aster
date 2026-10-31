import { FolderX, Plus } from 'lucide-react'
import { useDeadlineClock } from '@/features/research/use-deadline-clock'
import {
  usePhoneResearchOverviewRefresh,
  usePhoneResearchOverviews
} from './phone-research-overviews'
import { listPhoneRuns } from './phone-run-summaries'
import type { PhoneSession } from './phone-sessions'
import { usePhoneNavigation } from './phone-navigation-store'
import { PhoneExperimentRows } from './PhoneExperimentRows'
import { PhoneIdleShellRows } from './PhoneIdleShellRows'
import { PhoneEmptyState, PhoneScrollBody, PhoneSection, PhoneSectionNote } from './PhoneListLayout'
import { PhoneRunRow } from './PhoneRunRow'
import { openPhoneRun } from './PhoneRunsScreen'
import { PhoneSessionFamilyRows } from './PhoneSessionFamilyRows'
import { PhoneSessionRow } from './PhoneSessionRow'
import { usePhoneProjects } from './use-phone-projects'
import { usePhoneSessionFamilies } from './use-phone-sessions'

/** Opens the New agent screen with this workspace chosen; it also offers a plain terminal. */
function NewAgentButton({ workspaceId }: { workspaceId: string }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() =>
        usePhoneNavigation
          .getState()
          .push({ kind: 'new-agent', worktreeId: workspaceId, title: 'New agent' })
      }
      className="-my-3 -mr-2 flex h-11 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-foreground active:bg-accent"
    >
      <Plus className="size-4" aria-hidden />
      New agent
    </button>
  )
}

/** A workspace's `.aster/` catalog: its Experiments, then every Run by recency. */
function ProjectResearch({
  worktreeId,
  projectName,
  now
}: {
  worktreeId: string
  projectName: string
  now: number
}): React.JSX.Element {
  const overview = usePhoneResearchOverviews((state) => state.byWorktreeId[worktreeId])
  if (!overview || overview.status !== 'ready') {
    return (
      <PhoneSection label="Experiments">
        <PhoneSectionNote>
          {overview?.status === 'error' ? overview.message : 'Reading Experiments…'}
        </PhoneSectionNote>
      </PhoneSection>
    )
  }
  if (overview.result.catalog.status === 'absent') {
    return (
      <PhoneSection label="Experiments">
        <PhoneSectionNote>This project has no .aster/ records yet</PhoneSectionNote>
      </PhoneSection>
    )
  }
  const runs = listPhoneRuns(worktreeId, overview.result)
  return (
    <>
      <PhoneSection label="Experiments">
        <PhoneExperimentRows
          worktreeId={worktreeId}
          projectName={projectName}
          result={overview.result}
        />
      </PhoneSection>
      <PhoneSection label="Runs">
        {runs.length === 0 ? <PhoneSectionNote>No Runs recorded yet</PhoneSectionNote> : null}
        {runs.map((summary) => (
          <PhoneRunRow
            key={`${summary.experimentSlug}/${summary.run.id}`}
            summary={summary}
            now={now}
            context={summary.experimentName}
            onOpen={() => openPhoneRun(summary)}
          />
        ))}
      </PhoneSection>
    </>
  )
}

/** A project's workspaces with their sessions, and the Experiments and Runs its catalog records. */
export function PhoneProjectScreen({
  projectKey,
  sessions
}: {
  projectKey: string
  sessions: PhoneSession[]
}): React.JSX.Element {
  const { projects } = usePhoneProjects()
  const now = useDeadlineClock(30_000)
  const project = projects.find((entry) => entry.key === projectKey)
  const primaryId = project?.workspaces[0]?.id ?? null
  usePhoneResearchOverviewRefresh(primaryId ? [primaryId] : [])
  const families = usePhoneSessionFamilies(sessions.filter((session) => !session.idleShell))
  if (!project || !primaryId) {
    return (
      <PhoneEmptyState icon={FolderX} title="Project not found">
        It may have been removed on the host.
      </PhoneEmptyState>
    )
  }
  const single = project.workspaces.length === 1
  return (
    <PhoneScrollBody>
      {project.workspaces.map((workspace) => {
        const label = single ? project.name : `${project.name} · ${workspace.name}`
        const rows = families.filter((family) => family.session.worktreeId === workspace.id)
        const idle = sessions.filter(
          (session) => session.worktreeId === workspace.id && session.idleShell
        )
        const row = (session: PhoneSession): React.ReactNode => (
          <PhoneSessionRow key={session.tabId} session={session} headerSubtitle={label} now={now} />
        )
        return (
          <PhoneSection
            key={workspace.id}
            label={
              single
                ? 'Sessions'
                : `${workspace.name}${workspace.branch ? ` · ${workspace.branch}` : ''}`
            }
            trailing={<NewAgentButton workspaceId={workspace.id} />}
          >
            {rows.map((family) => (
              <PhoneSessionFamilyRows
                key={family.session.tabId}
                family={family}
                headerSubtitleOf={() => label}
                workspaceNameOf={() => undefined}
                now={now}
              />
            ))}
            <PhoneIdleShellRows sessions={idle} renderRow={row} />
            {rows.length === 0 && idle.length === 0 ? (
              <PhoneSectionNote>No terminals open</PhoneSectionNote>
            ) : null}
          </PhoneSection>
        )
      })}
      <ProjectResearch worktreeId={primaryId} projectName={project.name} now={now} />
    </PhoneScrollBody>
  )
}
