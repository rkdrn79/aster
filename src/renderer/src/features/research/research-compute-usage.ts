import type {
  ResearchComputeSample,
  ResearchGpuDevice,
  ResearchGpuProcess,
  ResearchSlurmJob
} from '../../../../shared/research/research-compute-probe'
import {
  attributeResearchComputePath,
  type ResearchComputeAttribution,
  type ResearchComputeWorkspace
} from './research-compute-workspaces'

export type ResearchComputeHostInput = {
  targetId: string
  hostLabel: string
  sample: ResearchComputeSample
  workspaces: readonly ResearchComputeWorkspace[]
}

export type ResearchComputeJobEntry = {
  targetId: string
  hostLabel: string
  job: ResearchSlurmJob
  attribution: ResearchComputeAttribution | null
}

export type ResearchComputeProcessEntry = {
  targetId: string
  hostLabel: string
  device: ResearchGpuDevice | null
  process: ResearchGpuProcess
  attribution: ResearchComputeAttribution | null
  ownedByRemoteUser: boolean
}

export type ResearchComputeProjectUsage = {
  /** Null groups work no workspace on that host accounts for. */
  projectKey: string | null
  projectName: string | null
  badgeColor: string | null
  jobs: ResearchComputeJobEntry[]
  processes: ResearchComputeProcessEntry[]
  runningJobs: number
  runningGpus: number
  pendingJobs: number
  pendingGpus: number
  processGpus: number
}

export function isRunningSlurmState(state: string): boolean {
  return state === 'R' || state === 'CG'
}

export function isPendingSlurmState(state: string): boolean {
  return state === 'PD'
}

export function collectResearchComputeUsage(hosts: readonly ResearchComputeHostInput[]): {
  jobs: ResearchComputeJobEntry[]
  processes: ResearchComputeProcessEntry[]
} {
  return {
    jobs: hosts.flatMap(({ targetId, hostLabel, sample, workspaces }) =>
      sample.slurm.jobs.map((job) => ({
        targetId,
        hostLabel,
        job,
        attribution: attributeResearchComputePath(
          { cwd: job.workDir, command: job.command },
          workspaces,
          sample.resolvedWorkspacePaths
        )
      }))
    ),
    processes: hosts.flatMap(({ targetId, hostLabel, sample, workspaces }) =>
      sample.gpu.processes.map((process) => ({
        targetId,
        hostLabel,
        device: sample.gpu.devices.find((device) => device.uuid === process.gpuUuid) ?? null,
        process,
        attribution: attributeResearchComputePath(
          process,
          workspaces,
          sample.resolvedWorkspacePaths
        ),
        ownedByRemoteUser: Boolean(sample.remoteUser) && process.user === sample.remoteUser
      }))
    )
  }
}

function stateRank(state: string): number {
  return isRunningSlurmState(state) ? 0 : isPendingSlurmState(state) ? 1 : 2
}

export function groupResearchComputeUsageByProject(usage: {
  jobs: readonly ResearchComputeJobEntry[]
  processes: readonly ResearchComputeProcessEntry[]
}): ResearchComputeProjectUsage[] {
  const numericJobIdCollator = new Intl.Collator(undefined, { numeric: true })
  const groups = new Map<string | null, ResearchComputeProjectUsage>()
  const groupFor = (
    attribution: ResearchComputeAttribution | null
  ): ResearchComputeProjectUsage => {
    const workspace = attribution?.workspace ?? null
    const key = workspace?.projectKey ?? null
    const group = groups.get(key) ?? {
      projectKey: key,
      projectName: workspace?.projectName ?? null,
      badgeColor: workspace?.badgeColor ?? null,
      jobs: [],
      processes: [],
      runningJobs: 0,
      runningGpus: 0,
      pendingJobs: 0,
      pendingGpus: 0,
      processGpus: 0
    }
    groups.set(key, group)
    return group
  }
  for (const entry of usage.jobs) {
    const group = groupFor(entry.attribution)
    group.jobs.push(entry)
    if (isRunningSlurmState(entry.job.state)) {
      group.runningJobs += 1
      group.runningGpus += entry.job.gpuCount
    } else if (isPendingSlurmState(entry.job.state)) {
      group.pendingJobs += 1
      group.pendingGpus += entry.job.gpuCount
    }
  }
  for (const entry of usage.processes) {
    groupFor(entry.attribution).processes.push(entry)
  }
  const usages = [...groups.values()].map((group) => ({
    ...group,
    jobs: [...group.jobs].sort(
      (a, b) =>
        stateRank(a.job.state) - stateRank(b.job.state) ||
        a.hostLabel.localeCompare(b.hostLabel) ||
        numericJobIdCollator.compare(a.job.jobId, b.job.jobId)
    ),
    processes: [...group.processes].sort(
      (a, b) =>
        a.hostLabel.localeCompare(b.hostLabel) ||
        (a.device?.index ?? Infinity) - (b.device?.index ?? Infinity) ||
        a.process.pid - b.process.pid
    ),
    processGpus: new Set(
      group.processes.map((entry) => `${entry.targetId}\0${entry.process.gpuUuid}`)
    ).size
  }))
  return usages.sort(
    (a, b) =>
      Number(a.projectKey === null) - Number(b.projectKey === null) ||
      b.runningGpus + b.processGpus - (a.runningGpus + a.processGpus) ||
      b.pendingJobs - a.pendingJobs ||
      (a.projectName ?? '').localeCompare(b.projectName ?? '')
  )
}

/** Running and pending jobs per host, counting only projects open in Aster (what the list shows). */
export function countOpenProjectJobsByHost(
  usages: readonly ResearchComputeProjectUsage[]
): Map<string, { running: number; pending: number }> {
  const counts = new Map<string, { running: number; pending: number }>()
  for (const entry of usages.flatMap((usage) => (usage.projectKey === null ? [] : usage.jobs))) {
    const count = counts.get(entry.targetId) ?? { running: 0, pending: 0 }
    count.running += Number(isRunningSlurmState(entry.job.state))
    count.pending += Number(isPendingSlurmState(entry.job.state))
    counts.set(entry.targetId, count)
  }
  return counts
}
