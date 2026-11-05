import { BrowserWindow, dialog, ipcMain } from 'electron'
import { z } from 'zod'
import {
  researchLibraryDocumentSchema,
  type LibraryPdfImportResult
} from '../../shared/research/research-library'
import { downloadArxivPdf, importLocalPdf, lookupArxivPaper } from './research-library-files'
import { lookupDoiPaper } from './research-library-doi'
import { readResearchLibrary, saveResearchLibrary } from './research-library-repository'
import { broadcastResearchChange } from './research-change-broadcast'

const workspaceSchema = z.object({ workspacePath: z.string().min(1).max(4096) }).strict()
const referenceSchema = z.object({ reference: z.string().trim().min(1).max(4096) }).strict()

export function registerResearchLibraryIpcHandlers(): void {
  ipcMain.handle('researchLibrary:read', () => readResearchLibrary())
  ipcMain.handle('researchLibrary:save', async (event, input: unknown) => {
    const saved = await saveResearchLibrary(researchLibraryDocumentSchema.parse(input))
    broadcastResearchChange(event.sender, 'researchLibrary:changed', saved)
    return saved
  })
  ipcMain.handle('researchLibrary:lookupArxiv', (_event, input: unknown) =>
    lookupArxivPaper(referenceSchema.parse(input).reference)
  )
  ipcMain.handle('researchLibrary:lookupDoi', (_event, input: unknown) =>
    lookupDoiPaper(referenceSchema.parse(input).reference)
  )
  ipcMain.handle('researchLibrary:downloadArxivPdf', (_event, input: unknown) => {
    const { workspacePath, reference } = workspaceSchema.merge(referenceSchema).parse(input)
    return downloadArxivPdf(workspacePath, reference)
  })
  ipcMain.handle(
    'researchLibrary:importPdf',
    async (event, input: unknown): Promise<LibraryPdfImportResult> => {
      const { workspacePath } = workspaceSchema.parse(input)
      const parent = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.OpenDialogOptions = {
        properties: ['openFile'],
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      }
      // Why: main opens the picker itself so the renderer never names a file outside the project.
      const result = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options)
      const sourcePath = result.filePaths[0]
      if (result.canceled || !sourcePath) {
        return { status: 'cancelled' }
      }
      return { status: 'imported', ...(await importLocalPdf(workspacePath, sourcePath)) }
    }
  )
}
