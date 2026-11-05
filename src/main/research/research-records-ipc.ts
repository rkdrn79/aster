import { ipcMain } from 'electron'
import { researchDocumentSchema } from '../../shared/research/research-records'
import { readResearchDocument, saveResearchDocument } from './research-repository'
import { broadcastResearchChange } from './research-change-broadcast'

export function registerResearchRecordsIpcHandlers(): void {
  ipcMain.handle('researchRecords:read', () => readResearchDocument())
  ipcMain.handle('researchRecords:save', async (event, input: unknown) => {
    const saved = await saveResearchDocument(researchDocumentSchema.parse(input))
    broadcastResearchChange(event.sender, 'researchRecords:changed', saved)
    return saved
  })
}
