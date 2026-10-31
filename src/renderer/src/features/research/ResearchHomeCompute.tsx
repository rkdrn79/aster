import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Cpu } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { isWebClientLocation } from '@/lib/web-client-location'
import { selectFolderWorkspaces, selectWorktreesByRepo } from '@/store/workspace-record-selectors'
import { getHostSettingOverride } from '../../../../shared/host-setting-overrides'
import { toSshExecutionHostId } from '../../../../shared/execution-host'
import type { ResearchComputeSample } from '../../../../shared/research/research-compute-probe'
import {
  collectResearchComputeUsage,
  groupResearchComputeUsageByProject
} from './research-compute-usage'
import {
  computeBridgeCapabilities,
  computeProbeFolders,
  failedComputeSample
} from './research-compute-sample-state'
import { selectResearchComputeWorkspaces } from './research-compute-workspaces'
import { useResearchComputeLinks } from './use-research-compute-links'
import { ResearchComputeProjectDot } from './ResearchComputeProjectDot'
import type { ResearchHomeProject } from './research-home-projects'
import { openResearchHome } from './research-navigation'
import type { ResearchHomeActivity } from './research-home-activity'

const PROJECTS_SHOWN = 5
const REFRESH_INTERVAL_MS = 60_000

type ComputeHost = { id: string; label: string; connected: boolean }

function projectObservation(
  hostIds: readonly string[],
  hosts: readonly ComputeHost[],
  samples: Readonly<Record<string, ResearchComputeSample>>
): { message: string | null; partial: boolean } {
  if (!hostIds.length) {
    return { message: 'No remote compute folder linked', partial: false }
  }
  const connectedIds = hostIds.filter((id) =>
    hosts.some((host) => host.id === id && host.connected)
  )
  if (!connectedIds.length) {
    return { message: 'Compute source disconnected', partial: false }
  }
  const observedIds = connectedIds.filter(
    (id) => samples[id]?.status === 'ok' && samples[id]?.slurm.status === 'ok'
  )
  if (!observedIds.length) {
    return {
      message: connectedIds.some((id) => !samples[id])
        ? 'Checking compute…'
        : 'Job status unavailable',
      partial: false
    }
  }
  return { message: null, partial: observedIds.length < hostIds.length }
}

