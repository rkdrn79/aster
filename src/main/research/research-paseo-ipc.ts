import { app, ipcMain } from 'electron'
import { z } from 'zod'
import { resolveDesktopAuthorizedPath } from '../ipc/local-file-access-resolution'
import { mainProcessState } from '../startup/main-process-state'
import { callRuntimeEnvironment } from '../ipc/runtime-environments/runtime-environment-transport-routing'
import { listRegisteredSshTargets } from '../ssh/targets/ssh-target-registry'
import { getRepoExecutionHostId, parseRoutableExecutionHostId } from '../../shared/execution-host'
import { splitWorktreeIdForFilesystem } from '../../shared/worktree/id'
import type { PaseoCompanionScope } from '../../shared/research/research-paseo-companion'
import {
  getPaseoPhonePairingUrl,
  listPaseoHostAgents,
  listPaseoProjectAgents,
  readPaseoHostAgentLog,
  readPaseoProjectAgentLog,
  setUpPaseoProjectDaemon,
  sendPaseoHostAgentMessage,
  sendPaseoProjectAgentMessage
} from './research-paseo-companion'
import { listPaseoProjectProviders, startPaseoProjectAgent } from './research-paseo-agent-create'

const scopeSchema = z
  .object({
    hostId: z.string().min(1).max(256),
    workspaceId: z.string().min(1).max(4096),
    workspacePath: z.string().min(1).max(4096)
  })
  .strict()
const agentSchema = z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/)

async function authorizedScope(input: unknown): Promise<PaseoCompanionScope> {
  const scope = scopeSchema.parse(input)
  const store = mainProcessState.store
  if (!store) {
    throw new Error('Project storage is not ready.')
  }
  const host = parseRoutableExecutionHostId(scope.hostId)
  if (!host || host.id !== scope.hostId) {
    throw new Error('The selected host is unavailable.')
  }
  const worktree = splitWorktreeIdForFilesystem(scope.workspaceId)
  if (worktree?.worktreePath !== scope.workspacePath) {
    throw new Error('This workspace is not registered on the selected host.')
  }
  const environmentId =
    host.kind === 'runtime'
      ? listRegisteredSshTargets().find(
          (target) => target.orcadFence?.environmentId === host.environmentId
        )?.orcadFence?.environmentId
      : host.kind === 'ssh'
        ? listRegisteredSshTargets().find((target) => target.id === host.targetId)?.orcadFence
            ?.environmentId
        : undefined
  if (environmentId) {
    const response = await callRuntimeEnvironment(
      app.getPath('userData'),
      environmentId,
      'worktree.show',
      { worktree: `id:${scope.workspaceId}` }
    )
    const result = z
      .object({
        worktree: z.object({ id: z.string(), path: z.string(), repoId: z.string() })
      })
      .safeParse(response.ok ? response.result : null)
    if (
      !result.success ||
      result.data.worktree.id !== scope.workspaceId ||
      result.data.worktree.path !== scope.workspacePath ||
      result.data.worktree.repoId !== worktree.repoId
    ) {
      throw new Error('This workspace is not registered on the selected host.')
    }
    return scope
  }
  const repo = store
    .getRepos()
    .find((entry) => entry.id === worktree?.repoId && getRepoExecutionHostId(entry) === host.id)
  if (!repo) {
    throw new Error('This workspace is not registered on the selected host.')
  }
  if (scope.hostId === 'local') {
    return {
      ...scope,
      workspacePath: await resolveDesktopAuthorizedPath(scope.workspacePath, store)
    }
  }
  if (
    scope.workspacePath !== repo.path &&
    !store.getWorktreeMetaForHost(scope.workspaceId, host.id)
  ) {
    throw new Error('This workspace is not registered on the selected host.')
  }
  return scope
}

export function registerResearchPaseoIpcHandlers(): void {
  ipcMain.handle('researchPaseo:list', async (_event, scope: unknown) =>
    listPaseoProjectAgents(await authorizedScope(scope))
  )
  ipcMain.handle('researchPaseo:listHost', async (_event, scope: unknown) =>
    listPaseoHostAgents(await authorizedScope(scope))
  )
  ipcMain.handle('researchPaseo:providers', async (_event, scope: unknown) =>
    listPaseoProjectProviders(await authorizedScope(scope))
  )
  ipcMain.handle('researchPaseo:pair', async (_event, scope: unknown) =>
    getPaseoPhonePairingUrl(await authorizedScope(scope))
  )
  ipcMain.handle('researchPaseo:setup', async (_event, scope: unknown) =>
    setUpPaseoProjectDaemon(await authorizedScope(scope))
  )
  ipcMain.handle('researchPaseo:logs', async (_event, scope: unknown, agentId: unknown) =>
    readPaseoProjectAgentLog(await authorizedScope(scope), agentSchema.parse(agentId))
  )
  ipcMain.handle('researchPaseo:logsHost', async (_event, scope: unknown, agentId: unknown) =>
    readPaseoHostAgentLog(await authorizedScope(scope), agentSchema.parse(agentId))
  )
  ipcMain.handle(
    'researchPaseo:start',
    async (_event, scope: unknown, prompt: unknown, provider: unknown) =>
      startPaseoProjectAgent(
        await authorizedScope(scope),
        z.string().min(1).max(20_000).parse(prompt),
        z
          .string()
          .regex(/^[a-z][a-z0-9-]{0,49}$/)
          .parse(provider)
      )
  )
  ipcMain.handle(
    'researchPaseo:send',
    async (_event, scope: unknown, agentId: unknown, message: unknown) =>
      sendPaseoProjectAgentMessage(
        await authorizedScope(scope),
        agentSchema.parse(agentId),
        z.string().min(1).max(20_000).parse(message)
      )
  )
  ipcMain.handle(
    'researchPaseo:sendHost',
    async (_event, scope: unknown, agentId: unknown, message: unknown) =>
      sendPaseoHostAgentMessage(
        await authorizedScope(scope),
        agentSchema.parse(agentId),
        z.string().min(1).max(20_000).parse(message)
      )
  )
}
