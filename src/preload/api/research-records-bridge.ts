import { ipcRenderer } from 'electron'
import type { ResearchDocument } from '../../shared/research/research-records'

export type ResearchRecordsApi = {
  read: () => Promise<ResearchDocument>
  save: (document: ResearchDocument) => Promise<ResearchDocument>
  /** Another window saved; added with research page windows, so renderers feature-detect it. */
  onChanged?: (callback: (document: ResearchDocument) => void) => () => void
}

export const researchRecordsApi: ResearchRecordsApi = {
  read: () => ipcRenderer.invoke('researchRecords:read'),
  save: (document) => ipcRenderer.invoke('researchRecords:save', document),
  onChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, document: ResearchDocument): void =>
      callback(document)
    ipcRenderer.on('researchRecords:changed', listener)
    return () => ipcRenderer.removeListener('researchRecords:changed', listener)
  }
}
