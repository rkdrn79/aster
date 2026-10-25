import { ipcMain, net } from 'electron'
import { conferenceTrackingSchema } from '../../shared/research/conference-deadlines'
import {
  readConferenceCatalog,
  refreshConferenceCatalog
} from './conference-deadlines-catalog-fetch'
import { readConferenceTracking, saveConferenceTracking } from './conference-deadlines-repository'

export function registerConferenceDeadlinesIpcHandlers(): void {
  ipcMain.handle('conferenceDeadlines:readTracking', () => readConferenceTracking())
  ipcMain.handle('conferenceDeadlines:saveTracking', (_event, input: unknown) =>
    saveConferenceTracking(conferenceTrackingSchema.parse(input))
  )
  ipcMain.handle('conferenceDeadlines:readCatalog', () => readConferenceCatalog())
  ipcMain.handle('conferenceDeadlines:refreshCatalog', () =>
    refreshConferenceCatalog((url, init) => net.fetch(url, init))
  )
}
