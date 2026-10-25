import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Cpu, Plus } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { selectFolderWorkspaces, selectWorktreesByRepo } from '@/store/workspace-record-selectors'
import { toSshExecutionHostId } from '../../../../shared/execution-host'
import { getHostSettingOverride } from '../../../../shared/host-setting-overrides'
import type { ResearchComputeSample } from '../../../../shared/research/research-compute-probe'
import {
  computeBridgeCapabilities,
  computeProbeFolders,
  computeSampleProblems,
  failedComputeSample
} from './research-compute-sample-state'
import {
  collectResearchComputeUsage,
  countOpenProjectJobsByHost,
  groupResearchComputeUsageByProject,
  type ResearchComputeHostInput,
  type ResearchComputeJobEntry
} from './research-compute-usage'
import { readComputeRefreshInterval } from './research-compute-refresh-interval'
import {
  readComputeSelectedHosts,
  writeComputeSelectedHosts
} from './research-compute-selected-hosts'
import { selectResearchComputeWorkspaces } from './research-compute-workspaces'
import {
  isReadableComputeHost,
  ResearchComputeHostStrip,
  type ResearchComputeHost
} from './ResearchComputeHostStrip'
import { ResearchComputeClusterView } from './ResearchComputeClusterView'
import { openAddSshHost, ResearchComputeHeaderActions } from './ResearchComputeHeaderActions'
import { ResearchComputeGpuOverview } from './ResearchComputeGpuOverview'
import { ResearchComputeProblems } from './ResearchComputeProblems'
import { ResearchComputeLinkDialog, type ComputeLinkDraft } from './ResearchComputeLinkDialog'
import { ResearchComputeLinkList } from './ResearchComputeLinkList'
import { ResearchProjectTransferDialog } from './ResearchProjectTransferDialog'
import type { ResearchComputeLink } from '../../../../shared/research/research-compute-links'
import { ResearchComputeProjectList } from './ResearchComputeProjectList'
import { ResearchSlurmCancelDialog } from './ResearchSlurmCancelDialog'
import { ResearchSlurmSubmitDialog } from './ResearchSlurmSubmitDialog'
import { useResearchComputeLinks } from './use-research-compute-links'
import { useResearchGpuPolicy } from './use-research-gpu-policy'
import { computeHostGpuBudgets, projectBudgetNotes } from './research-gpu-budget-view'
import { localRootsForComputeLink } from './research-compute-local-roots'
import { ResearchEmptyState, ResearchPageBody, ResearchPageHeader } from './ResearchPageLayout'

