import { CircleCheck, FlaskConical, FolderPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { useDeadlineClock } from '@/features/research/use-deadline-clock'
import { ResearchComputeProjectDot } from '@/features/research/ResearchComputeProjectDot'
import type { ResearchHomeProject } from '@/features/research/research-home-projects'
import { usePhoneNavigation } from './phone-navigation-store'
import {
  usePhoneResearchOverviewRefresh,
  usePhoneResearchOverviews
} from './phone-research-overviews'
import { formatRunMetric, listPhoneRuns, runStateLabel } from './phone-run-summaries'
import { phoneSessionIsWorking, phoneSessionNeedsYou, type PhoneSession } from './phone-sessions'
import { PhoneEmptyState, PhoneRow, PhoneScrollBody, PhoneSection } from './PhoneListLayout'
import { usePhoneHostResearchRefresh } from './phone-host-research-reads'
import { PhoneComputeSection, PhoneDeadlinesSection } from './PhoneHomeResearch'
import { PhoneHomeScreenCard } from './PhoneHomeScreenCard'
import { PhoneRecentActivity } from './PhoneRecentActivity'
import { PhoneSessionRow } from './PhoneSessionRow'
import { phoneWorkspaceLabel, usePhoneProjects } from './use-phone-projects'

const NEEDS_YOU_SHOWN = 3

/** "1 needs you · 1 working · 2 terminals"; zero counts stay out. */
function sessionSummary(sessions: readonly PhoneSession[]): string {
  const live = sessions.filter((entry) => entry.running)
  const needsYou = live.filter((entry) => phoneSessionNeedsYou(entry.state)).length
  const working = live.filter((entry) => phoneSessionIsWorking(entry.state)).length
  const others = live.length - needsYou - working
  const parts = [
    needsYou ? `${needsYou} ${needsYou === 1 ? 'needs' : 'need'} you` : null,
    working ? `${working} working` : null,
    others ? `${others} idle` : null
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'No sessions running'
}

function ProjectCard({
  project,
  sessions
}: {
  project: ResearchHomeProject
  sessions: readonly PhoneSession[]
}): React.JSX.Element {
  const primaryId = project.workspaces[0]?.id ?? ''
  const overview = usePhoneResearchOverviews((state) => state.byWorktreeId[primaryId])
  const latest = overview?.status === 'ready' ? listPhoneRuns(primaryId, overview.result)[0] : null
  return (
    <button
      type="button"
      onClick={() =>
        usePhoneNavigation
          .getState()
          .push({ kind: 'project', projectKey: project.key, title: project.name })
      }
      className="w-full rounded-xl border border-border bg-card text-left active:bg-accent"
    >
      <span className="block px-4 pt-3.5 pb-3">
        <span className="flex items-center gap-2.5">
          <ResearchComputeProjectDot color={project.badgeColor} />
          <span className="min-w-0 truncate text-[17px] leading-snug font-semibold">
            {project.name}
          </span>
        </span>
        <span className="mt-1 block truncate text-[13px] text-muted-foreground">
          {sessionSummary(sessions)}
        </span>
      </span>
      {latest ? (
        <span className="relative flex items-center gap-2 px-4 py-2.5 text-[13px] text-muted-foreground before:absolute before:top-0 before:right-0 before:left-4 before:h-px before:bg-border">
          <FlaskConical className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">
            <span className="text-foreground">{latest.run.name || latest.run.id}</span>
            {` · ${runStateLabel(latest.run.state)}`}
            {latest.keyMetric ? ` · ${formatRunMetric(latest.keyMetric)}` : ''}
          </span>
        </span>
      ) : null}
    </button>
  )
}

/** What needs the user first, then each project on this host as one card. */
export function PhoneHomeScreen({ sessions }: { sessions: PhoneSession[] }): React.JSX.Element {
  const { projects, byWorkspaceId } = usePhoneProjects()
  const openModal = useAppStore((state) => state.openModal)
  const selectTab = usePhoneNavigation((state) => state.selectTab)
  const now = useDeadlineClock(30_000)
  usePhoneResearchOverviewRefresh(projects.flatMap((project) => project.workspaces[0]?.id ?? []))
  usePhoneHostResearchRefresh()

  if (projects.length === 0) {
    return (
      <PhoneScrollBody>
        <PhoneHomeScreenCard />
        <PhoneEmptyState icon={FolderPlus} title="No projects on this host">
          <p>Add the folder or Git repository with your research code.</p>
          <Button className="mt-4" onClick={() => openModal('add-repo')}>
            <FolderPlus aria-hidden />
            Add project
          </Button>
        </PhoneEmptyState>
      </PhoneScrollBody>
    )
  }
  const needsYou = sessions.filter((entry) => entry.running && phoneSessionNeedsYou(entry.state))
  const working = sessions.filter((entry) => entry.running && phoneSessionIsWorking(entry.state))
  return (
    <PhoneScrollBody>
      <PhoneHomeScreenCard />
      {needsYou.length > 0 ? (
        <PhoneSection label="Needs you">
          {needsYou.slice(0, NEEDS_YOU_SHOWN).map((session) => (
            <PhoneSessionRow
              key={`${session.worktreeId}\0${session.tabId}`}
              session={session}
              headerSubtitle={phoneWorkspaceLabel(byWorkspaceId.get(session.worktreeId))}
              now={now}
            />
          ))}
          {needsYou.length > NEEDS_YOU_SHOWN ? (
            <PhoneRow
              title={`${needsYou.length - NEEDS_YOU_SHOWN} more in Agents`}
              onClick={() => selectTab('agents')}
            />
          ) : null}
        </PhoneSection>
      ) : (
        <PhoneSection>
          <PhoneRow
            leading={<CircleCheck className="size-5 text-status-success" aria-hidden />}
            title="Nothing needs you"
            subtitle={
              working.length
                ? `${working.length} ${working.length === 1 ? 'agent is' : 'agents are'} working`
                : 'No agent is working right now'
            }
          />
        </PhoneSection>
      )}
      <section aria-label="Projects" className="space-y-3 px-4 pt-5">
        <h2 className="px-4 text-[13px] font-medium text-muted-foreground">Projects</h2>
        {projects.map((project) => {
          const ids = new Set(project.workspaces.map((workspace) => workspace.id))
          return (
            <ProjectCard
              key={project.key}
              project={project}
              sessions={sessions.filter((session) => ids.has(session.worktreeId))}
            />
          )
        })}
      </section>
      <PhoneRecentActivity
        projects={projects}
        sessions={sessions}
        byWorkspaceId={byWorkspaceId}
        now={now}
      />
      <PhoneComputeSection />
      <PhoneDeadlinesSection now={now} />
    </PhoneScrollBody>
  )
}
