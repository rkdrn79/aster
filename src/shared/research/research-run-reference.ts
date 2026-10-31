import {
  RESEARCH_RUN_EXECUTION_STATES,
  type ResearchRunExecutionState,
  type ResearchRunJob
} from './research-run-manifest'

/** Same rules as the research harness, so a Run it created always resolves here. */
const EXPERIMENT_SLUG_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}-]{0,63}$/u
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

export type ResearchRunName = { experiment: string; runId: string }

/** Whether the harness accepts `value` as a slug; only such a slug may go into an agent's commands. */
export function isResearchExperimentSlug(value: string): boolean {
  return EXPERIMENT_SLUG_PATTERN.test(value)
}

/** `<experiment-slug>/<run-id>` exactly, or null unless the harness would accept both parts. */
export function readResearchRunName(value: string): ResearchRunName | null {
  const parts = value.split('/')
  const [experiment, runId] = parts
  return parts.length === 2 &&
    experiment !== undefined &&
    runId !== undefined &&
    isResearchExperimentSlug(experiment) &&
    RUN_ID_PATTERN.test(runId)
    ? { experiment, runId }
    : null
}

/** `<experiment-slug>/<run-id>` as agents write it on the command line. */
export function parseResearchRunName(value: string): ResearchRunName {
  const name = readResearchRunName(value.trim())
  if (!name) {
    throw new Error(
      `Use --run <experiment-slug>/<run-id>, e.g. lora-r16/seed-42 (got "${value}"). The slug and ID are the folder names under .aster/experiments/ (research/experiments/ in older projects).`
    )
  }
  return name
}

export function formatResearchRunName(run: ResearchRunName): string {
  return `${run.experiment}/${run.runId}`
}

/** Record trees a project keeps its Runs in, newest layout first (ADR-004). */
export const RESEARCH_RECORD_ROOTS = ['.aster', 'research'] as const
export type ResearchRecordRoot = (typeof RESEARCH_RECORD_ROOTS)[number]

/** A Run folder on a host: `local`, or an SSH target id. Paths use that host's own syntax. */
export type ResearchRunLocation = ResearchRunName & {
  targetId: string | null
  projectPath: string
  /** The project's record tree when known; readers find it from the project's catalog otherwise. */
  recordRoot?: ResearchRecordRoot
}

export function researchRunLocationKey(location: ResearchRunLocation): string {
  return JSON.stringify([
    location.targetId,
    location.projectPath,
    location.experiment,
    location.runId
  ])
}

export const RESEARCH_RUN_FILE_NAMES = {
  manifest: 'run.json',
  metrics: 'metrics.jsonl',
  log: 'train.log'
} as const

export function researchRunRelativeSegments(
  run: ResearchRunName,
  recordRoot: ResearchRecordRoot
): string[] {
  return [recordRoot, 'experiments', run.experiment, 'runs', run.runId]
}

/**
 * POSIX paths for a Run on a remote host; SLURM hosts are Linux. Without a known record tree this
 * assumes `.aster/`; remote readers find the actual tree in the same ssh command.
 */
export function researchRunPosixPaths(
  location: ResearchRunLocation,
  recordRoot: ResearchRecordRoot = location.recordRoot ?? RESEARCH_RECORD_ROOTS[0]
): {
  dir: string
  manifest: string
  metrics: string
  log: string
} {
  const dir = [
    location.projectPath.replace(/\/+$/, ''),
    ...researchRunRelativeSegments(location, recordRoot)
  ].join('/')
  return {
    dir,
    manifest: `${dir}/${RESEARCH_RUN_FILE_NAMES.manifest}`,
    metrics: `${dir}/${RESEARCH_RUN_FILE_NAMES.metrics}`,
    log: `${dir}/${RESEARCH_RUN_FILE_NAMES.log}`
  }
}

export const ASTER_SLURM_EXECUTION_SOURCE = 'aster-slurm'

type ExecutionRecord = {
  state: ResearchRunExecutionState
  reportedBy: 'manifest'
  observedAt: string
  exitCode: number | null
  source: string
  evidence: 'scheduler'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function currentExecution(
  manifest: Record<string, unknown>
): { state: ResearchRunExecutionState; source: string | null } | null {
  const execution = manifest.execution
  if (!isRecord(execution)) {
    return null
  }
  const state = RESEARCH_RUN_EXECUTION_STATES.find((entry) => entry === execution.state)
  if (!state) {
    return null
  }
  return { state, source: typeof execution.source === 'string' ? execution.source : null }
}

const TERMINAL_EXECUTION = new Set<ResearchRunExecutionState>(['succeeded', 'failed', 'cancelled'])

/**
 * Whether a scheduler observation may replace the manifest's execution. A launcher that saw the
 * process exit outranks the scheduler; the scheduler may still end a Run nothing else ended.
 */
export function schedulerMayReplaceExecution(
  manifest: Record<string, unknown>,
  next: ResearchRunExecutionState
): boolean {
  const current = currentExecution(manifest)
  if (!current) {
    return true
  }
  if (next === 'unknown') {
    return false
  }
  if (TERMINAL_EXECUTION.has(current.state)) {
    return current.source === ASTER_SLURM_EXECUTION_SOURCE && TERMINAL_EXECUTION.has(next)
  }
  return current.state !== next || current.source === ASTER_SLURM_EXECUTION_SOURCE
}

/**
 * run.json with `job` and, when allowed, `execution` from the scheduler. Every other field is kept
 * as written, including ones this build does not know.
 */
export function applyResearchJobToManifest(
  manifest: Record<string, unknown>,
  job: ResearchRunJob,
  execution: ResearchRunExecutionState
): { manifest: Record<string, unknown>; executionWritten: boolean } {
  const next: Record<string, unknown> = { ...manifest, job }
  if (!schedulerMayReplaceExecution(manifest, execution)) {
    return { manifest: next, executionWritten: false }
  }
  const record: ExecutionRecord = {
    state: execution,
    reportedBy: 'manifest',
    observedAt: job.observedAt,
    exitCode: TERMINAL_EXECUTION.has(execution) ? (job.exitCode ?? null) : null,
    source: ASTER_SLURM_EXECUTION_SOURCE,
    evidence: 'scheduler'
  }
  next.execution = record
  return { manifest: next, executionWritten: true }
}

export function parseManifestObject(content: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(content)
  if (!isRecord(parsed) || parsed.schemaVersion !== 1) {
    throw new Error('run.json is not a version 1 Run manifest.')
  }
  return parsed
}
