import { ipcRenderer } from 'electron'
import type { ResearchMediaKind } from '../../shared/research/research-run-media'

/** A renderer URL for one project media file; refused outside the workspace or for other types. */
export type ResearchMediaApi = {
  url: (params: {
    workspacePath: string
    path: string
  }) => Promise<{ url: string; kind: ResearchMediaKind; bytes: number }>
}

export const researchMediaApi: ResearchMediaApi = {
  url: (params) => ipcRenderer.invoke('researchMedia:url', params)
}
