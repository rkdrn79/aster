import { ipcRenderer } from 'electron'
import type {
  ResearchFinding,
  ResearchFindingEvidence,
  ResearchFindingLayer,
  ResearchFindingList,
  ResearchFindingSeverity,
  ResearchFindingStatus
} from '../../shared/research/research-quality-findings'

type ExperimentParams = { workspacePath: string; experiment: string }

/** Local catalog projects only: quality.jsonl findings merged with rule checks. */
export type ResearchFindingsApi = {
  list: (
    params: ExperimentParams & { status?: ResearchFindingStatus | 'all'; run?: string }
  ) => Promise<ResearchFindingList>
  /** Records a finding as the user. */
  add: (
    params: ExperimentParams & {
      check: string
      severity: ResearchFindingSeverity
      layer: ResearchFindingLayer
      text: string
      runs: string[]
      samples?: string[]
      evidence?: ResearchFindingEvidence[]
    }
  ) => Promise<{ finding: ResearchFinding }>
  /** Changes a finding's status as the user. */
  setStatus: (
    params: ExperimentParams & { id: string; status: ResearchFindingStatus; note: string | null }
  ) => Promise<{ id: string; status: ResearchFindingStatus }>
}

export const researchFindingsApi: ResearchFindingsApi = {
  list: (params) => ipcRenderer.invoke('researchFindings:list', params),
  add: (params) => ipcRenderer.invoke('researchFindings:add', params),
  setStatus: (params) => ipcRenderer.invoke('researchFindings:setStatus', params)
}
