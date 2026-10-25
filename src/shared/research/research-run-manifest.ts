import { z } from 'zod'

const optionalText = z.string().trim().min(1).nullable().optional()
const optionalTime = z.iso.datetime({ offset: true }).nullable().optional()

export const RESEARCH_RUN_EXECUTION_STATES = [
  'unknown',
  'running',
  'succeeded',
  'failed',
  'cancelled'
] as const
export type ResearchRunExecutionState = (typeof RESEARCH_RUN_EXECUTION_STATES)[number]

/** A scheduler job's state as Aster last observed it; not the Run's own outcome. */
export const RESEARCH_RUN_JOB_STATES = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
  'timeout',
  'out_of_memory',
  'node_fail',
  'preempted',
  'unknown'
] as const
export type ResearchRunJobState = (typeof RESEARCH_RUN_JOB_STATES)[number]

export const researchRunJobSchema = z.object({
  scheduler: z.enum(['slurm', 'local']),
  jobId: z.string().trim().min(1).max(128),
  host: z.string().trim().min(1).max(512),
  submittedAt: z.iso.datetime({ offset: true }),
  state: z.enum(RESEARCH_RUN_JOB_STATES),
  observedAt: z.iso.datetime({ offset: true }),
  reason: z.string().max(500).nullable().optional(),
  exitCode: z.number().int().nullable().optional()
})
export type ResearchRunJob = z.infer<typeof researchRunJobSchema>

// Why catch: these blocks are written by newer launchers; a malformed one must not hide the Run.
export const researchRunManifestSchema = z.object({
  schemaVersion: z.literal(1),
  externalRunId: optionalText,
  name: optionalText,
  execution: z
    .object({
      state: z.enum(RESEARCH_RUN_EXECUTION_STATES),
      reportedBy: z.literal('manifest'),
      observedAt: z.iso.datetime({ offset: true }),
      exitCode: z.number().int().nullable().optional(),
      /** Which Aster component wrote the state, e.g. `aster-harness` or `aster-slurm`. */
      source: z.string().trim().min(1).max(64).optional().catch(undefined),
      /** How the state was learned: `process-exit`, `reported` or `scheduler`. */
      evidence: z.string().trim().min(1).max(64).optional().catch(undefined)
    })
    .optional(),
  command: optionalText,
  code: z
    .object({
      commit: optionalText,
      dirty: z.boolean().nullable().optional(),
      capturedAt: optionalTime,
      capturePhase: z.enum(['at_launch', 'at_attach', 'imported', 'unknown']),
      capturedBy: optionalText.catch(undefined),
      patch: z.string().nullable().optional().catch(undefined),
      patchSha256: optionalText.catch(undefined),
      patchTruncated: z.boolean().optional().catch(undefined)
    })
    .optional(),
  launch: z
    .object({
      startedAt: optionalTime,
      finishedAt: optionalTime,
      durationMs: z.number().nonnegative().nullable().optional(),
      host: optionalText,
      platform: optionalText,
      pid: z.number().int().nullable().optional(),
      harnessPid: z.number().int().nullable().optional(),
      signal: optionalText,
      argv: z.array(z.string()).max(1000).nullable().optional(),
      cwd: optionalText,
      by: optionalText
    })
    .optional()
    .catch(undefined),
  agent: z
    .object({
      provider: optionalText,
      sessionId: optionalText,
      providerSessionId: optionalText,
      terminalHandle: optionalText,
      paneKey: optionalText
    })
    .optional()
    .catch(undefined),
  job: researchRunJobSchema.optional().catch(undefined),
  metrics: z
    .object({
      path: optionalText,
      definitions: z
        .record(
          z.string(),
          z.object({
            unit: optionalText,
            direction: z.enum(['minimize', 'maximize']).nullable().optional(),
            aggregation: optionalText
          })
        )
        .optional()
    })
    .optional(),
  evaluation: z
    .object({
      datasetId: optionalText,
      datasetRevision: optionalText,
      split: optionalText,
      evaluatorRevision: optionalText
    })
    .optional()
})

export type ResearchRunManifest = z.infer<typeof researchRunManifestSchema>

export function parseResearchRunManifest(content: string): ResearchRunManifest {
  const parsed: unknown = JSON.parse(content)
  return researchRunManifestSchema.parse(parsed)
}

export function manifestSourceMismatch(
  manifest: ResearchRunManifest | null,
  sourceRunId: string | null
): string | null {
  if (manifest?.externalRunId && sourceRunId && manifest.externalRunId !== sourceRunId) {
    return `run.json is for run ${manifest.externalRunId}, but the metrics file is from run ${sourceRunId}.`
  }
  return null
}

export type ComparisonCondition = 'recorded-match' | 'unknown' | 'different'

export function compareRecordedConditions(
  manifests: (ResearchRunManifest | null)[],
  metric: string
): { condition: ComparisonCondition; reasons: string[] } {
  const fields = [
    [
      'metric unit',
      (manifest: ResearchRunManifest) => manifest.metrics?.definitions?.[metric]?.unit
    ],
    [
      'metric aggregation',
      (manifest: ResearchRunManifest) => manifest.metrics?.definitions?.[metric]?.aggregation
    ],
    [
      'metric direction',
      (manifest: ResearchRunManifest) => manifest.metrics?.definitions?.[metric]?.direction
    ],
    ['dataset', (manifest: ResearchRunManifest) => manifest.evaluation?.datasetId],
    ['dataset version', (manifest: ResearchRunManifest) => manifest.evaluation?.datasetRevision],
    ['split', (manifest: ResearchRunManifest) => manifest.evaluation?.split],
    ['evaluator version', (manifest: ResearchRunManifest) => manifest.evaluation?.evaluatorRevision]
  ] as const
  const differences: string[] = []
  const missing: string[] = []
  for (const [name, pick] of fields) {
    const values = manifests.map((manifest) => (manifest ? pick(manifest) : null))
    const present = values.filter((value): value is string => Boolean(value))
    if (new Set(present).size > 1) {
      differences.push(name)
    } else if (present.length !== manifests.length) {
      missing.push(name)
    }
  }
  if (differences.length) {
    return { condition: 'different', reasons: differences }
  }
  if (missing.length || manifests.length < 2) {
    return { condition: 'unknown', reasons: missing }
  }
  return { condition: 'recorded-match', reasons: [] }
}

/** The code a Run launched with, per its manifest; `unknown` unless captured at launch. */
export function launchCodeEvidence(manifest: ResearchRunManifest | null): string {
  const code = manifest?.code
  if (code?.capturePhase !== 'at_launch' || !code.commit) {
    return 'unknown'
  }
  const commit = /^[0-9a-f]{12,}$/i.test(code.commit) ? code.commit.slice(0, 7) : code.commit
  if (!code.dirty) {
    return commit
  }
  return `${commit} + uncommitted changes${code.patch ? '' : ' (not saved)'}`
}
