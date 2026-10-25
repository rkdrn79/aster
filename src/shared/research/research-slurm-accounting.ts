import { quotePosixShell } from '../shell-argument-quoting'
import type { ResearchRunExecutionState, ResearchRunJobState } from './research-run-manifest'
import { SLURM_JOB_ID_PATTERN } from './research-slurm-actions'

/** One job as SLURM accounting (or, without accounting, the queue) last reported it. */
export type ResearchSlurmJobObservation = {
  jobId: string
  state: ResearchRunJobState
  /** SLURM's own word, e.g. `CANCELLED by 1234` or `OUT_OF_MEMORY`. */
  rawState: string
  exitCode: number | null
  signal: number | null
  startedAt: string | null
  endedAt: string | null
  /** Why a pending job waits, or what ended it, in SLURM's words. */
  reason: string | null
  source: 'sacct' | 'squeue'
}

const SACCT_FIELDS = ['JobID', 'State', 'ExitCode', 'Start', 'End', 'Elapsed'] as const
const QUEUE_MARK = '@@aster-squeue'
const NO_VALUE = new Set(['', 'Unknown', 'None', 'N/A', '(null)'])

/**
 * One read for many jobs: accounting first, then the live queue for hosts without accounting.
 * Both tolerate failure so the other's lines still arrive.
 */
export function buildSlurmJobTrackingCommand(jobIds: readonly string[]): string {
  const ids = quotePosixShell(
    [...new Set(jobIds.filter((jobId) => SLURM_JOB_ID_PATTERN.test(jobId)))].join(',')
  )
  return [
    `sacct -n -P -j ${ids} -o ${SACCT_FIELDS.join(',')} 2>&1 || true`,
    `printf '%s\\n' '${QUEUE_MARK}'`,
    `squeue -h -j ${ids} -o '%i|%T|%r' 2>/dev/null || true`
  ].join('; ')
}

const STATE_MAP: Record<string, ResearchRunJobState> = {
  PENDING: 'pending',
  CONFIGURING: 'pending',
  REQUEUED: 'pending',
  REQUEUE_HOLD: 'pending',
  REQUEUE_FED: 'pending',
  RESV_DEL_HOLD: 'pending',
  RUNNING: 'running',
  COMPLETING: 'running',
  RESIZING: 'running',
  SUSPENDED: 'running',
  STAGE_OUT: 'running',
  SIGNALING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  BOOT_FAIL: 'failed',
  DEADLINE: 'failed',
  SPECIAL_EXIT: 'failed',
  REVOKED: 'cancelled',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout',
  OUT_OF_MEMORY: 'out_of_memory',
  NODE_FAIL: 'node_fail',
  PREEMPTED: 'preempted'
}

export function researchJobStateFromSlurm(raw: string): ResearchRunJobState {
  const word = raw.trim().split(/\s+/)[0]?.replace(/\+$/, '').toUpperCase() ?? ''
  return STATE_MAP[word] ?? 'unknown'
}

export function isTerminalResearchJobState(state: ResearchRunJobState): boolean {
  return !['pending', 'running', 'unknown'].includes(state)
}

/** What a job state says about the Run it carries; queued work has not started executing. */
export function researchExecutionFromJob(
  state: ResearchRunJobState,
  exitCode: number | null
): ResearchRunExecutionState {
  switch (state) {
    case 'running':
      return 'running'
    case 'completed':
      return exitCode === null || exitCode === 0 ? 'succeeded' : 'failed'
    case 'cancelled':
      return 'cancelled'
    case 'failed':
    case 'timeout':
    case 'out_of_memory':
    case 'node_fail':
      return 'failed'
    default:
      return 'unknown'
  }
}

function value(raw: string | undefined): string | null {
  const trimmed = raw?.trim() ?? ''
  return NO_VALUE.has(trimmed) ? null : trimmed
}

function parseExitCode(raw: string | undefined): {
  exitCode: number | null
  signal: number | null
} {
  const match = /^(\d+):(\d+)$/.exec(raw?.trim() ?? '')
  return match
    ? { exitCode: Number(match[1]), signal: Number(match[2]) }
    : { exitCode: null, signal: null }
}

