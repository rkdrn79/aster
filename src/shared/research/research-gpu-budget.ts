import type { ResearchSlurmJob } from './research-compute-probe'
import { matchResearchComputeFolder } from './research-compute-folder-match'
import {
  projectKeyFromSlurmComment,
  type ResearchGpuPolicy,
  type ResearchGpuPriority
} from './research-gpu-policy'

export type ResearchGpuProjectFolder = { path: string; projectKey: string }

const PRIORITY_RANK: Record<ResearchGpuPriority, number> = { high: 0, normal: 1, low: 2 }
/** Pending reasons of a job held by its owner (Aster's budget holds this way) or an admin. */
export const SLURM_HOLD_REASONS: ReadonlySet<string> = new Set(['JobHeldUser', 'JobHeldAdmin'])
const ACTIVE_STATES = new Set(['R', 'CG', 'CF'])

/** Held by Aster for a budget: pending, user-held, and tagged with its project at submission. */
export function isAsterHeldJob(
  job: Pick<ResearchSlurmJob, 'state' | 'reason' | 'comment'>
): boolean {
  return (
    job.state === 'PD' &&
    job.reason === 'JobHeldUser' &&
    projectKeyFromSlurmComment(job.comment) !== null
  )
}

/** GPUs a job holds now or takes once scheduled; held jobs take none until released. */
export function committedGpus(
  job: Pick<ResearchSlurmJob, 'state' | 'reason' | 'gpuCount'>
): number {
  if (ACTIVE_STATES.has(job.state)) {
    return job.gpuCount
  }
  return job.state === 'PD' && !SLURM_HOLD_REASONS.has(job.reason ?? '') ? job.gpuCount : 0
}

/** Aster's tag first; otherwise the project folder holding its WorkDir or batch script. */
export function projectKeyForSlurmJob(
  job: Pick<ResearchSlurmJob, 'comment' | 'workDir' | 'command'>,
  folders: readonly ResearchGpuProjectFolder[],
  resolvedPaths: Readonly<Record<string, string>>
): string | null {
  return (
    projectKeyFromSlurmComment(job.comment) ??
    matchResearchComputeFolder({ cwd: job.workDir, command: job.command }, folders, resolvedPaths)
      ?.folder.projectKey ??
    null
  )
}

export type ResearchGpuBudgetProject = {
  projectKey: string
  projectName: string
  maxGpus: number | null
  priority: ResearchGpuPriority
  usedGpus: number
}

export type ResearchGpuHeldJob = {
  jobId: string
  gpus: number
  projectKey: string
  priority: ResearchGpuPriority
}

export type ResearchGpuHostBudget = {
  targetId: string
  maxGpus: number
  autoRelease: boolean
  /** Running plus pending-and-not-held GPUs of every job the user has on the host. */
  usedGpus: number
  projects: ResearchGpuBudgetProject[]
  /** Oldest first within each priority, highest priority first: the release order. */
  held: ResearchGpuHeldJob[]
}

function jobOrder(jobId: string): number {
  return Number.parseInt(jobId, 10) || 0
}

export function computeResearchGpuBudget(
  policy: ResearchGpuPolicy,
  targetId: string,
  jobs: readonly ResearchSlurmJob[],
  projectKeyOf: (job: ResearchSlurmJob) => string | null
): ResearchGpuHostBudget | null {
  const host = policy.hosts.find((entry) => entry.targetId === targetId)
  if (!host) {
    return null
  }
  const projects = policy.projects
    .filter((entry) => entry.targetId === targetId)
    .map(({ projectKey, projectName, maxGpus, priority }) => ({
      projectKey,
      projectName,
      maxGpus,
      priority,
      usedGpus: 0
    }))
  const budget: ResearchGpuHostBudget = {
    targetId,
    maxGpus: host.maxGpus,
    autoRelease: host.autoRelease,
    usedGpus: 0,
    projects,
    held: []
  }
  for (const job of jobs) {
    const gpus = committedGpus(job)
    const projectKey = projectKeyOf(job)
    const project = projects.find((entry) => entry.projectKey === projectKey)
    budget.usedGpus += gpus
    if (project) {
      project.usedGpus += gpus
    }
    if (projectKey && isAsterHeldJob(job)) {
      budget.held.push({
        jobId: job.jobId,
        gpus: job.gpuCount,
        projectKey,
        priority: project?.priority ?? 'normal'
      })
    }
  }
  budget.held.sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || jobOrder(a.jobId) - jobOrder(b.jobId)
  )
  return budget
}

export type ResearchGpuSubmitDecision = { hold: boolean; reason: string | null }

/** Whether a new job of `gpus` for `projectKey` fits now, or must wait held behind the budget. */
export function decideGpuSubmission(
  budget: ResearchGpuHostBudget | null,
  projectKey: string | null,
  gpus: number
): ResearchGpuSubmitDecision {
  if (!budget || gpus === 0) {
    return { hold: false, reason: null }
  }
  const project = budget.projects.find((entry) => entry.projectKey === projectKey)
  const rank = PRIORITY_RANK[project?.priority ?? 'normal']
  // Why: a new job must not take host room ahead of held jobs it does not outrank. Jobs waiting
  // only on their own project's cap are not ahead of it.
  const ahead = budget.held.filter((job) => {
    const owner = budget.projects.find((entry) => entry.projectKey === job.projectKey)
    const fitsCap = owner?.maxGpus == null || owner.usedGpus + job.gpus <= owner.maxGpus
    return PRIORITY_RANK[job.priority] <= rank && fitsCap
  }).length
  if (ahead) {
    return {
      hold: true,
      reason: `${ahead} held ${ahead === 1 ? 'job is' : 'jobs are'} ahead of it.`
    }
  }
  if (budget.usedGpus + gpus > budget.maxGpus) {
    return {
      hold: true,
      reason: `Your GPUs on this host would reach ${budget.usedGpus + gpus} of your ${budget.maxGpus}.`
    }
  }
  if (project?.maxGpus != null && project.usedGpus + gpus > project.maxGpus) {
    return {
      hold: true,
      reason: `${project.projectName} would use ${project.usedGpus + gpus} of its ${project.maxGpus} GPUs.`
    }
  }
  return { hold: false, reason: null }
}

/** Held jobs to release now, in priority order, skipping any that would break a limit. */
export function planGpuReleases(budget: ResearchGpuHostBudget): string[] {
  let used = budget.usedGpus
  const projectUsed = new Map(budget.projects.map((entry) => [entry.projectKey, entry.usedGpus]))
  const released: string[] = []
  for (const job of budget.held) {
    const project = budget.projects.find((entry) => entry.projectKey === job.projectKey)
    const projectTotal = (projectUsed.get(job.projectKey) ?? 0) + job.gpus
    if (used + job.gpus > budget.maxGpus) {
      continue
    }
    if (project?.maxGpus != null && projectTotal > project.maxGpus) {
      continue
    }
    used += job.gpus
    projectUsed.set(job.projectKey, projectTotal)
    released.push(job.jobId)
  }
  return released
}
