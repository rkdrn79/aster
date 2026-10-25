import type { ResearchGpuPriority } from './research-gpu-policy'

/**
 * `researchCompute.status`: SLURM as seen from the host that runs this runtime, for an orcad on a
 * cluster login node. Bumped only on a breaking change to a result below.
 */
export const RESEARCH_COMPUTE_API_VERSION = 1

export type ResearchComputeJobState =
  | 'running'
  | 'pending'
  | 'held'
  | 'completing'
  | 'suspended'
  | 'other'

export type ResearchComputeJob = {
  id: string
  name: string
  state: ResearchComputeJobState
  /** squeue's compact state, e.g. `PD`. */
  slurmState: string
  /** Why a pending or held job waits, in SLURM's words (`Resources`, `JobHeldUser`). */
  reason: string | null
  /** Allocated while running; requested while pending. */
  gpus: number
  /** Run time so far as squeue prints it (`1-02:03:04`). */
  elapsed: string | null
  /** Actual start while running; SLURM's estimate while pending. */
  startTime: string | null
  submitTime: string | null
  timeLimit: string | null
  nodes: string | null
  partition: string
  /** From the `aster:project=` comment `aster gpu submit` writes; null for other jobs. */
  project: { key: string; name: string | null; run: string | null } | null
  /** Held by Aster's GPU budget, released when room frees up; not by SLURM or an admin. */
  heldByBudget: boolean
}

export type ResearchComputeBudget = {
  /** This host's GPU limit for the user. */
  maxGpus: number
  autoRelease: boolean
  /** Running plus pending-and-not-held GPUs; null when SLURM could not be read. */
  usedGpus: number | null
  availableGpus: number | null
  projects: {
    key: string
    name: string
    maxGpus: number | null
    priority: ResearchGpuPriority
    usedGpus: number | null
  }[]
}

/** A part of the status in the research API's `absent`/`unreadable`/`present` style. */
export type ResearchComputePart<T> =
  | { status: 'absent' }
  | { status: 'unreadable'; reason: string }
  | { status: 'present'; value: T }

export type ResearchComputeStatusResult = {
  version: typeof RESEARCH_COMPUTE_API_VERSION
  hostname: string
  user: string
  /** `absent` when this host has no `squeue`. */
  slurm: ResearchComputePart<{
    /** In squeue's order. */
    jobs: ResearchComputeJob[]
    /** Jobs past the reply cap; `usedGpus` still counts them. */
    omittedJobs: number
    /** Running plus pending-and-not-held GPUs of all the user's jobs. */
    usedGpus: number
  }>
  /** This host's entry (`targetId: "local"`) in its data root's gpu-policy.json; `absent` if unset. */
  budget: ResearchComputePart<ResearchComputeBudget>
  readAt: string
}
