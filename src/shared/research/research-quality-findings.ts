import { z } from 'zod'

// Why catch: these mirror the research harness's JSON results; a newer harness must not break the UI.
const nullableText = z.string().nullable().catch(null)
const nullableNumber = z.number().nullable().catch(null)

export const RESEARCH_FINDING_SOURCES = ['rule', 'agent', 'user'] as const
export const RESEARCH_FINDING_LAYERS = ['integrity', 'output'] as const
export const RESEARCH_FINDING_SEVERITIES = ['info', 'warn', 'fail'] as const
export const RESEARCH_FINDING_STATUSES = ['open', 'accepted', 'dismissed', 'resolved'] as const

export type ResearchFindingSource = (typeof RESEARCH_FINDING_SOURCES)[number]
export type ResearchFindingLayer = (typeof RESEARCH_FINDING_LAYERS)[number]
export type ResearchFindingSeverity = (typeof RESEARCH_FINDING_SEVERITIES)[number]
export type ResearchFindingStatus = (typeof RESEARCH_FINDING_STATUSES)[number]

export const researchFindingEvidenceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('metric'),
    run: z.string(),
    metric: z.string(),
    split: nullableText,
    step: nullableNumber,
    value: nullableNumber
  }),
  z.object({
    kind: z.literal('log'),
    run: z.string(),
    fromLine: z.number(),
    toLine: z.number(),
    excerpt: z.string().catch('')
  }),
  z.object({ kind: z.literal('file'), path: z.string(), line: nullableNumber }),
  z.object({
    kind: z.literal('manifest'),
    run: z.string(),
    field: z.string(),
    value: z.unknown()
  }),
  z.object({ kind: z.literal('sample'), run: z.string(), sampleId: z.string() }),
  z.object({ kind: z.literal('claim'), claim: z.string() })
])
export type ResearchFindingEvidence = z.infer<typeof researchFindingEvidenceSchema>

export const researchAgentIdentitySchema = z
  .object({
    provider: nullableText,
    sessionId: nullableText,
    terminalHandle: nullableText,
    paneKey: nullableText,
    providerSessionId: nullableText
  })
  .nullable()
  .catch(null)
export type ResearchAgentIdentity = NonNullable<z.infer<typeof researchAgentIdentitySchema>>

/** One quality finding: a rule check result or a recorded agent/user finding (plan C2). */
export const researchFindingSchema = z.object({
  id: z.string(),
  source: z.enum(RESEARCH_FINDING_SOURCES),
  check: z.string(),
  layer: z.enum(RESEARCH_FINDING_LAYERS).catch('integrity'),
  severity: z.enum(RESEARCH_FINDING_SEVERITIES).catch('info'),
  status: z.enum(RESEARCH_FINDING_STATUSES).catch('open'),
  experiment: z.string(),
  runs: z.array(z.string()).catch([]),
  samples: z.array(z.string()).catch([]),
  text: z.string(),
  // Why per-item catch: one evidence shape a newer harness adds must not drop the finding.
  evidence: z.array(researchFindingEvidenceSchema.nullable().catch(null)).catch([]),
  createdAt: z.string(),
  agent: researchAgentIdentitySchema.optional(),
  statusNote: nullableText.optional(),
  statusAt: nullableText.optional(),
  statusBy: z.enum(['user', 'agent']).nullable().catch(null).optional()
})
export type ResearchFinding = z.infer<typeof researchFindingSchema>

export const researchCheckResultSchema = z.object({
  checkedAt: z.string(),
  findings: z.array(researchFindingSchema)
})
export type ResearchCheckResult = z.infer<typeof researchCheckResultSchema>

export const researchFindingListSchema = z.object({
  findings: z.array(researchFindingSchema)
})
export type ResearchFindingList = z.infer<typeof researchFindingListSchema>
