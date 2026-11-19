import { ipcRenderer } from 'electron'
import type {
  ResearchPlanApproveInput,
  ResearchPlanApproveResult,
  ResearchPlanBudgetResult,
  ResearchPlanList,
  ResearchPlanOverview,
  ResearchPlanStageResult
} from '../../shared/research/research-plans'

type WorkspaceParams = { workspacePath: string }
type PlanParams = WorkspaceParams & { plan: string }

/** Local catalog projects only: experiment plans and the person's decisions on them. */
export type ResearchPlansApi = {
  list: (params: WorkspaceParams) => Promise<ResearchPlanList>
  overview: (params: PlanParams) => Promise<ResearchPlanOverview>
  /** Records the person's stated compute; it replaces any budget the plan carried. */
  budget: (
    params: PlanParams & { gpuHours: number; hardware?: string }
  ) => Promise<ResearchPlanBudgetResult>
  /** The person's approval: pins the revision and proposes the first stage's runs. */
  approve: (params: PlanParams & ResearchPlanApproveInput) => Promise<ResearchPlanApproveResult>
  /** Proposes a later stage's runs of an approved plan. */
  proposeStage: (params: PlanParams & { stage: string }) => Promise<ResearchPlanStageResult>
}

export const researchPlansApi: ResearchPlansApi = {
  list: (params) => ipcRenderer.invoke('researchPlans:list', params),
  overview: (params) => ipcRenderer.invoke('researchPlans:overview', params),
  budget: (params) => ipcRenderer.invoke('researchPlans:budget', params),
  approve: (params) => ipcRenderer.invoke('researchPlans:approve', params),
  proposeStage: (params) => ipcRenderer.invoke('researchPlans:proposeStage', params)
}
