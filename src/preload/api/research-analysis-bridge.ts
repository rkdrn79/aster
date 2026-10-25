import { ipcRenderer } from 'electron'
import type { ResearchAnalysisList } from '../../shared/research/research-analysis'

type ExperimentParams = { workspacePath: string; experiment: string }

/** Local catalog projects only: the analyses agents and the user recorded for an Experiment. */
export type ResearchAnalysisApi = {
  list: (params: ExperimentParams) => Promise<ResearchAnalysisList>
  /** A table or note file's text (bounded); figures load through researchMedia.url. */
  read: (params: {
    workspacePath: string
    path: string
  }) => Promise<{ path: string; content: string; truncated: boolean }>
}

export const researchAnalysisApi: ResearchAnalysisApi = {
  list: (params) => ipcRenderer.invoke('researchAnalysis:list', params),
  read: (params) => ipcRenderer.invoke('researchAnalysis:read', params)
}
