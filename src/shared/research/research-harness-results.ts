import { z } from 'zod'
import { RESEARCH_RUN_EXECUTION_STATES } from './research-run-manifest'

// Why catch: these mirror the research harness's JSON results; a newer harness must not break the UI.
const nullableText = z.string().nullable().catch(null)
const nullableNumber = z.number().nullable().catch(null)

export const RESEARCH_CLAIM_STATUSES = [
  'verified',
  'mismatch',
  'missing-evidence',
  'stale'
] as const
export type ResearchClaimStatus = (typeof RESEARCH_CLAIM_STATUSES)[number]

export const researchHarnessRunStatusSchema = z.object({
  experiment: z.string(),
  id: z.string(),
  name: nullableText,
  state: z.enum(RESEARCH_RUN_EXECUTION_STATES).catch('unknown'),
  exitCode: nullableNumber,
  startedAt: nullableText,
  durationMs: nullableNumber,
  liveness: z.enum(['alive', 'exited', 'unknown']).nullable().catch(null)
})
export type ResearchHarnessRunStatus = z.infer<typeof researchHarnessRunStatusSchema>

export const researchHarnessRunListSchema = z.object({
  runs: z.array(researchHarnessRunStatusSchema)
})

const claimEvidenceSchema = z.object({
  run: z.string(),
  metric: z.string(),
  split: nullableText,
  role: z.enum(['stated', 'supporting']).catch('stated'),
  status: z.enum(RESEARCH_CLAIM_STATUSES).catch('missing-evidence'),
  recordedValue: nullableNumber,
  currentValue: nullableNumber,
  formatted: nullableText,
  /** `fixed:N` or `percent:N`, the rendering the paper uses. */
  format: nullableText.optional(),
  reason: nullableText.optional()
})

const claimAuditSchema = z.object({
  id: z.string(),
  text: z.string(),
  status: z.enum(RESEARCH_CLAIM_STATUSES).catch('missing-evidence'),
  reasons: z.array(z.string()).catch([]),
  evidence: z.array(claimEvidenceSchema).catch([]),
  manuscript: z
    .object({
      file: nullableText,
      values: z
        .array(z.object({ found: z.boolean(), line: nullableNumber }))
        .optional()
        .catch(undefined)
    })
    .nullable()
    .catch(null)
})

export const researchClaimsAuditSchema = z.object({
  exists: z.boolean(),
  summary: z.object({
    total: z.number(),
    verified: z.number(),
    mismatch: z.number(),
    missingEvidence: z.number(),
    stale: z.number()
  }),
  claims: z.array(claimAuditSchema)
})

export type ResearchClaimLocation = { file: string; line: number | null }
export type ResearchClaimAudit = z.infer<typeof claimAuditSchema> & {
  /** Where the claim sits in the manuscript, project-relative. */
  location: ResearchClaimLocation | null
}
export type ResearchClaimsAuditResult = Omit<
  z.infer<typeof researchClaimsAuditSchema>,
  'claims'
> & {
  claims: ResearchClaimAudit[]
}

export const researchClaimsLedgerLocationsSchema = z.object({
  claims: z.array(
    z.object({
      id: z.string(),
      manuscript: z
        .object({ file: nullableText, line: nullableNumber, anchor: nullableText })
        .nullable()
        .catch(null)
    })
  )
})

export const researchUnbackedNumbersSchema = z.object({
  files: z.array(z.string()).catch([]),
  numbers: z.number().catch(0),
  backed: z.number().catch(0),
  unbacked: z.array(
    z.object({
      file: z.string(),
      line: z.number(),
      text: z.string(),
      context: z.string().catch('')
    })
  )
})
export type ResearchUnbackedNumbers = z.infer<typeof researchUnbackedNumbersSchema>

const loopEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  kind: z.string(),
  text: z.string(),
  hypothesis: nullableText,
  run: nullableText
})
export type ResearchLoopEntry = z.infer<typeof loopEntrySchema>

export const researchLoopObjectiveDataSchema = z.object({
  metric: z.string().optional().catch(undefined),
  split: z.string().optional().catch(undefined),
  direction: z.enum(['minimize', 'maximize']).optional().catch(undefined),
  maxRuns: z.number().optional().catch(undefined),
  maxHours: z.number().optional().catch(undefined),
  maxParallel: z.number().optional().catch(undefined)
})
export type ResearchLoopObjectiveData = z.infer<typeof researchLoopObjectiveDataSchema>

export const researchLoopLedgerSchema = z.object({
  experiment: z.string(),
  objective: loopEntrySchema
    .extend({ data: researchLoopObjectiveDataSchema.nullable().catch(null) })
    .nullable()
    .catch(null),
  budget: z
    .object({
      maxRuns: nullableNumber,
      runsUsed: z.number(),
      maxHours: nullableNumber,
      hoursElapsed: z.number(),
      exhausted: z.boolean()
    })
    .nullable()
    .catch(null),
  counts: z.record(z.string(), z.number()).catch({}),
  openHypotheses: z.array(z.object({ id: z.string(), text: z.string() })).catch([]),
  entries: z.array(loopEntrySchema).catch([])
})
export type ResearchLoopLedger = z.infer<typeof researchLoopLedgerSchema>

export const researchProjectContextSchema = z.object({
  experiments: z.array(
    z.object({
      slug: z.string(),
      name: z.string().catch(''),
      runs: z
        .array(
          z.object({
            metrics: z
              .array(
                z.object({
                  name: z.string(),
                  split: nullableText,
                  direction: z.enum(['minimize', 'maximize']).nullable().catch(null)
                })
              )
              .catch([])
          })
        )
        .catch([])
    })
  )
})
export type ResearchProjectContext = z.infer<typeof researchProjectContextSchema>

export type ResearchHarnessLocation = {
  /** The harness folder agents run `node <directory>/cli.mjs` from. */
  directory: string
  cli: string
  loopSkill: string
  trackSkill: string
  verifySkill: string
}

export type ResearchRunPatch = { content: string; truncated: boolean; bytes: number }

export const researchVerificationSummarySchema = z.object({
  checkedAt: z.string(),
  experiment: z.string().nullable(),
  verdict: z.enum(['blocked', 'insufficient_evidence', 'needs_review', 'checks_clear']),
  runCount: z.number().int().nonnegative(),
  validation: z.object({
    issueCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    issues: z.array(z.string()),
    warnings: z.array(z.string())
  }),
  briefGaps: z.array(z.object({ experiment: z.string(), missing: z.array(z.string()) })),
  unfinished: z.object({
    count: z.number().int().nonnegative(),
    runs: z.array(z.object({ run: z.string(), state: z.string() }))
  }),
  userReportedCount: z.number().int().nonnegative(),
  findings: z.object({
    fail: z.number().int().nonnegative(),
    warn: z.number().int().nonnegative(),
    info: z.number().int().nonnegative(),
    open: z.array(z.object({ severity: z.string(), text: z.string() }))
  })
})
export type ResearchVerificationSummary = z.infer<typeof researchVerificationSummarySchema>