/** A compact project view; host controls and job actions remain on the Compute page. */
export function ResearchHomeCompute({
  projects,
  activity
}: {
  projects: readonly ResearchHomeProject[]
  /** Run counts from the research records, shared with the project cards. */
  activity: ReadonlyMap<string, ResearchHomeActivity>
}): React.JSX.Element {
  const labels = useAppStore((state) => state.sshTargetLabels)
  const connections = useAppStore((state) => state.sshConnectionStates)
  const settings = useAppStore((state) => state.settings)
  const workspaceSources = useAppStore(
    useShallow((state) => ({
      repos: state.repos,
      worktreesByRepo: selectWorktreesByRepo(state),
      projects: state.projects,
      folderWorkspaces: selectFolderWorkspaces(state),
      projectGroups: state.projectGroups
    }))
  )
  const [capabilities] = useState(computeBridgeCapabilities)
  // Why: the web client has no compute bridge; its fallback would read as unlinked, empty hosts.
  const desktopOnly = isWebClientLocation()
  const canProbe = typeof window.api.researchCompute?.sample === 'function'
  const { links, error: linksError } = useResearchComputeLinks(capabilities.links)
  const [snapshot, setSnapshot] = useState<{
    key: string
    samples: Record<string, ResearchComputeSample>
  }>({ key: '', samples: {} })
  const hosts = useMemo<ComputeHost[]>(
    () =>
      [...labels.entries()]
        .map(([id, label]) => ({
          id,
          label:
            getHostSettingOverride(settings, toSshExecutionHostId(id), 'displayLabel') ?? label,
          connected: connections.get(id)?.status === 'connected'
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [labels, connections, settings]
  )
  const workspacesByHost = useMemo(
    () =>
      new Map(
        hosts.map((host) => [
          host.id,
          selectResearchComputeWorkspaces(workspaceSources, host.id, links)
        ])
      ),
    [hosts, workspaceSources, links]
  )
  const connectedHosts = useMemo(
    () =>
      hosts.filter((host) => host.connected && (workspacesByHost.get(host.id)?.length ?? 0) > 0),
    [hosts, workspacesByHost]
  )
  const probeKey = JSON.stringify(
    connectedHosts.map((host) => [
      host.id,
      computeProbeFolders(workspacesByHost.get(host.id) ?? [])
    ])
  )
  const samples = snapshot.key === probeKey ? snapshot.samples : {}

  useEffect(() => {
    if (!canProbe || !connectedHosts.length || !projects.length) {
      return
    }
    let active = true
    let reading = false
    const refresh = async (): Promise<void> => {
      if (reading) {
        return
      }
      reading = true
      const results = await Promise.all(
        connectedHosts.map(async (host) => {
          const folders = computeProbeFolders(workspacesByHost.get(host.id) ?? [])
          const sample = await window.api.researchCompute
            .sample({ targetId: host.id, ...folders, dial: false })
            .catch((cause: unknown) => failedComputeSample(host.id, cause))
          return [host.id, sample] as const
        })
      )
      if (active) {
        setSnapshot({ key: probeKey, samples: Object.fromEntries(results) })
      }
      reading = false
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [canProbe, connectedHosts, workspacesByHost, probeKey, projects.length])

  const readableHosts = connectedHosts.flatMap((host) => {
    const sample = samples[host.id]
    return sample?.status === 'ok'
      ? [
          {
            targetId: host.id,
            hostLabel: host.label,
            sample,
            workspaces: workspacesByHost.get(host.id) ?? []
          }
        ]
      : []
  })
  const usages = groupResearchComputeUsageByProject(collectResearchComputeUsage(readableHosts))
  const byProject = new Map(
    usages.filter((usage) => usage.projectKey).map((usage) => [usage.projectKey, usage])
  )
  const projectHosts = new Map<string, string[]>()
  for (const host of hosts) {
    for (const workspace of workspacesByHost.get(host.id) ?? []) {
      const ids = projectHosts.get(workspace.projectKey) ?? []
      if (!ids.includes(host.id)) {
        ids.push(host.id)
      }
      projectHosts.set(workspace.projectKey, ids)
    }
  }
  const rows = projects.flatMap((project) => {
    const usage = byProject.get(project.key)
    const hostIds = projectHosts.get(project.key) ?? []
    const runs = activity.get(project.key)
    const linked = hostIds.length > 0
    if (!linked && !runs?.running && !runs?.stalled) {
      return []
    }
    const observation = linked ? projectObservation(hostIds, hosts, samples) : null
    const processCount = usage
      ? new Set(usage.processes.map((entry) => `${entry.targetId}:${entry.process.pid}`)).size
      : 0
    const parts = [
      runs?.running ? `${runs.running} ${runs.running === 1 ? 'run' : 'runs'} running` : null,
      !linked
        ? null
        : !canProbe
          ? 'Compute probe unavailable'
          : (observation?.message ??
            (usage?.runningJobs || usage?.pendingJobs
              ? `${usage.runningJobs} running · ${usage.pendingJobs} queued jobs`
              : 'No jobs')),
      processCount ? `${processCount} GPU ${processCount === 1 ? 'process' : 'processes'}` : null
    ].filter((part): part is string => part !== null)
    return [{ project, usage, runs, observation, parts }]
  })
  rows.sort(
    (a, b) =>
      (b.runs?.stalled ?? 0) - (a.runs?.stalled ?? 0) ||
      (b.runs?.running ?? 0) - (a.runs?.running ?? 0) ||
      (b.usage?.runningJobs ?? 0) - (a.usage?.runningJobs ?? 0) ||
      (b.usage?.pendingJobs ?? 0) - (a.usage?.pendingJobs ?? 0) ||
      b.project.lastVisitedAt - a.project.lastVisitedAt
  )
  const unlinkedCount = projects.filter((project) => !projectHosts.has(project.key)).length
  const unassigned = usages.find((usage) => usage.projectKey === null)
  const unassignedCount = (unassigned?.jobs.length ?? 0) + (unassigned?.processes.length ?? 0)

  return (
    <section
      aria-label="Compute"
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => openResearchHome('research-compute')}
      >
        <Cpu className="size-4 text-muted-foreground" aria-hidden />
        <span className="flex-1 text-sm font-medium">Compute</span>
        <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
      </button>
      {desktopOnly ? (
        <p className="border-t border-border px-4 py-4 text-xs text-muted-foreground">
          Available in the desktop app.
        </p>
      ) : rows.length ? (
        <ul className="divide-y divide-border border-t border-border">
          {rows.slice(0, PROJECTS_SHOWN).map(({ project, runs, observation, parts }) => (
            <li key={project.key} className="min-w-0 px-4 py-2.5 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <ResearchComputeProjectDot color={project.badgeColor} />
                <span className="min-w-0 flex-1 truncate font-medium" title={project.name}>
                  {project.name}
                </span>
                {observation?.partial ? (
                  <span className="text-muted-foreground">Partial</span>
                ) : null}
              </div>
              <p className="mt-1 truncate pl-4 text-muted-foreground">
                {runs?.stalled ? (
                  <span className="font-medium text-status-warning">
                    {runs.stalled} {runs.stalled === 1 ? 'run needs' : 'runs need'} attention
                    {parts.length ? ' · ' : ''}
                  </span>
                ) : null}
                {parts.join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {desktopOnly ? null : !projects.length ? (
        <p className="border-t border-border px-4 py-4 text-xs text-muted-foreground">
          Add a project to see its compute activity here.
        </p>
      ) : unlinkedCount ? (
        <div className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1">
            {unlinkedCount === projects.length
              ? 'No remote compute linked yet.'
              : `${unlinkedCount} ${unlinkedCount === 1 ? 'project has' : 'projects have'} no remote compute.`}
          </span>
          <Button size="xs" variant="outline" onClick={() => openResearchHome('research-compute')}>
            Link compute
          </Button>
        </div>
      ) : null}
      {!desktopOnly && (rows.length > PROJECTS_SHOWN || unassignedCount || linksError) ? (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          {[
            rows.length > PROJECTS_SHOWN ? `${rows.length - PROJECTS_SHOWN} more projects` : null,
            unassignedCount ? `${unassignedCount} unassigned jobs or processes` : null,
            linksError ? 'Project folder links unavailable' : null
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}
    </section>
  )
}
