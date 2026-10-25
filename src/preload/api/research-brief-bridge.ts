import { ipcRenderer } from 'electron'
import type {
  ResearchExperimentBriefPatch,
  ResearchExperimentBriefResult
} from '../../shared/research/research-experiment-brief'
import type { ResearchCheckResult } from '../../shared/research/research-quality-findings'

type ExperimentParams = { workspacePath: string; experiment: string }

/** Local catalog projects only: experiment.json briefs and rule checks via the bundled harness. */
export type ResearchBriefApi = {
  show: (params: ExperimentParams) => Promise<ResearchExperimentBriefResult>
  update: (
    params: ExperimentParams & { patch: ResearchExperimentBriefPatch }
  ) => Promise<ResearchExperimentBriefResult>
  check: (params: ExperimentParams & { run?: string }) => Promise<ResearchCheckResult>
}

export const researchBriefApi: ResearchBriefApi = {
  show: (params) => ipcRenderer.invoke('researchBrief:show', params),
  update: (params) => ipcRenderer.invoke('researchBrief:update', params),
  check: (params) => ipcRenderer.invoke('researchBrief:check', params)
}
