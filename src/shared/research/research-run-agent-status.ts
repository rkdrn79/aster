import type {
  ResearchRunExecutionState,
  ResearchRunJobState,
  ResearchRunManifest
} from './research-run-manifest'
import type { ResearchMetricSeriesSummary } from './research-run-metrics'
import type { ResearchWatchEvent } from './research-run-watch'

/** One watch as `orca research watch list` and the Runs page read it. */
export type ResearchRunWatchSummary = {
  id: string
  run: string
  /** SSH target id, or null for this machine. */
  targetId: string | null
  host: string
  projectPath: string
  conditions: string[]
  notify: 'self' | 'none'
  /** The agent it wakes, e.g. `terminal term_ab12` or `chat 5f3c…`; null for none. */
  owner: string | null
  message: string | null
  state: 'active' | 'done' | 'cancelled'
  createdAt: string
  endedAt: string | null
  lastCheckedAt: string | null
  lastError: string | null
  fired: Pick<ResearchWatchEvent, 'condition' | 'implicit' | 'firedAt' | 'evidence' | 'delivery'>[]
}

/** `orca research status`: a cheap read of one Run for an agent deciding what to do next. */
export type ResearchRunAgentStatus = {
  run: {
    name: string
    host: string
    projectPath: string
    dir: string
  }
  /** As run.json records it; agent completion never sets this. */
  execution: {
    state: ResearchRunExecutionState
    observedAt: string
    exitCode: number | null
    source: string | null
  } | null
  job: {
    scheduler: 'slurm' | 'local'
    jobId: string
    state: ResearchRunJobState
    reason: string | null
    exitCode: number | null
    observedAt: string
    /** True when Aster is still polling the scheduler for this job. */
    tracked: boolean
  } | null
  launch: ResearchRunManifest['launch'] | null
  code: { commit: string | null; dirty: boolean | null; capturePhase: string } | null
  metrics: {
    /** Rows in the read window; `partial` when older rows were not read. */
    rows: number
    malformed: number
    partial: boolean
    last: { step: number | null; split: string | null; metrics: Record<string, number> } | null
    series: ResearchMetricSeriesSummary[]
  }
  log: { lines: string[]; truncated: boolean }
  watches: ResearchRunWatchSummary[]
  warnings: string[]
}

export type ResearchRunWatchCreated = {
  watch: ResearchRunWatchSummary
  warnings: string[]
}
