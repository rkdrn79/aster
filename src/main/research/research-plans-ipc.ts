import { z } from 'zod'
import {
  researchPlanStageResultSchema,
  type ResearchPlanApproveResult,
  type ResearchPlanBudgetResult,
  type ResearchPlanList,
  type ResearchPlanOverview,
  type ResearchPlanStageResult
} from '../../shared/research/research-plans'
import {
  approveResearchPlan,
  listResearchPlans,
  readResearchPlanOverview,
  stateResearchPlanBudget,
  type ResearchDecisionHarness
} from './research-decision-calls'
import { authorizedProjectPath, callHarness, handle } from './research-harness-ipc'

const PLAN_MODULE = 'research-plan.mjs'
const APPROVAL_MODULE = 'research-plan-approval.mjs'
// Same rules as the harness (research-plan.mjs, research-plan-schema.mjs), so a refused request
// never reaches plan.json.
const planId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/u)
const itemId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:+-]{0,79}$/u)
const reason = z.string().trim().min(1).max(600)

const workspaceSchema = z.object({ workspacePath: z.string().min(1).max(4096) }).strict()
const planSchema = workspaceSchema.extend({ plan: planId }).strict()
const budgetSchema = planSchema
  .extend({
    gpuHours: z.number().finite().min(0).max(10_000_000),
    hardware: z.string().trim().max(200).optional()
  })
  .strict()
const approveSchema = planSchema
  .extend({
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
  .strict()
const stageSchema = planSchema.extend({ stage: itemId }).strict()

// Why a dynamic import per call: the harness ships beside the app, as for the agents.
const desktopPlanHarness: Pick<
  ResearchDecisionHarness,
  'listPlans' | 'planOverview' | 'setPlanBudget' | 'approvePlan'
> = {
  listPlans: (project) => callHarness(PLAN_MODULE, 'listPlans', project),
  planOverview: (project, plan) => callHarness(APPROVAL_MODULE, 'planOverview', project, plan),
  setPlanBudget: (project, plan, input) =>
    callHarness(PLAN_MODULE, 'setPlanBudget', project, plan, input),
  approvePlan: (project, plan, input) =>
    callHarness(APPROVAL_MODULE, 'approvePlan', project, plan, input)
}

/**
 * Local catalog projects only. Stating compute, approving a plan and proposing a stage are always
 * the person's actions here; agents write plans with the harness CLI and cannot approve them.
 */
export function registerResearchPlansIpcHandlers(): void {
  handle('researchPlans:list', workspaceSchema, async (input): Promise<ResearchPlanList> =>
    listResearchPlans(desktopPlanHarness, await authorizedProjectPath(input.workspacePath))
  )
  handle('researchPlans:overview', planSchema, async (input): Promise<ResearchPlanOverview> =>
    readResearchPlanOverview(
      desktopPlanHarness,
      await authorizedProjectPath(input.workspacePath),
      input.plan
    )
  )
  handle('researchPlans:budget', budgetSchema, async (input): Promise<ResearchPlanBudgetResult> =>
    stateResearchPlanBudget(
      desktopPlanHarness,
      await authorizedProjectPath(input.workspacePath),
      input.plan,
      input
    )
  )
  handle(
    'researchPlans:approve',
    approveSchema,
    async (input): Promise<ResearchPlanApproveResult> =>
      approveResearchPlan(
        desktopPlanHarness,
        await authorizedProjectPath(input.workspacePath),
        input.plan,
        input
      )
  )
  handle(
    'researchPlans:proposeStage',
    stageSchema,
    async (input): Promise<ResearchPlanStageResult> =>
      researchPlanStageResultSchema.parse(
        await callHarness(
          APPROVAL_MODULE,
          'proposePlanStage',
          await authorizedProjectPath(input.workspacePath),
          input.plan,
          { stage: input.stage, by: 'user' }
        )
      )
  )
}
