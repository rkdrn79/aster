import { z } from 'zod'

// Why catch: experiment.json is edited by agents and people; one bad field must not hide the rest.
const nullableText = z.string().nullable().catch(null)

export const RESEARCH_EXPERIMENT_STATUSES = [
  'planned',
  'running',
  'analyzing',
  'concluded',
  'abandoned'
] as const
export const RESEARCH_TRIAGE_POLICIES = ['off', 'suggest', 'auto'] as const
export const RESEARCH_PROPOSAL_POLICIES = ['off', 'approval', 'budgeted'] as const

export type ResearchExperimentStatus = (typeof RESEARCH_EXPERIMENT_STATUSES)[number]
export type ResearchTriagePolicy = (typeof RESEARCH_TRIAGE_POLICIES)[number]
export type ResearchProposalPolicy = (typeof RESEARCH_PROPOSAL_POLICIES)[number]

export const DEFAULT_RESEARCH_AGENT_POLICY = {
  triage: 'suggest',
  proposals: 'approval'
} as const satisfies { triage: ResearchTriagePolicy; proposals: ResearchProposalPolicy }

/** The `brief` object of an Experiment's experiment.json (plan C1). */
export const researchExperimentBriefSchema = z.object({
  question: nullableText,
  hypothesis: nullableText,
  status: z.enum(RESEARCH_EXPERIMENT_STATUSES).catch('planned'),
  primaryMetric: z
    .object({
      name: z.string(),
      split: nullableText,
      direction: z.enum(['minimize', 'maximize'])
    })
    .nullable()
    .catch(null),
  evaluation: z
    .object({
      datasetId: z.string(),
      datasetRevision: nullableText,
      split: nullableText,
      evaluatorRevision: nullableText
    })
    .nullable()
    .catch(null),
  baseline: nullableText,
  minSeeds: z.number().int().min(1).max(20).nullable().catch(null),
  rubric: nullableText,
  agentPolicy: z
    .object({
      triage: z.enum(RESEARCH_TRIAGE_POLICIES).catch(DEFAULT_RESEARCH_AGENT_POLICY.triage),
      proposals: z.enum(RESEARCH_PROPOSAL_POLICIES).catch(DEFAULT_RESEARCH_AGENT_POLICY.proposals)
    })
    .catch({ ...DEFAULT_RESEARCH_AGENT_POLICY }),
  conclusion: nullableText,
  updatedAt: nullableText,
  updatedBy: z.enum(['user', 'agent']).nullable().catch(null)
})
export type ResearchExperimentBrief = z.infer<typeof researchExperimentBriefSchema>

/** Fields a caller may change; omitted keys stay, `null` clears. */
export type ResearchExperimentBriefPatch = Partial<
  Omit<ResearchExperimentBrief, 'updatedAt' | 'updatedBy'>
>

export const researchExperimentBriefResultSchema = z.object({
  experiment: z.string(),
  brief: researchExperimentBriefSchema.nullable()
})
export type ResearchExperimentBriefResult = z.infer<typeof researchExperimentBriefResultSchema>
