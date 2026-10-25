import { z } from 'zod'
import { researchAgentIdentitySchema } from './research-quality-findings'

// Why catch: these mirror the research harness's JSON results; a newer harness must not break the UI.
const nullableText = z.string().nullable().catch(null)

export const RESEARCH_ANALYSIS_KINDS = ['figure', 'table', 'note'] as const
export type ResearchAnalysisKind = (typeof RESEARCH_ANALYSIS_KINDS)[number]

/**
 * One analysis an agent or the user recorded for an Experiment (ADR-003): a figure, table, or
 * note file in the project plus its one-paragraph takeaway. `file` is project-relative.
 */
export const researchAnalysisItemSchema = z.object({
  id: z.string(),
  at: z.string(),
  experiment: z.string(),
  title: z.string(),
  kind: z.enum(RESEARCH_ANALYSIS_KINDS).catch('note'),
  file: z.string(),
  summary: z.string().catch(''),
  runs: z.array(z.string()).catch([]),
  by: z.enum(['agent', 'user']).catch('agent'),
  agent: researchAgentIdentitySchema.optional(),
  /** A newer analysis that replaces this one; superseded items stay readable. */
  supersededBy: nullableText
})
export type ResearchAnalysisItem = z.infer<typeof researchAnalysisItemSchema>

export const researchAnalysisListSchema = z.object({
  experiment: z.string(),
  // Why per-item catch: one item a newer harness shapes differently must not hide the rest.
  items: z.array(researchAnalysisItemSchema.nullable().catch(null)).catch([])
})
export type ResearchAnalysisList = z.infer<typeof researchAnalysisListSchema>
