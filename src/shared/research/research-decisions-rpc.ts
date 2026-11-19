import { z } from 'zod'
import { WorktreeSelector } from '../rpc-contract/files-target-params'
import type {
  ResearchPlanApproveResult,
  ResearchPlanBudgetResult,
  ResearchPlanList
} from './research-plans'
import { RESEARCH_PROPOSAL_STATES, type ResearchProposal } from './research-proposals'

/**
 * `researchProposals.*` and `researchPlans.*`: the person's decisions on agent proposals and
 * experiment plans, made from any paired client on the host that owns the workspace. The host
 * records them through the same harness functions as the desktop, always as `by: 'user'`.
 */
// Same rules as the harness (research-layout.mjs, research-proposals.mjs, research-plan.mjs), so
// a refused request never reaches a ledger.
const experimentSlug = z.string().regex(/^[\p{L}\p{N}][\p{L}\p{N}-]{0,63}$/u)
const proposalId = z.string().regex(/^proposal-[1-9]\d{0,8}$/u)
const planId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/u)
const itemId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:+-]{0,79}$/u)
const reason = z.string().trim().min(1).max(600)

export const ResearchProposalsListParams = WorktreeSelector.extend({
  /** One Experiment; every Experiment in the catalog when absent. */
  experiment: experimentSlug.optional(),
  state: z.enum([...RESEARCH_PROPOSAL_STATES, 'all']).optional()
})

export const ResearchProposalsDecideParams = WorktreeSelector.extend({
  experiment: experimentSlug,
  id: proposalId,
  decision: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(2000).nullable()
})

export const ResearchPlansListParams = WorktreeSelector.extend({})

export const ResearchPlansOverviewParams = WorktreeSelector.extend({ plan: planId })

export const ResearchPlansBudgetParams = WorktreeSelector.extend({
  plan: planId,
  gpuHours: z.number().finite().min(0).max(10_000_000),
  hardware: z.string().trim().max(200).optional()
})

export const ResearchPlansApproveParams = WorktreeSelector.extend({
  plan: planId,
  /** The revision the person looked at; the harness refuses a plan that changed since. */
  revision: z.number().int().min(1),
  cuts: z.array(z.object({ cell: itemId, reason }).strict()).max(500),
  decisions: z
    .array(
      z
        .object({
          request: itemId,
          decision: z.enum(['include', 'out-of-scope']),
          reason: z.string().trim().max(600).nullable()
        })
        .strict()
    )
    .max(200)
})

export type ResearchProposalsListResult = {
  proposals: ResearchProposal[]
  /** Experiments whose proposals could not be read, so a silent gap never reads as "none". */
  unreadable: { experiment: string; reason: string }[]
}
export type ResearchProposalsDecideResult = { proposal: ResearchProposal }
export type ResearchPlansListResult = ResearchPlanList
export type ResearchPlansBudgetResult = ResearchPlanBudgetResult
export type ResearchPlansApproveResult = ResearchPlanApproveResult
