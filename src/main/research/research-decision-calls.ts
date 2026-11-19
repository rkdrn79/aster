import {
  researchPlanApproveResultSchema,
  researchPlanBudgetResultSchema,
  researchPlanListSchema,
  researchPlanOverviewSchema,
  type ResearchPlanApproveInput,
  type ResearchPlanApproveResult,
  type ResearchPlanBudgetResult,
  type ResearchPlanList,
  type ResearchPlanOverview
} from '../../shared/research/research-plans'
import {
  researchProposalListSchema,
  researchProposalSchema,
  type ResearchProposal,
  type ResearchProposalList
} from '../../shared/research/research-proposals'

/**
 * The person's proposal and plan decisions, as the harness records them. The desktop IPC passes
 * the harness shipped beside the app and a host's RPC its bundled copy; both come through here,
 * so the ledgers they write are the same, and always `by: 'user'`.
 */
export type ResearchDecisionHarness = {
  listProposals: (
    project: string,
    experiment: string,
    options: { state: string }
  ) => Promise<unknown>
  decideProposal: (
    project: string,
    input: {
      experiment: string
      id: string
      decision: 'approved' | 'rejected'
      note: string | null
      by: 'user'
    }
  ) => Promise<unknown>
  listPlans: (project: string) => Promise<unknown>
  planOverview: (project: string, plan: string) => Promise<unknown>
  setPlanBudget: (
    project: string,
    plan: string,
    input: { gpuHours: number; hardware?: string; by: 'user' }
  ) => Promise<unknown>
  approvePlan: (
    project: string,
    plan: string,
    input: ResearchPlanApproveInput & { by: 'user' }
  ) => Promise<unknown>
}

export type ResearchProposalDecision = {
  experiment: string
  id: string
  decision: 'approved' | 'rejected'
  note: string | null
}

export async function listResearchProposals(
  harness: Pick<ResearchDecisionHarness, 'listProposals'>,
  project: string,
  experiment: string,
  state: string
): Promise<ResearchProposalList> {
  return researchProposalListSchema.parse(
    await harness.listProposals(project, experiment, { state })
  )
}

export async function decideResearchProposal(
  harness: Pick<ResearchDecisionHarness, 'decideProposal'>,
  project: string,
  input: ResearchProposalDecision
): Promise<ResearchProposal> {
  const result = await harness.decideProposal(project, {
    experiment: input.experiment,
    id: input.id,
    decision: input.decision,
    note: input.note || null,
    by: 'user'
  })
  return researchProposalSchema.parse(Reflect.get(Object(result), 'proposal'))
}

export async function listResearchPlans(
  harness: Pick<ResearchDecisionHarness, 'listPlans'>,
  project: string
): Promise<ResearchPlanList> {
  return researchPlanListSchema.parse(await harness.listPlans(project))
}

export async function readResearchPlanOverview(
  harness: Pick<ResearchDecisionHarness, 'planOverview'>,
  project: string,
  plan: string
): Promise<ResearchPlanOverview> {
  return researchPlanOverviewSchema.parse(await harness.planOverview(project, plan))
}

export async function stateResearchPlanBudget(
  harness: Pick<ResearchDecisionHarness, 'setPlanBudget'>,
  project: string,
  plan: string,
  input: { gpuHours: number; hardware?: string }
): Promise<ResearchPlanBudgetResult> {
  return researchPlanBudgetResultSchema.parse(
    await harness.setPlanBudget(project, plan, {
      gpuHours: input.gpuHours,
      ...(input.hardware ? { hardware: input.hardware } : {}),
      by: 'user'
    })
  )
}

export async function approveResearchPlan(
  harness: Pick<ResearchDecisionHarness, 'approvePlan'>,
  project: string,
  plan: string,
  input: ResearchPlanApproveInput
): Promise<ResearchPlanApproveResult> {
  return researchPlanApproveResultSchema.parse(
    await harness.approvePlan(project, plan, {
      revision: input.revision,
      cuts: input.cuts,
      decisions: input.decisions,
      by: 'user'
    })
  )
}
