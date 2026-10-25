import { buildResearchSlurmMyJobsCommand } from '../../shared/research/research-compute-probe'
import { parseResearchSlurmJobLines } from '../../shared/research/research-compute-probe-output'
import {
  computeResearchGpuBudget,
  decideGpuSubmission,
  isAsterHeldJob,
  planGpuReleases,
  projectKeyForSlurmJob,
  type ResearchGpuHostBudget,
  type ResearchGpuProjectFolder
} from '../../shared/research/research-gpu-budget'
import { asterSlurmJobComment } from '../../shared/research/research-gpu-policy'
import {
  buildSlurmReleaseCommand,
  buildSlurmSubmitCommand,
  parseSlurmSubmitOutput,
  type ResearchSlurmActionResult,
  type ResearchSlurmSubmitParams
} from '../../shared/research/research-slurm-actions'
import { knownSshHostPlatform } from '../ssh/ssh-host-platform-memo'
import { readResearchComputeLinks } from './research-compute-links-repository'
import { runResearchComputeCommand } from './research-compute-transport'
import { readResearchGpuPolicy } from './research-gpu-policy-repository'
import { trackLinkedResearchSlurmJobs } from './research-slurm-run-links'

const SCHEDULER_TIMEOUT_MS = 30_000
const DISPATCH_INTERVAL_MS = 60_000

type HostFolders = { folders: ResearchGpuProjectFolder[]; resolvedPaths: Record<string, string> }

const foldersByHost = new Map<string, HostFolders>()

/** The Compute page's project folders for a host, from its latest read of that host. */
export function rememberResearchGpuProjectFolders(targetId: string, folders: HostFolders): void {
  foldersByHost.set(targetId, folders)
}

async function hostFolders(targetId: string): Promise<HostFolders> {
  const remembered = foldersByHost.get(targetId)
  if (remembered) {
    return remembered
  }
  // Before the page has read this host, linked folders still say which project a job is in.
  const links = await readResearchComputeLinks().catch(() => null)
  return {
    folders: (links?.links ?? []).flatMap((link) =>
      link.targetId === targetId && link.projectId
        ? [{ path: link.remotePath, projectKey: `project:${link.projectId}` }]
        : []
    ),
    resolvedPaths: {}
  }
}

// Why per host: a submit and a release must not both read the same free room and both take it.
const hostLocks = new Map<string, Promise<unknown>>()

function withHostLock<T>(targetId: string, work: () => Promise<T>): Promise<T> {
  const next = (hostLocks.get(targetId) ?? Promise.resolve()).then(work, work)
  hostLocks.set(
    targetId,
    next.catch(() => undefined)
  )
  return next
}

type BudgetRead =
  | { status: 'ok'; budget: ResearchGpuHostBudget | null }
  | { status: 'error'; message: string }

/** Null budget when the user set no GPU limit for the host; then nothing is read. */
export async function readResearchGpuHostBudget(
  targetId: string,
  dial: boolean
): Promise<BudgetRead> {
  const policy = await readResearchGpuPolicy()
  if (!policy.hosts.some((host) => host.targetId === targetId)) {
    return { status: 'ok', budget: null }
  }
  if (knownSshHostPlatform(targetId)?.os === 'win32') {
    return { status: 'error', message: 'GPU budgets need a Linux SLURM host.' }
  }
  const result = await runResearchComputeCommand(
    targetId,
    dial,
    buildResearchSlurmMyJobsCommand(),
    SCHEDULER_TIMEOUT_MS
  )
  if (result.status !== 'ok') {
    return {
      status: 'error',
      message: result.status === 'error' ? result.message : 'This host is not connected.'
    }
  }
  const jobs = parseResearchSlurmJobLines(result.stdout)
  const { folders, resolvedPaths } = await hostFolders(targetId)
  return {
    status: 'ok',
    budget: computeResearchGpuBudget(policy, targetId, jobs, (job) =>
      projectKeyForSlurmJob(job, folders, resolvedPaths)
    )
  }
}

function failed(message: string): ResearchSlurmActionResult {
  return { ok: false, jobId: null, estimate: null, held: false, message }
}

/** A Run the job writes into: its train.log takes the job's output; its name tags the job. */
export type ResearchSlurmRunOutput = { outputPath: string; runName: string }

