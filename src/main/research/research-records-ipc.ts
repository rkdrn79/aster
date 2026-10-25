import { ipcMain } from 'electron'
import { researchDocumentSchema } from '../../shared/research/research-records'
import { readResearchDocument, saveResearchDocument } from './research-repository'

export function registerResearchRecordsIpcHandlers(): void {
  ipcMain.handle('researchRecords:read', () => readResearchDocument())
  ipcMain.handle('researchRecords:save', (_event, input: unknown) =>
    saveResearchDocument(researchDocumentSchema.parse(input))
  )
}
