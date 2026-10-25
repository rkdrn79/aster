import { ipcRenderer } from 'electron'
import type { ResearchRunMediaIndex } from '../../shared/research/research-run-media'
import type {
  ResearchRunSummary,
  ResearchRunSummaryList
} from '../../shared/research/research-run-summary'

type WorkspaceParams = { workspacePath: string }
type RunNotes = Promise<{ notes: ResearchRunSummary['notes'] }>

/** Local catalog projects only: Run summaries, deterministic organizing, and media indexes. */
export type ResearchOrganizeApi = {
  summaries: (params: WorkspaceParams & { experiment: string }) => Promise<ResearchRunSummaryList>
  /** Recomputes summary.json for one Run or every Run of an Experiment. */
  organize: (
    params: WorkspaceParams & { run?: string; experiment?: string }
  ) => Promise<{ organized: number }>
  media: (params: WorkspaceParams & { run: string }) => Promise<ResearchRunMediaIndex>
  /** The user's own notes on a Run; agents' notes cannot be edited or deleted. */
  addNote: (params: WorkspaceParams & { run: string; text: string }) => RunNotes
  editNote: (params: WorkspaceParams & { run: string; at: string; text: string }) => RunNotes
  deleteNote: (params: WorkspaceParams & { run: string; at: string }) => RunNotes
}

export const researchOrganizeApi: ResearchOrganizeApi = {
  summaries: (params) => ipcRenderer.invoke('researchOrganize:summaries', params),
  organize: (params) => ipcRenderer.invoke('researchOrganize:organize', params),
  media: (params) => ipcRenderer.invoke('researchOrganize:media', params),
  addNote: (params) => ipcRenderer.invoke('researchOrganize:addNote', params),
  editNote: (params) => ipcRenderer.invoke('researchOrganize:editNote', params),
  deleteNote: (params) => ipcRenderer.invoke('researchOrganize:deleteNote', params)
}
