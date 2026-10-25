import { ipcMain } from 'electron'
import { z } from 'zod'
import { cancelResearchLatex, compileResearchLatex } from './research-latex-compile'

const buildIdSchema = z.string().min(1).max(128)
const compileRequestSchema = z.union([
  z.object({ experimentId: z.string().uuid(), buildId: buildIdSchema.optional() }).strict(),
  z
    .object({
      workspacePath: z.string().min(1).max(4096),
      sourcePath: z.string().min(1).max(4096),
      buildId: buildIdSchema.optional()
    })
    .strict()
])
const cancelRequestSchema = z.object({ buildId: buildIdSchema }).strict()

export function registerResearchLatexIpcHandlers(): void {
  ipcMain.handle('researchLatex:compile', (event, input: unknown) => {
    const { buildId, ...target } = compileRequestSchema.parse(input)
    const sender = event.sender
    return compileResearchLatex(
      target,
      buildId,
      buildId
        ? (text) => {
            if (!sender.isDestroyed()) {
              sender.send('researchLatex:output', { buildId, text })
            }
          }
        : undefined
    )
  })
  ipcMain.handle('researchLatex:cancel', (_event, input: unknown) =>
    cancelResearchLatex(cancelRequestSchema.parse(input).buildId)
  )
}
