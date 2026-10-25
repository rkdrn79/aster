import { app, ipcMain } from 'electron'
import { z } from 'zod'
import { resolveDesktopAuthorizedPath } from '../ipc/local-file-access-resolution'
import { mainProcessState } from '../startup/main-process-state'
import {
  clearResearchSlackCredentials,
  getResearchSlackConnection,
  removeResearchSlackRoute,
  setResearchSlackCredentials,
  stopResearchSlackConnection,
  upsertResearchSlackRoute
} from './research-slack-connection'

const routeSchema = z
  .object({
    projectKey: z.string().min(1).max(256),
    projectName: z.string().min(1).max(160),
    workspacePath: z.string().min(1).max(4096),
    channelIds: z
      .array(z.string().regex(/^[CG][A-Z0-9]+$/))
      .min(1)
      .max(20),
    allowedUsers: z
      .array(z.union([z.literal('*'), z.string().regex(/^[UW][A-Z0-9]+$/)]))
      .min(1)
      .max(100),
    agent: z.enum(['codex', 'claude'])
  })
  .strict()

export function registerResearchSlackIpcHandlers(): void {
  ipcMain.handle('researchSlack:get', () => getResearchSlackConnection())
  ipcMain.handle('researchSlack:credentials', (_event, input: unknown) => {
    const { appToken, botToken } = z
      .object({ appToken: z.string().max(300), botToken: z.string().max(300) })
      .strict()
      .parse(input)
    return setResearchSlackCredentials(appToken, botToken)
  })
  ipcMain.handle('researchSlack:disconnect', () => clearResearchSlackCredentials())
  ipcMain.handle('researchSlack:saveProject', async (_event, input: unknown) => {
    const route = routeSchema.parse(input)
    if (!mainProcessState.store) {
      throw new Error('Project storage is not ready')
    }
    const workspacePath = await resolveDesktopAuthorizedPath(
      route.workspacePath,
      mainProcessState.store
    )
    return upsertResearchSlackRoute({ ...route, workspacePath })
  })
  ipcMain.handle('researchSlack:removeProject', (_event, projectKey: unknown) =>
    removeResearchSlackRoute(z.string().min(1).max(256).parse(projectKey))
  )
  app.once('before-quit', stopResearchSlackConnection)
}
