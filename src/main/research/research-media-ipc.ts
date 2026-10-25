import { ipcMain } from 'electron'
import { z } from 'zod'
import { readMediaPreview } from '../media/media-preview-protocol'
import { mainProcessState } from '../startup/main-process-state'
import { authorizedProjectPath } from './research-harness-ipc'
import { ResearchMediaRefusal, resolveResearchMediaFile } from './research-media-file-access'

const mediaUrlSchema = z
  .object({ workspacePath: z.string().min(1).max(4096), path: z.string().min(1).max(4096) })
  .strict()

/**
 * `researchMedia:url`: a per-renderer media-preview URL for one project media file. The grant keeps
 * the research-workspace access, so every range request rechecks that the file is in the project.
 */
export function registerResearchMediaIpcHandlers(): void {
  ipcMain.handle('researchMedia:url', async (event, raw: unknown) => {
    const parsed = mediaUrlSchema.safeParse(raw)
    if (!parsed.success) {
      throw new Error('This media request is not valid.')
    }
    const store = mainProcessState.store
    if (!store) {
      throw new Error('Project storage is not ready. Try again after startup.')
    }
    const project = await authorizedProjectPath(parsed.data.workspacePath).catch(() => null)
    if (!project) {
      throw new Error('Media plays only from a local project open in Aster.')
    }
    try {
      const file = await resolveResearchMediaFile(project, parsed.data.path)
      const preview = readMediaPreview(
        event,
        {
          filePath: file.filePath,
          access: { kind: 'research-workspace', workspacePath: project }
        },
        store,
        file.mimeType
      )
      if (!preview) {
        throw new ResearchMediaRefusal('Only image, video and audio files can be shown.')
      }
      return { url: preview.mediaUrl, kind: file.kind, bytes: file.bytes }
    } catch (cause) {
      // Why: a raw fs error quotes the path, which would name the Run's folder in blind review.
      throw new Error(
        cause instanceof ResearchMediaRefusal ? cause.message : 'This media file could not be read.'
      )
    }
  })
}
