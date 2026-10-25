import { ipcRenderer } from 'electron'
import type { ResearchDocument } from '../../shared/research/research-records'

export type ResearchRecordsApi = {
  read: () => Promise<ResearchDocument>
  save: (document: ResearchDocument) => Promise<ResearchDocument>
}

export const researchRecordsApi: ResearchRecordsApi = {
  read: () => ipcRenderer.invoke('researchRecords:read'),
  save: (document) => ipcRenderer.invoke('researchRecords:save', document)
}
