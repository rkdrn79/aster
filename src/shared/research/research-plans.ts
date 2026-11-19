import { z } from 'zod'

// Why catch: these mirror the research harness's plan results (research-plan*.mjs); a newer
// harness must not break the Plan view, so unknown or malformed fields fall back to defaults.
const nullableText = z.string().nullable().catch(null)
const nullableNumber = z.number().nullable().catch(null)
const texts = z.array(z.string()).catch([])

export const RESEARCH_PLAN_TIERS = ['must', 'should', 'could'] as const
export type ResearchPlanTier = (typeof RESEARCH_PLAN_TIERS)[number]
const tierSchema = z.enum(RESEARCH_PLAN_TIERS).catch('must')

export const RESEARCH_PLAN_STATUSES = ['draft', 'submitted', 'approved', 'closed'] as const
export type ResearchPlanStatus = (typeof RESEARCH_PLAN_STATUSES)[number]
const statusSchema = z.enum(RESEARCH_PLAN_STATUSES).catch('draft')

export const researchPlanSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: statusSchema,
  revision: z.number().int().catch(1),
  updatedAt: nullableText,
  path: z.string().catch('')
})
export type ResearchPlanSummary = z.infer<typeof researchPlanSummarySchema>

export const researchPlanListSchema = z.object({
  directory: z.string().catch(''),
  plans: z.array(researchPlanSummarySchema).catch([])
})
export type ResearchPlanList = z.infer<typeof researchPlanListSchema>

const cutSchema = z.object({ cell: z.string(), reason: z.string() })
const decisionSchema = z.object({
  request: z.string(),
  decision: z.enum(['include', 'out-of-scope']),
  reason: nullableText
})

export const researchPlanApprovalSchema = z.object({
  revision: z.number().int(),
  at: z.string(),
  by: z.literal('user').catch('user'),
  cuts: z.array(cutSchema).catch([]),
  decisions: z.array(decisionSchema).catch([]),
  keptGpuHours: nullableNumber,
  budgetGpuHours: nullableNumber,
  openFindings: texts
})
export type ResearchPlanApproval = z.infer<typeof researchPlanApprovalSchema>

const proposedSchema = z.object({
  experiment: z.string(),
  proposal: z.string(),
  stage: z.string().optional().catch(undefined)
})

export const researchPlanCellSchema = z.object({
  cell: z.string(),
  stage: nullableText,
  question: nullableText,
  purpose: z.string().catch('main'),
  tier: tierSchema,
  effectiveTier: tierSchema,
  promotedBy: texts,
  cost: nullableNumber,
  costSource: nullableText,
  seeds: z.number().int().catch(1),
  claims: texts,
  requests: texts,
  /** What the cell decides (claims, reviewer requests, comparisons); 0 means nothing. */
  priority: z
    .object({ score: z.number().catch(0), reasons: texts })
    .catch({ score: 0, reasons: [] }),
  expect: nullableText,
  command: nullableText,
  needsCode: z.boolean().catch(false),
  cutReason: nullableText,
  factors: z.record(z.string(), z.unknown()).catch({}),
  proposed: proposedSchema.nullable().catch(null)
})
export type ResearchPlanCell = z.infer<typeof researchPlanCellSchema>

export const researchPlanStageSchema = z.object({
  id: z.string(),
  name: z.string(),
  gate: nullableText,
  budgetGpuHours: nullableNumber,
  cells: texts,
  purposes: texts,
  gpuHours: z.number().catch(0),
  cumulativeGpuHours: z.number().catch(0)
})
export type ResearchPlanStage = z.infer<typeof researchPlanStageSchema>

export const RESEARCH_PLAN_RESOLUTIONS = ['plan', 'out-of-scope', 'ask'] as const

export const researchPlanRequestSchema = z.object({
  id: z.string(),
  reviewer: nullableText,
  category: nullableText,
  categoryLabel: z.string().catch('Other'),
  categoryRate: nullableNumber,
  request: z.string(),
  why: nullableText,
  likelihood: nullableText,
  likelyDemand: z.boolean().catch(false),
  resolution: z.enum(RESEARCH_PLAN_RESOLUTIONS).nullable().catch(null),
  items: texts,
  cells: texts,
  reason: nullableText,
  costGpuHours: nullableNumber
})
export type ResearchPlanRequest = z.infer<typeof researchPlanRequestSchema>

export const researchPlanFindingSchema = z.object({
  id: z.string(),
  check: z.string(),
  severity: z.enum(['fail', 'warn', 'info']).catch('info'),
  target: z.string().catch(''),
  text: z.string()
})
export type ResearchPlanFinding = z.infer<typeof researchPlanFindingSchema>

/** `planOverview`: what the Plan view shows, plus the raw plan.json for live cut previews. */
export const researchPlanOverviewSchema = z.object({
  plan: z.object({
    id: z.string(),
    title: z.string(),
    method: nullableText,
    status: statusSchema,
    revision: z.number().int().catch(1),
    updatedAt: nullableText,
    approval: researchPlanApprovalSchema.nullable().catch(null),
    outOfScope: z
      .array(
        z.object({
          item: z.string().catch(''),
          reason: nullableText,
          by: nullableText.optional()
        })
      )
      .catch([]),
    stoppingRules: texts
  }),
  document: z.record(z.string(), z.unknown()),
  cells: z.array(researchPlanCellSchema).catch([]),
  order: z.object({ stages: z.array(researchPlanStageSchema).catch([]) }),
  premortem: z.object({
    ranAt: nullableText,
    requests: z.array(researchPlanRequestSchema).catch([]),
    open: texts,
    asks: texts
  }),
  findings: z.array(researchPlanFindingSchema).catch([]),
  summary: z.object({
    fail: z.number().int().catch(0),
    warn: z.number().int().catch(0),
    info: z.number().int().catch(0)
  }),
  cut: texts
})
export type ResearchPlanOverview = z.infer<typeof researchPlanOverviewSchema>

const createdProposalSchema = z.object({
  cell: z.string(),
  experiment: z.string(),
  proposal: z.string()
})
export type ResearchPlanCreatedProposal = z.infer<typeof createdProposalSchema>

export const researchPlanApproveResultSchema = z.object({
  plan: z.string(),
  revision: z.number().int(),
  status: statusSchema,
  proposals: z.array(createdProposalSchema).catch([])
})
export type ResearchPlanApproveResult = z.infer<typeof researchPlanApproveResultSchema>

export const researchPlanStageResultSchema = z.object({
  plan: z.string(),
  revision: z.number().int(),
  stage: z.string(),
  proposals: z.array(createdProposalSchema).catch([])
})
export type ResearchPlanStageResult = z.infer<typeof researchPlanStageResultSchema>

export const researchPlanBudgetResultSchema = z.object({
  id: z.string(),
  revision: z.number().int().catch(1),
  status: statusSchema
})
export type ResearchPlanBudgetResult = z.infer<typeof researchPlanBudgetResultSchema>

/** What the person sends when approving: the revision they saw, cuts and "ask" decisions. */
export type ResearchPlanApproveInput = {
  revision: number
  cuts: { cell: string; reason: string }[]
  decisions: { request: string; decision: 'include' | 'out-of-scope'; reason: string | null }[]
}
