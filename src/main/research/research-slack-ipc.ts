import { app, ipcMain } from 'electron'
import { z } from 'zod'
import {
  clearResearchSlackCredentials,
  getResearchSlackConnection,
  removeResearchSlackRoute,
  setResearchSlackBackground,
  setResearchSlackCredentials,
  stopResearchSlackConnection,
  upsertResearchSlackRoute
} from './research-slack-connection'
import {
  getRemoteResearchSlackProject,
  removeRemoteResearchSlackProject,
  saveRemoteResearchSlackProject
} from './research-slack-remote'
import { routeSchema, verifiedResearchSlackRoute } from './research-slack-route-validation'

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
  ipcMain.handle('researchSlack:background', (_event, enabled: unknown) =>
    setResearchSlackBackground(z.boolean().parse(enabled))
  )
  ipcMain.handle('researchSlack:saveProject', async (_event, input: unknown) => {
    return upsertResearchSlackRoute(await verifiedResearchSlackRoute(input))
  })
  ipcMain.handle('researchSlack:removeProject', (_event, projectKey: unknown) =>
    removeResearchSlackRoute(z.string().min(1).max(256).parse(projectKey))
  )
  const remoteKey = z
    .object({ executionHostId: z.string(), projectKey: z.string().min(1).max(256) })
    .strict()
  ipcMain.handle('researchSlack:getRemoteProject', (_event, input: unknown) =>
    getRemoteResearchSlackProject(remoteKey.parse(input))
  )
  ipcMain.handle('researchSlack:saveRemoteProject', (_event, input: unknown) => {
    const parsed = z
      .object({ route: routeSchema, appToken: z.string(), botToken: z.string() })
      .strict()
      .parse(input)
    return saveRemoteResearchSlackProject(parsed)
  })
  ipcMain.handle('researchSlack:removeRemoteProject', (_event, input: unknown) =>
    removeRemoteResearchSlackProject(remoteKey.parse(input))
  )
  app.once('before-quit', stopResearchSlackConnection)
}
