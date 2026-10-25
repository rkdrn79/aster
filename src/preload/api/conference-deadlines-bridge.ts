import { ipcRenderer } from 'electron'
import type {
  ConferenceCatalog,
  ConferenceTracking
} from '../../shared/research/conference-deadlines'

export type ConferenceDeadlinesApi = {
  readTracking: () => Promise<ConferenceTracking>
  saveTracking: (document: ConferenceTracking) => Promise<ConferenceTracking>
  readCatalog: () => Promise<ConferenceCatalog | null>
  refreshCatalog: () => Promise<ConferenceCatalog>
}

export const conferenceDeadlinesApi: ConferenceDeadlinesApi = {
  readTracking: () => ipcRenderer.invoke('conferenceDeadlines:readTracking'),
  saveTracking: (document) => ipcRenderer.invoke('conferenceDeadlines:saveTracking', document),
  readCatalog: () => ipcRenderer.invoke('conferenceDeadlines:readCatalog'),
  refreshCatalog: () => ipcRenderer.invoke('conferenceDeadlines:refreshCatalog')
}
