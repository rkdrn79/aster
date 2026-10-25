import { ipcMain } from 'electron'
import { z } from 'zod'
import { relativePathInsideRoot } from '../../shared/cross-platform-path'
import type { ResearchRunWatchSummary } from '../../shared/research/research-run-agent-status'
import { listResearchRunWatches } from './research-run-agent-api'

const listInputSchema = z
  .object({
    /** Only watches on Runs inside this workspace folder. */
    workspacePath: z.string().min(1).max(4096).optional(),
    /** Only watches on this SSH target; null for this machine. */
    targetId: z.string().min(1).max(512).nullable().optional(),
    /** Include finished and cancelled watches from the last week. */
    all: z.boolean().optional()
  })
  .optional()

export type ResearchWatchesListInput = z.infer<typeof listInputSchema>

export async function listResearchWatchesForWorkspace(
  input: ResearchWatchesListInput
): Promise<ResearchRunWatchSummary[]> {
  const { watches } = await listResearchRunWatches({ all: input?.all ?? false })
  return watches.filter(
    (watch) =>
      (input?.targetId === undefined || watch.targetId === input.targetId) &&
      (!input?.workspacePath ||
        relativePathInsideRoot(input.workspacePath, watch.projectPath) !== null)
  )
}

/** Read-only: the Runs page shows who watches a Run and for what; agents create watches. */
export function registerResearchRunWatchIpcHandlers(): void {
  ipcMain.handle('researchWatches:list', (_event, input: unknown) =>
    listResearchWatchesForWorkspace(listInputSchema.parse(input))
  )
}
