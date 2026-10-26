import { z } from 'zod'
import { WorktreeSelector } from '../rpc-contract/files-target-params'
import { OptionalPositiveInt, requiredString } from '../rpc-contract/rpc-param-primitives'
import type { ResearchExperimentBrief } from './research-experiment-brief'
import type { ResearchRunExecutionState, ResearchRunManifest } from './research-run-manifest'
import type { ResearchRunMediaItem } from './research-run-media'
import type { ResearchMetricDirection } from './research-run-metrics'
import type { ResearchRunSummary } from './research-run-summary'

/**
 * `researchProject.*`: the host that owns a workspace reads its .aster/ or legacy research/ records for any client.
 * Bumped only on a breaking change to a result below; added fields keep the version.
 */
export const RESEARCH_PROJECT_API_VERSION = 1

export const RESEARCH_PROJECT_METRIC_POINTS_DEFAULT = 400
export const RESEARCH_PROJECT_METRIC_POINTS_MAX = 1000
export const RESEARCH_PROJECT_LOG_TAIL_DEFAULT_BYTES = 64 * 1024
export const RESEARCH_PROJECT_LOG_TAIL_MAX_BYTES = 256 * 1024

export const ResearchProjectReadParams = WorktreeSelector.extend({})

export const ResearchProjectLatexCompileParams = WorktreeSelector.extend({
  sourcePath: z.string().min(1).max(4096)
})

const runSelector = {
  /** The Experiment's folder slug, e.g. `lora-r16`. */
  experiment: requiredString('Missing experiment slug'),
  /** The Run ID, e.g. `seed-42`. */
  run: requiredString('Missing run id')
}

// Why no upper bound in the schema: the host clamps, so a newer client asking for more still works.
export const ResearchProjectRunReadParams = WorktreeSelector.extend({
  ...runSelector,
  maxPoints: OptionalPositiveInt
})

export const ResearchProjectRunLogTailParams = WorktreeSelector.extend({
  ...runSelector,
  maxBytes: OptionalPositiveInt
})

// Why catch: project.json is edited by the harness, agents and people; one bad entry must not
// hide the rest. Unknown keys are dropped.
const nullableText = z.string().nullable().catch(null)

const researchProjectCatalogRunSchema = z.object({
  id: z.string(),
  name: z.string().catch(''),
  manifest: nullableText,
  metrics: nullableText,
  log: nullableText,
  config: nullableText
})

const researchProjectCatalogExperimentSchema = z.object({
  slug: z.string(),
  name: z.string().catch(''),
  path: nullableText,
  runs: z.array(researchProjectCatalogRunSchema.nullable().catch(null)).catch([])
})

/** Harness catalog: legacy research/ v1 or derived .aster/ v2; malformed entries parse as null. */
export const researchProjectCatalogSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  manuscript: z.object({ source: nullableText, pdf: nullableText }).nullable().catch(null),
  references: z.object({ bibliography: nullableText, papers: nullableText }).nullable().catch(null),
  claims: nullableText,
  experiments: z.array(researchProjectCatalogExperimentSchema.nullable().catch(null))
})

export type ResearchProjectCatalogRun = z.infer<typeof researchProjectCatalogRunSchema>
export type ResearchProjectCatalogExperiment = Omit<
  z.infer<typeof researchProjectCatalogExperimentSchema>,
  'runs'
> & { runs: ResearchProjectCatalogRun[] }
/** The catalog with malformed or unsafe entries removed (see `skippedCatalogEntries`). */
export type ResearchProjectCatalog = Omit<
  z.infer<typeof researchProjectCatalogSchema>,
  'experiments'
> & { experiments: ResearchProjectCatalogExperiment[] }

/**
 * One file of the project as the host found it. A missing file is `absent`, never an error;
 * `skipped` means the read budget ran out before the file was reached.
 */
export type ResearchProjectFile<T> =
  | { status: 'absent' }
  | { status: 'skipped' }
  | { status: 'unreadable'; reason: string }
  | { status: 'present'; value: T }

export type ResearchProjectFileStatus = ResearchProjectFile<unknown>['status']

export type ResearchProjectMetricLast = {
  name: string
  split: string | null
  last: number
  lastStep: number | null
  /** From run.json's metric definitions; null when the Run does not define the metric. */
  direction: ResearchMetricDirection | null
}

export type ResearchProjectRunOverview = {
  id: string
  name: string
  /** `unknown` when run.json is absent, unreadable or records no execution. */
  state: ResearchRunExecutionState
  exitCode: number | null
  startedAt: string | null
  finishedAt: string | null
  manifest: ResearchProjectFileStatus
  metrics: ResearchProjectFile<{
    /** Up to 6 series, the metrics run.json defines first. */
    series: ResearchProjectMetricLast[]
    omittedSeries: number
    /** Only the newest part of metrics.jsonl was read. */
    partial: boolean
  }>
}

