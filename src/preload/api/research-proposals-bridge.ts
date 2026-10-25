import { ipcRenderer } from 'electron'
import type {
  ResearchProposal,
  ResearchProposalList,
  ResearchProposalState
} from '../../shared/research/research-proposals'

type ExperimentParams = { workspacePath: string; experiment: string }

/** Local catalog projects only: agent rerun proposals and the user's decisions. */
export type ResearchProposalsApi = {
  list: (
    params: ExperimentParams & { state?: ResearchProposalState | 'all' }
  ) => Promise<ResearchProposalList>
  /** Records the user's decision; the renderer then tells the proposing agent. */
  decide: (
    params: ExperimentParams & {
      id: string
      decision: 'approved' | 'rejected'
      note: string | null
    }
  ) => Promise<{ proposal: ResearchProposal }>
  /** Records that the user handed an approved `needsCode` proposal to a Workbench chat. */
  handoff: (
    params: ExperimentParams & { id: string; sessionId: string | null }
  ) => Promise<{ proposal: ResearchProposal }>
}

export const researchProposalsApi: ResearchProposalsApi = {
  list: (params) => ipcRenderer.invoke('researchProposals:list', params),
  decide: (params) => ipcRenderer.invoke('researchProposals:decide', params),
  handoff: (params) => ipcRenderer.invoke('researchProposals:handoff', params)
}