function reasonFor(state: ResearchRunJobState, rawState: string): string | null {
  const by = /^CANCELLED by (\S+)/i.exec(rawState)
  if (by) {
    return `cancelled by uid ${by[1]}`
  }
  switch (state) {
    case 'timeout':
      return 'hit its time limit'
    case 'out_of_memory':
      return 'ran out of memory'
    case 'node_fail':
      return 'a node failed'
    case 'preempted':
      return 'preempted'
    default:
      return null
  }
}

// Why steps matter: the allocation line can say FAILED while its `.batch` step says OUT_OF_MEMORY.
const STEP_PRECEDENCE: ResearchRunJobState[] = ['out_of_memory', 'node_fail', 'timeout']

function parseSacctSection(lines: readonly string[]): Map<string, ResearchSlurmJobObservation> {
  const jobs = new Map<string, ResearchSlurmJobObservation>()
  const stepStates = new Map<string, ResearchRunJobState[]>()
  for (const line of lines) {
    const fields = line.split('|')
    if (fields.length < SACCT_FIELDS.length) {
      continue
    }
    const [jobField, rawState, exit, start, end] = fields
    const [jobId, step] = jobField.trim().split('.', 2)
    if (!SLURM_JOB_ID_PATTERN.test(jobId)) {
      continue
    }
    const state = researchJobStateFromSlurm(rawState)
    if (step !== undefined) {
      stepStates.set(jobId, [...(stepStates.get(jobId) ?? []), state])
      continue
    }
    const { exitCode, signal } = parseExitCode(exit)
    jobs.set(jobId, {
      jobId,
      state,
      rawState: rawState.trim(),
      exitCode,
      signal,
      startedAt: value(start),
      endedAt: value(end),
      reason: reasonFor(state, rawState.trim()),
      source: 'sacct'
    })
  }
  for (const [jobId, states] of stepStates) {
    const job = jobs.get(jobId)
    const worse = STEP_PRECEDENCE.find((state) => states.includes(state))
    if (job && worse && (job.state === 'failed' || job.state === 'completed')) {
      jobs.set(jobId, { ...job, state: worse, reason: reasonFor(worse, job.rawState) })
    }
  }
  return jobs
}

function parseQueueSection(lines: readonly string[]): Map<string, ResearchSlurmJobObservation> {
  const jobs = new Map<string, ResearchSlurmJobObservation>()
  for (const line of lines) {
    const [jobField, rawState, reason] = line.split('|')
    const jobId = jobField?.trim() ?? ''
    if (!SLURM_JOB_ID_PATTERN.test(jobId) || rawState === undefined) {
      continue
    }
    const state = researchJobStateFromSlurm(rawState)
    jobs.set(jobId, {
      jobId,
      state,
      rawState: rawState.trim(),
      exitCode: null,
      signal: null,
      startedAt: null,
      endedAt: null,
      reason: state === 'pending' ? value(reason) : null,
      source: 'squeue'
    })
  }
  return jobs
}

export type ResearchSlurmTrackingRead = {
  jobs: Map<string, ResearchSlurmJobObservation>
  /** False when sacct is missing or accounting is disabled; finished jobs then read as unknown. */
  accounting: boolean
}

export function parseSlurmJobTrackingOutput(stdout: string): ResearchSlurmTrackingRead {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim())
  const mark = lines.findIndex((line) => line.trim() === QUEUE_MARK)
  const sacctLines = mark === -1 ? lines : lines.slice(0, mark)
  const queueLines = mark === -1 ? [] : lines.slice(mark + 1)
  const accounting = !sacctLines.some((line) =>
    /sacct: error|command not found|accounting storage is disabled/i.test(line)
  )
  const jobs = parseQueueSection(queueLines)
  // Accounting wins: the queue drops a job the moment it ends, sacct keeps how it ended.
  for (const [jobId, job] of parseSacctSection(sacctLines)) {
    jobs.set(jobId, job)
  }
  return { jobs, accounting }
}
