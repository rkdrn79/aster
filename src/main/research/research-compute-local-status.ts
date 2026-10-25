import { hostname, userInfo } from 'node:os'
import { runProcess } from '@orca/process-host'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import {
  RESEARCH_COMPUTE_API_VERSION,
  type ResearchComputeBudget,
  type ResearchComputeJob,
  type ResearchComputeJobState,
  type ResearchComputePart,
  type ResearchComputeStatusResult
} from '../../shared/research/research-compute-api'
import {
  researchSlurmMyJobsArgs,
  type ResearchSlurmJob
} from '../../shared/research/research-compute-probe'
import { parseResearchSlurmJobLines } from '../../shared/research/research-compute-probe-output'
import {
  SLURM_HOLD_REASONS,
  committedGpus,
  computeResearchGpuBudget,
  isAsterHeldJob
} from '../../shared/research/research-gpu-budget'
import {
  projectKeyFromSlurmComment,
  runNameFromSlurmComment,
  type ResearchGpuPolicy
} from '../../shared/research/research-gpu-policy'
import { isENOENT } from '../ipc/filesystem-path-containment'
import { readResearchGpuPolicy } from './research-gpu-policy-repository'

const SQUEUE_TIMEOUT_MS = 15_000
const SQUEUE_MAX_OUTPUT_BYTES = 4 * 1024 * 1024
const MAX_JOBS = 500

function unreadable(error: unknown): { status: 'unreadable'; reason: string } {
  return { status: 'unreadable', reason: error instanceof Error ? error.message : String(error) }
}

function currentUser(): string {
  try {
    return userInfo().username
  } catch {
    // Why: userInfo throws for a uid with no passwd entry, as in some containers.
    return process.env.USER ?? ''
  }
}

/** The user's jobs from this host's own `squeue`; read-only, never touches a job. */
async function readLocalSlurmJobs(user: string): Promise<ResearchComputePart<ResearchSlurmJob[]>> {
  if (process.platform === 'win32') {
    return { status: 'absent' }
  }
  let result: Awaited<ReturnType<typeof runProcess>>
  try {
    result = await runProcess({
      program: 'squeue',
      args: researchSlurmMyJobsArgs(user),
      timeoutMs: SQUEUE_TIMEOUT_MS,
      maxOutputBytes: SQUEUE_MAX_OUTPUT_BYTES
    })
  } catch (error) {
    return isENOENT(error) ? { status: 'absent' } : unreadable(error)
  }
  if (result.timedOut) {
    return unreadable(`squeue did not answer within ${SQUEUE_TIMEOUT_MS / 1000}s.`)
  }
  if (result.code !== 0) {
    const said = result.stderr.trim().split(/\r?\n/).slice(-3).join(' ').slice(0, 400)
    return unreadable(said || `squeue exited ${result.code ?? result.signal}.`)
  }
  return { status: 'present', value: parseResearchSlurmJobLines(result.stdout) }
}

/** This host's own limits: a server's data root names itself `local`, as its workspaces do. */
async function readLocalPolicy(): Promise<ResearchComputePart<ResearchGpuPolicy>> {
  try {
    const policy = await readResearchGpuPolicy()
    return policy.hosts.some((host) => host.targetId === LOCAL_EXECUTION_HOST_ID)
      ? { status: 'present', value: policy }
      : { status: 'absent' }
  } catch (error) {
    return unreadable(error)
  }
}

function jobState(job: ResearchSlurmJob): ResearchComputeJobState {
  switch (job.state) {
    case 'R':
    case 'CF':
      return 'running'
    case 'CG':
      return 'completing'
    case 'S':
    case 'ST':
      return 'suspended'
    case 'PD':
      return SLURM_HOLD_REASONS.has(job.reason ?? '') ? 'held' : 'pending'
    default:
      return 'other'
  }
}

function computeJob(job: ResearchSlurmJob, projectNames: Map<string, string>): ResearchComputeJob {
  const key = projectKeyFromSlurmComment(job.comment)
  return {
    id: job.jobId,
    name: job.name,
    state: jobState(job),
    slurmState: job.state,
    reason: job.reason,
    gpus: job.gpuCount,
    elapsed: job.timeUsed,
    startTime: job.startTime,
    submitTime: job.submitTime,
    timeLimit: job.timeLimit,
    nodes: job.nodes,
    partition: job.partition,
    project: key
      ? { key, name: projectNames.get(key) ?? null, run: runNameFromSlurmComment(job.comment) }
      : null,
    heldByBudget: isAsterHeldJob(job)
  }
}

function localBudget(
  policy: ResearchGpuPolicy,
  jobs: readonly ResearchSlurmJob[] | null
): ResearchComputeBudget | null {
  const budget = computeResearchGpuBudget(policy, LOCAL_EXECUTION_HOST_ID, jobs ?? [], (job) =>
    projectKeyFromSlurmComment(job.comment)
  )
  if (!budget) {
    return null
  }
  const read = jobs !== null
  return {
    maxGpus: budget.maxGpus,
    autoRelease: budget.autoRelease,
    usedGpus: read ? budget.usedGpus : null,
    availableGpus: read ? Math.max(0, budget.maxGpus - budget.usedGpus) : null,
    projects: budget.projects.map((project) => ({
      key: project.projectKey,
      name: project.projectName,
      maxGpus: project.maxGpus,
      priority: project.priority,
      usedGpus: read ? project.usedGpus : null
    }))
  }
}

/** The user's SLURM jobs and GPU budget on the host this runtime runs on, e.g. a login node. */
export async function readResearchComputeStatus(): Promise<ResearchComputeStatusResult> {
  const user = currentUser()
  const [slurm, policy] = await Promise.all([readLocalSlurmJobs(user), readLocalPolicy()])
  const jobs = slurm.status === 'present' ? slurm.value : null
  const projectNames = new Map(
    policy.status === 'present'
      ? policy.value.projects
          .filter((project) => project.targetId === LOCAL_EXECUTION_HOST_ID)
          .map((project) => [project.projectKey, project.projectName] as const)
      : []
  )
  const budget = policy.status === 'present' ? localBudget(policy.value, jobs) : null
  return {
    version: RESEARCH_COMPUTE_API_VERSION,
    hostname: hostname(),
    user,
    slurm:
      slurm.status === 'present'
        ? {
            status: 'present',
            value: {
              jobs: slurm.value.slice(0, MAX_JOBS).map((job) => computeJob(job, projectNames)),
              omittedJobs: Math.max(0, slurm.value.length - MAX_JOBS),
              usedGpus: slurm.value.reduce((total, job) => total + committedGpus(job), 0)
            }
          }
        : slurm,
    budget:
      policy.status !== 'present'
        ? policy
        : budget
          ? { status: 'present', value: budget }
          : { status: 'absent' },
    readAt: new Date().toISOString()
  }
}
