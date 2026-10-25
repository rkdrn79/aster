import { ipcRenderer } from 'electron'
import type {
  ResearchPairwiseVerdict,
  ResearchSampleRating,
  ResearchSampleRatingSummary,
  ResearchSingleVerdict
} from '../../shared/research/research-sample-ratings'

type ExperimentParams = { workspacePath: string; experiment: string }

/** Local catalog projects only: ratings.jsonl sample judgments and their summary. */
export type ResearchRatingsApi = {
  list: (
    params: ExperimentParams & { run?: string; against?: string; by?: 'user' | 'agent' }
  ) => Promise<{ ratings: ResearchSampleRating[] }>
  /** Records a judgment as the user. */
  add: (
    params: ExperimentParams & {
      sampleId: string
      run: string
      against: string | null
      verdict: ResearchSingleVerdict | ResearchPairwiseVerdict
      tags: string[]
      note: string | null
      blind: boolean
    }
  ) => Promise<{ rating: ResearchSampleRating }>
  summary: (
    params: ExperimentParams & { run: string; against: string | null }
  ) => Promise<ResearchSampleRatingSummary>
  /** The project-relative rubric file, or null when it does not exist. */
  rubric: (params: {
    workspacePath: string
    path: string
  }) => Promise<{ path: string; content: string; sha256: string } | null>
}

export const researchRatingsApi: ResearchRatingsApi = {
  list: (params) => ipcRenderer.invoke('researchRatings:list', params),
  add: (params) => ipcRenderer.invoke('researchRatings:add', params),
  summary: (params) => ipcRenderer.invoke('researchRatings:summary', params),
  rubric: (params) => ipcRenderer.invoke('researchRatings:rubric', params)
}
