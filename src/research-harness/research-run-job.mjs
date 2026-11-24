import os from 'node:os'
import { HARNESS_SOURCE } from './research-run-manifest.mjs'

// Same shape as the app's SLURM_JOB_ID_PATTERN: `123`, `123_4` or `123+1`.
const SLURM_JOB_ID = /^\d+(?:_\d+)?(?:\+\d+)?$/u

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : null
}

/**
 * The SLURM job a `run exec` runs inside, from the variables SLURM sets for it, or null. Aster
 * follows the job by this ID and records how it ended; the harness only states what it saw.
 */
export function slurmJobFromEnvironment(env = process.env, observedAt = new Date().toISOString()) {
  const jobId = text(env.SLURM_JOB_ID) ?? text(env.SLURM_JOBID)
  if (!jobId || !SLURM_JOB_ID.test(jobId)) {
    return null
  }
  const cluster = text(env.SLURM_CLUSTER_NAME)
  const arrayJob = text(env.SLURM_ARRAY_JOB_ID)
  const arrayTask = text(env.SLURM_ARRAY_TASK_ID)
  return {
    scheduler: 'slurm',
    jobId,
    host: cluster ?? text(env.SLURM_SUBMIT_HOST) ?? os.hostname(),
    ...(cluster ? { cluster } : {}),
    node: text(env.SLURMD_NODENAME) ?? os.hostname(),
    ...(text(env.SLURM_SUBMIT_HOST) ? { submitHost: text(env.SLURM_SUBMIT_HOST) } : {}),
    ...(text(env.SLURM_STEP_ID) ? { stepId: text(env.SLURM_STEP_ID) } : {}),
    ...(arrayJob && arrayTask ? { arrayJobId: `${arrayJob}_${arrayTask}` } : {}),
    state: 'running',
    observedAt,
    recordedBy: HARNESS_SOURCE
  }
}
