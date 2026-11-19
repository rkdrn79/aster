import { defineMethod } from '../core'
import {
  ResearchPlansApproveParams,
  ResearchPlansBudgetParams,
  ResearchPlansListParams,
  ResearchPlansOverviewParams,
  ResearchProposalsDecideParams,
  ResearchProposalsListParams
} from '../../../../shared/research/research-decisions-rpc'
import {
  approveResearchProjectPlan,
  decideResearchProjectProposal,
  listResearchProjectPlans,
  listResearchProjectProposals,
  readResearchProjectPlanOverview,
  stateResearchProjectPlanBudget
} from '../../../research/research-project-decisions'
import { resolveResearchProjectRoot } from '../../../research/research-project-files'

// Why workspace: a paired client already runs commands here; deciding is the person's own act,
// which the harness records as `by: 'user'`. Agents decide nothing through these.
export const RESEARCH_DECISION_METHODS = [
  defineMethod({
    name: 'researchProposals.list',
    permission: 'workspace',
    params: ResearchProposalsListParams,
    handler: async (params, { runtime }) =>
      listResearchProjectProposals(await resolveResearchProjectRoot(runtime, params.worktree), {
        experiment: params.experiment,
        state: params.state
      })
  }),
  defineMethod({
    name: 'researchProposals.decide',
    permission: 'workspace',
    params: ResearchProposalsDecideParams,
    handler: async (params, { runtime }) => ({
      proposal: await decideResearchProjectProposal(
        await resolveResearchProjectRoot(runtime, params.worktree),
        params
      )
    })
  }),
  defineMethod({
    name: 'researchPlans.list',
    permission: 'workspace',
    params: ResearchPlansListParams,
    handler: async (params, { runtime }) =>
      listResearchProjectPlans(await resolveResearchProjectRoot(runtime, params.worktree))
  }),
  defineMethod({
    name: 'researchPlans.overview',
    permission: 'workspace',
    params: ResearchPlansOverviewParams,
    handler: async (params, { runtime }) =>
      readResearchProjectPlanOverview(
        await resolveResearchProjectRoot(runtime, params.worktree),
        params.plan
      )
  }),
  defineMethod({
    name: 'researchPlans.budget',
    permission: 'workspace',
    params: ResearchPlansBudgetParams,
    handler: async (params, { runtime }) =>
      stateResearchProjectPlanBudget(
        await resolveResearchProjectRoot(runtime, params.worktree),
        params.plan,
        params
      )
  }),
  defineMethod({
    name: 'researchPlans.approve',
    permission: 'workspace',
    params: ResearchPlansApproveParams,
    handler: async (params, { runtime }) =>
      approveResearchProjectPlan(
        await resolveResearchProjectRoot(runtime, params.worktree),
        params.plan,
        params
      )
  })
]