/** Where an Experiment's autonomous loop stands, from the newest entries of its loop ledger. */
export type ResearchProjectLoopSummary = {
  objective: {
    text: string
    at: string
    metric: string | null
    split: string | null
    direction: ResearchMetricDirection | null
  } | null
  /** Runs and hours since the objective, against its limits; null without an objective. */
  budget: {
    maxRuns: number | null
    runsUsed: number
    maxHours: number | null
    hoursElapsed: number
    exhausted: boolean
  } | null
  /** Hypotheses no decision has answered yet. */
  openHypotheses: number
  entries: number
  last: { kind: string; text: string; at: string } | null
  /** Set when the newest entry is a checkpoint: the loop stopped to ask the user. */
  checkpoint: { text: string; at: string } | null
  /** Only the newest part of a long ledger was read. */
  partial: boolean
}

export type ResearchProjectExperimentOverview = {
  slug: string
  name: string
  /** The `brief` of the Experiment's experiment.json, when it has one. */
  brief: ResearchExperimentBrief | null
  /** The Experiment's loop ledger; `absent` when no loop ever ran. */
  loop: ResearchProjectFile<ResearchProjectLoopSummary>
  runCount: number
  /** The last Run in catalog order, which is the order the harness created them in. */
  latestRun: ResearchProjectRunOverview | null
  /** The newest catalog Runs, in catalog order; older ones count in `runCount` only. */
  runs: ResearchProjectRunOverview[]
}

export type ResearchProjectReadResult = {
  version: typeof RESEARCH_PROJECT_API_VERSION
  /** .aster/project.json or legacy research/project.json; `absent` when neither exists. */
  catalog: ResearchProjectFile<ResearchProjectCatalog>
  /** Catalog entries dropped for a malformed shape, an unsafe slug or an unsafe Run ID. */
  skippedCatalogEntries: number
  experiments: ResearchProjectExperimentOverview[]
  /** The read budget ran out; Runs past it report `skipped`. */
  truncated: boolean
  readAt: string
}

export type ResearchProjectMetricPoint = { step: number | null; value: number }

export type ResearchProjectMetricSeries = {
  name: string
  split: string | null
  direction: ResearchMetricDirection | null
  /** Points read, before downsampling. */
  count: number
  /** At most `maxPoints`, always keeping the first and the last point read. */
  points: ResearchProjectMetricPoint[]
}

export type ResearchProjectRunMetrics = {
  /** Size of the whole metrics file. */
  bytes: number
  /** The file exceeds the read cap, so only its newest rows were read. */
  partial: boolean
  rows: number
  malformedLines: number
  series: ResearchProjectMetricSeries[]
  omittedSeries: number
}

// Why catch: `run attach-artifact` writes these; a newer harness may reshape a field.
export const researchProjectRecordedArtifactSchema = z.object({
  name: z.string(),
  /** Run-relative for copies (`artifacts/<name>`), the source path for references. */
  path: z.string(),
  mode: nullableText,
  bytes: z.number().nullable().catch(null),
  sha256: nullableText,
  attachedAt: nullableText
})
export type ResearchProjectRecordedArtifact = z.infer<typeof researchProjectRecordedArtifactSchema>

export type ResearchProjectArtifactEntry = {
  name: string
  kind: 'file' | 'directory' | 'symlink' | 'other'
  /** Files only. */
  bytes: number | null
}

export type ResearchProjectRunReadResult = {
  version: typeof RESEARCH_PROJECT_API_VERSION
  experiment: string
  run: string
  /** Null when project.json does not list the Run; its files are then read from the harness layout. */
  catalogEntry: ResearchProjectCatalogRun | null
  manifest: ResearchProjectFile<ResearchRunManifest>
  summary: ResearchProjectFile<ResearchRunSummary>
  metrics: ResearchProjectFile<ResearchProjectRunMetrics>
  artifacts: {
    /** The Run's artifacts/ folder, one level deep. */
    directory: ResearchProjectFile<{ entries: ResearchProjectArtifactEntry[]; truncated: boolean }>
    /** What run.json records as attached, including files referenced outside artifacts/. */
    recorded: ResearchProjectRecordedArtifact[]
  }
  /** media.jsonl; item paths are project-relative. */
  media: ResearchProjectFile<{
    items: ResearchRunMediaItem[]
    malformedLines: number
    truncated: boolean
  }>
  /** outputs.jsonl; `rows` counts only what was read when `truncated`. */
  outputs: ResearchProjectFile<{ bytes: number; rows: number; truncated: boolean }>
  readAt: string
}

export type ResearchProjectRunLogTailResult = {
  version: typeof RESEARCH_PROJECT_API_VERSION
  /** Project-relative path of the log that was read. */
  path: string
  status: 'present' | 'absent'
  /** The end of the log, starting at a line boundary when the log is longer. */
  text: string
  truncated: boolean
  /** Size of the whole log in bytes; 0 when absent. */
  size: number
  readAt: string
}
