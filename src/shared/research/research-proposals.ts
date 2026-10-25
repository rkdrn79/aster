import { z } from 'zod'
import { researchAgentIdentitySchema } from './research-quality-findings'

// Why catch: these mirror the research harness's JSON results; a newer harness must not break the UI.
const nullableText = z.string().nullable().catch(null)

export const RESEARCH_PROPOSAL_STATES = ['pending', 'approved', 'rejected', 'launched'] as const
export type ResearchProposalState = (typeof RESEARCH_PROPOSAL_STATES)[number]

/** One agent proposal with its derived state (plan C4). */
export const researchProposalSchema = z.object({
  id: z.string(),
  at: z.string(),
  experiment: z.string(),
  title: z.string(),
  rationale: z.string(),
  command: z.string(),
  cwd: nullableText,
  configChanges: z.record(z.string(), z.unknown()).nullable().catch(null),
  findings: z.array(z.string()).catch([]),
  runs: z.array(z.string()).catch([]),
  agent: researchAgentIdentitySchema.optional(),
  state: z.enum(RESEARCH_PROPOSAL_STATES).catch('pending'),
  decision: z
    .object({
      decision: z.enum(['approved', 'rejected']),
      note: nullableText,
      by: z.literal('user'),
      at: z.string()
    })
    .nullable()
    .catch(null),
  launchedRun: nullableText,
  /** The Run needs code changes, so it is implemented in a Workbench chat (ADR-003). */
  needsCode: z.boolean().catch(false),
  /** Set when the user handed the approved proposal to a Workbench chat. */
  handoff: z.object({ at: z.string(), sessionId: nullableText }).nullable().catch(null)
})
export type ResearchProposal = z.infer<typeof researchProposalSchema>

export const researchProposalListSchema = z.object({
  proposals: z.array(researchProposalSchema)
})
export type ResearchProposalList = z.infer<typeof researchProposalListSchema>
