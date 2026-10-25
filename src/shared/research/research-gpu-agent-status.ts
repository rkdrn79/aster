import type { ResearchGpuPriority } from './research-gpu-policy'

/** What `orca gpu status` reports per host: the user's budget and what Aster holds for it. */
export type ResearchGpuAgentServerStatus = {
  server: string
  targetId: string
  maxGpus: number
  usedGpus: number | null
  /** Budget room left now: max minus GPUs running or about to start. */
  /** Null when the queue could not be read; never imply an empty queue means full availability. */
  availableGpus: number | null
  autoRelease: boolean
  projects: {
    name: string
    usedGpus: number
    maxGpus: number | null
    priority: ResearchGpuPriority
  }[]
  heldJobs: { jobId: string; gpus: number; project: string }[]
  lastRelease: { at: string; released: string[]; message: string | null } | null
  error: string | null
}

export type ResearchGpuAgentStatus = { servers: ResearchGpuAgentServerStatus[] }
