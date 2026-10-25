import { ipcRenderer } from 'electron'
import type { ResearchRunWatchSummary } from '../../shared/research/research-run-agent-status'

export type ResearchWatchesApi = {
  /** Watches agents set with `research watch`, newest last; active only unless `all`. */
  list: (input?: {
    workspacePath?: string
    targetId?: string | null
    all?: boolean
  }) => Promise<ResearchRunWatchSummary[]>
}

export const researchWatchesApi: ResearchWatchesApi = {
  list: (input) => ipcRenderer.invoke('researchWatches:list', input)
}