export function ResearchComputePage(): React.JSX.Element {
  const targetLabels = useAppStore((state) => state.sshTargetLabels)
  const connectionStates = useAppStore((state) => state.sshConnectionStates)
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
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(readComputeRefreshInterval)
  const [samples, setSamples] = useState<Record<string, ResearchComputeSample>>({})
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [gpuSelection, setGpuSelection] = useState<Record<string, number[]>>({})
  const [chosenHosts, setChosenHosts] = useState(readComputeSelectedHosts)
  const [linkDraft, setLinkDraft] = useState<ComputeLinkDraft | null>(null)
  const [transferLink, setTransferLink] = useState<ResearchComputeLink | null>(null)
  const [cancelEntry, setCancelEntry] = useState<ResearchComputeJobEntry | null>(null)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [capabilities] = useState(computeBridgeCapabilities)
  const {
    links,
    error: linksError,
    addLink,
    removeLink
  } = useResearchComputeLinks(capabilities.links)
  const gpuPolicy = useResearchGpuPolicy(capabilities.gpuPolicy)

  const hosts = useMemo<ResearchComputeHost[]>(
    () =>
      [...targetLabels.entries()]
        .map(([targetId, label]) => ({
          targetId,
          label:
            getHostSettingOverride(settings, toSshExecutionHostId(targetId), 'displayLabel') ??
            label,
          connected: connectionStates.get(targetId)?.status === 'connected'
        }))
        .map((host) => ({
          ...host,
          // Until the user picks, the hosts Aster is already connected to are the selection.
          selected: chosenHosts ? chosenHosts.has(host.targetId) : host.connected
        }))
        // Why label only: picking a host must not reorder the chips.
        .sort((a, b) => a.label.localeCompare(b.label)),
    [targetLabels, connectionStates, settings, chosenHosts]
  )
  const workspacesByTarget = useMemo(
    () =>
      new Map(
        hosts.map((host) => [
          host.targetId,
          selectResearchComputeWorkspaces(workspaceSources, host.targetId, links)
        ])
      ),
    [hosts, workspaceSources, links]
  )

  const mounted = useRef(true)
  const inFlight = useRef(new Set<string>())
  const probeInputs = useRef({ hosts, workspacesByTarget })
  probeInputs.current = { hosts, workspacesByTarget }

  const refresh = useCallback(() => {
    for (const host of probeInputs.current.hosts) {
      if (!isReadableComputeHost(host) || inFlight.current.has(host.targetId)) {
        continue
      }
      const { targetId } = host
      inFlight.current.add(targetId)
      setPending(new Set(inFlight.current))
      const folders = computeProbeFolders(
        probeInputs.current.workspacesByTarget.get(targetId) ?? []
      )
      window.api.researchCompute
        .sample({ targetId, ...folders, dial: !host.connected })
        .catch((cause: unknown) => failedComputeSample(targetId, cause))
        .then((sample) => {
          if (mounted.current) {
            setSamples((previous) => ({ ...previous, [targetId]: sample }))
          }
        })
        .finally(() => {
          inFlight.current.delete(targetId)
          if (mounted.current) {
            setPending(new Set(inFlight.current))
          }
        })
    }
  }, [])

  const readableKey = hosts
    .filter(isReadableComputeHost)
    .map((host) => `${host.targetId}:${host.connected}`)
    .join('\0')
  useEffect(() => {
    mounted.current = true
    refresh()
  }, [refresh, readableKey])
  // Why separate: changing the interval should restart the timer, not read the cluster again.
  useEffect(() => {
    if (!refreshIntervalMs) {
      return
    }
    const timer = window.setInterval(refresh, refreshIntervalMs)
    return () => window.clearInterval(timer)
  }, [refresh, readableKey, refreshIntervalMs])
  useEffect(
    () => () => {
      mounted.current = false
    },
    []
  )

  const readableHosts = useMemo<ResearchComputeHostInput[]>(
    () =>
      hosts.flatMap((host) => {
        const sample = samples[host.targetId]
        return isReadableComputeHost(host) && sample?.status === 'ok'
          ? [
              {
                targetId: host.targetId,
                hostLabel: host.label,
                sample,
                workspaces: workspacesByTarget.get(host.targetId) ?? []
              }
            ]
          : []
      }),
    [hosts, samples, workspacesByTarget]
  )
  const usage = useMemo(() => collectResearchComputeUsage(readableHosts), [readableHosts])
  const usages = useMemo(() => groupResearchComputeUsageByProject(usage), [usage])
  const lastCapturedAt = readableHosts
    .map((host) => host.sample.capturedAt)
    .sort()
    .at(-1)
  const readableCount = hosts.filter(isReadableComputeHost).length
  const hostById = new Map(hosts.map((host) => [host.targetId, host]))
  const dialFor = (targetId: string): boolean => !hostById.get(targetId)?.connected
  const budgets = useMemo(
    () => computeHostGpuBudgets(gpuPolicy.policy, readableHosts),
    [gpuPolicy.policy, readableHosts]
  )
  const slurmHosts = readableHosts
    .filter((host) => host.sample.slurm.status === 'ok')
    .map((host) => ({
      ...host,
      label: host.hostLabel,
      dial: dialFor(host.targetId),
      budget: budgets.get(host.targetId) ?? null
    }))
  const openProjectJobs = useMemo(() => countOpenProjectJobsByHost(usages), [usages])
  const problems = hosts.flatMap((host) => {
    const sample = samples[host.targetId]
    return isReadableComputeHost(host) && sample
      ? computeSampleProblems(sample).map((message) => ({ host, message }))
      : []
  })

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-background text-foreground"
      aria-label="Research compute"
    >
      <ResearchPageHeader
        title="Compute"
        actions={
          // Why: with no host there is nothing to refresh or submit to; the empty state says what to do.
          hosts.length ? (
            <ResearchComputeHeaderActions
              lastCapturedAt={lastCapturedAt}
              refreshIntervalMs={refreshIntervalMs}
              onRefreshIntervalChange={setRefreshIntervalMs}
              readable={readableCount > 0}
              refreshing={pending.size > 0}
              onRefresh={refresh}
              canSubmitJobs={capabilities.jobs}
              hasSlurmHost={slurmHosts.length > 0}
              onNewJob={() => setSubmitOpen(true)}
            />
          ) : null
        }
      />
      <ResearchPageBody className="space-y-6">
        {hosts.length ? (
          <ResearchComputeHostStrip
            hosts={hosts}
            samples={samples}
            pending={pending}
            openProjectJobs={openProjectJobs}
            onSelectedChange={(targetId, selected) => {
              const next = new Set(
                hosts.filter((host) => host.selected).map((host) => host.targetId)
              )
              if (selected) {
                next.add(targetId)
              } else {
                next.delete(targetId)
              }
              writeComputeSelectedHosts(next)
              setChosenHosts(next)
            }}
          />
        ) : null}

        <ResearchComputeProblems problems={problems} />

        {capabilities.jobs && capabilities.links ? null : (
          <p className="text-xs text-muted-foreground">
            Restart the app to submit jobs and link folders.
          </p>
        )}

        {linksError || gpuPolicy.error ? (
          <p role="alert" className="text-xs text-destructive">
            {[linksError, gpuPolicy.error].filter(Boolean).join(' ')}
          </p>
        ) : null}

        {!hosts.length ? (
          <ResearchEmptyState
            icon={Cpu}
            title="No SSH hosts yet"
            action={
              <Button size="sm" onClick={openAddSshHost}>
                <Plus aria-hidden />
                Add SSH host
              </Button>
            }
          >
            Add the GPU server or cluster login node you train on to see its jobs and GPUs here.
          </ResearchEmptyState>
        ) : !readableCount ? (
          <ResearchEmptyState icon={Cpu} title="Choose hosts">
            Select hosts above to see their jobs and GPUs.
          </ResearchEmptyState>
        ) : (
          <div className="space-y-8">
            <ResearchComputeProjectList
              usages={usages}
              budgetNotes={projectBudgetNotes(budgets, (id) => hostById.get(id)?.label ?? id)}
              jobActions={{
                onCancel: capabilities.jobs ? setCancelEntry : undefined,
                onLinkFolder: capabilities.links
                  ? (entry) =>
                      setLinkDraft({ targetId: entry.targetId, directory: entry.job.workDir })
                  : undefined
              }}
            />
            <ResearchComputeGpuOverview
              readings={readableHosts}
              budgets={budgets}
              policy={gpuPolicy.policy}
              onSavePolicy={capabilities.gpuPolicy ? gpuPolicy.save : undefined}
            />
            {capabilities.links ? (
              <ResearchComputeLinkList
                links={links}
                hostLabel={(targetId) => hostById.get(targetId)?.label ?? targetId}
                projectName={(link) =>
                  workspaceSources.projects.find((project) => project.id === link.projectId)
                    ?.displayName ?? `${link.projectName} (not open)`
                }
                onAdd={() =>
                  setLinkDraft({
                    targetId: readableHosts[0]?.targetId ?? hosts[0].targetId,
                    directory: null
                  })
                }
                onTransfer={setTransferLink}
                onRemove={(link) => void removeLink(link)}
              />
            ) : null}
            <ResearchComputeClusterView
              readings={readableHosts}
              processes={usage.processes}
              gpuSelection={gpuSelection}
              onGpuSelectionChange={(targetId, indices) =>
                setGpuSelection((previous) => ({ ...previous, [targetId]: indices }))
              }
            />
          </div>
        )}
      </ResearchPageBody>
      <ResearchComputeLinkDialog
        draft={linkDraft}
        hosts={hosts.map((host) => ({
          targetId: host.targetId,
          label: host.label,
          remoteUser: samples[host.targetId]?.remoteUser ?? null
        }))}
        projects={workspaceSources.projects}
        onClose={() => setLinkDraft(null)}
        // The probe resolves each folder's symlinks on the host, so re-read with the new folder.
        onSave={(input) => addLink(input).then(refresh)}
      />
      <ResearchProjectTransferDialog
        link={transferLink}
        projectName={
          workspaceSources.projects.find((project) => project.id === transferLink?.projectId)
            ?.displayName ??
          transferLink?.projectName ??
          ''
        }
        suggestedLocalRoots={localRootsForComputeLink(
          transferLink,
          workspaceSources.repos,
          workspaceSources.projects
        )}
        onClose={() => setTransferLink(null)}
      />
      <ResearchSlurmCancelDialog
        entry={cancelEntry}
        dial={cancelEntry ? dialFor(cancelEntry.targetId) : false}
        onClose={() => setCancelEntry(null)}
        onCancelled={refresh}
      />
      <ResearchSlurmSubmitDialog
        open={submitOpen}
        hosts={slurmHosts}
        onClose={() => setSubmitOpen(false)}
        onSubmitted={refresh}
      />
    </section>
  )
}