/** sbatch within the user's GPU limits: a job that would exceed them is queued held instead. */
export function submitResearchSlurmJobWithBudget(
  { targetId, request, testOnly, projectKey, dial = false }: ResearchSlurmSubmitParams,
  runOutput?: ResearchSlurmRunOutput
): Promise<ResearchSlurmActionResult> {
  return withHostLock(targetId, async () => {
    const read = await readResearchGpuHostBudget(targetId, dial)
    if (read.status === 'error') {
      return failed(`The GPU budget could not be checked: ${read.message}`)
    }
    if (read.budget && request.gpus === undefined) {
      return failed('Set the GPU count: this host has GPU limits, and #SBATCH lines are not read.')
    }
    const decision = decideGpuSubmission(read.budget, projectKey ?? null, request.gpus ?? 0)
    const command = buildSlurmSubmitCommand(request, testOnly, {
      comment: projectKey ? asterSlurmJobComment(projectKey, runOutput?.runName) : undefined,
      hold: decision.hold && !testOnly,
      outputPath: runOutput?.outputPath
    })
    const result = await runResearchComputeCommand(targetId, dial, command, SCHEDULER_TIMEOUT_MS)
    if (result.status !== 'ok') {
      return failed(result.status === 'error' ? result.message : 'This host is not connected.')
    }
    const parsed = parseSlurmSubmitOutput(result.stdout, testOnly)
    if (!decision.hold || !parsed.ok) {
      return parsed
    }
    return testOnly
      ? {
          ...parsed,
          message: `${parsed.message} Under your GPU limits it would wait held: ${decision.reason}`
        }
      : {
          ...parsed,
          held: true,
          message: `Job ${parsed.jobId} is held: ${decision.reason} Aster releases it when GPUs free up.`
        }
  })
}

export type ResearchGpuDispatch = { at: string; released: string[]; message: string | null }

const lastDispatchByHost = new Map<string, ResearchGpuDispatch>()

export function lastResearchGpuDispatch(targetId: string): ResearchGpuDispatch | null {
  return lastDispatchByHost.get(targetId) ?? null
}

/** Releases the held jobs that now fit, highest priority and oldest first. */
export function dispatchHeldResearchGpuJobs(targetId: string): Promise<string[]> {
  return withHostLock(targetId, async () => {
    const at = new Date().toISOString()
    // Why dial: setting a GPU limit for a host is the user's consent to read it for the budget.
    const read = await readResearchGpuHostBudget(targetId, true)
    if (read.status === 'error') {
      lastDispatchByHost.set(targetId, { at, released: [], message: read.message })
      return []
    }
    const released = read.budget?.autoRelease ? planGpuReleases(read.budget) : []
    if (!released.length) {
      return []
    }
    const result = await runResearchComputeCommand(
      targetId,
      true,
      buildSlurmReleaseCommand(released),
      SCHEDULER_TIMEOUT_MS
    )
    const ok = result.status === 'ok' && !/error/i.test(result.stdout)
    lastDispatchByHost.set(targetId, {
      at,
      released: ok ? released : [],
      message: ok ? null : result.status === 'ok' ? result.stdout.trim() : 'Release failed.'
    })
    return ok ? released : []
  })
}

/** With a host's limits removed nothing would release its held jobs, so release them all now. */
export function releaseAllHeldResearchGpuJobs(targetId: string): Promise<string[]> {
  return withHostLock(targetId, async () => {
    const result = await runResearchComputeCommand(
      targetId,
      true,
      buildResearchSlurmMyJobsCommand(),
      SCHEDULER_TIMEOUT_MS
    )
    if (result.status !== 'ok') {
      return []
    }
    const held = parseResearchSlurmJobLines(result.stdout)
      .filter(isAsterHeldJob)
      .map((job) => job.jobId)
    if (held.length) {
      await runResearchComputeCommand(
        targetId,
        true,
        buildSlurmReleaseCommand(held),
        SCHEDULER_TIMEOUT_MS
      )
    }
    return held
  })
}

let dispatching = false

export async function dispatchAllHeldResearchGpuJobs(): Promise<void> {
  if (dispatching) {
    return
  }
  dispatching = true
  try {
    const policy = await readResearchGpuPolicy()
    for (const host of policy.hosts.filter((entry) => entry.autoRelease)) {
      await dispatchHeldResearchGpuJobs(host.targetId).catch((error: unknown) => {
        console.warn('[research-gpu] release pass failed', host.targetId, error)
      })
    }
  } catch (error) {
    console.warn('[research-gpu] GPU limits could not be read', error)
  } finally {
    dispatching = false
  }
}

let dispatchTimer: ReturnType<typeof setInterval> | null = null

/** Runs while Aster runs; held jobs simply keep waiting in the SLURM queue while it is closed. */
export function startResearchGpuDispatcher(): void {
  if (dispatchTimer) {
    return
  }
  dispatchTimer = setInterval(() => {
    void dispatchAllHeldResearchGpuJobs()
    void trackLinkedResearchSlurmJobs()
  }, DISPATCH_INTERVAL_MS)
  dispatchTimer.unref?.()
  // Jobs linked before a restart finished while Aster was closed; read them once now.
  void trackLinkedResearchSlurmJobs()
}
