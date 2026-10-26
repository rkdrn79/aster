import { z } from 'zod'
import { resolveDesktopAuthorizedPath } from '../ipc/local-file-access-resolution'
import { callRuntimeEnvironment } from '../ipc/runtime-environments/runtime-environment-transport-routing'
import { parseRoutableExecutionHostId } from '../../shared/execution-host'
import { resolveEnvironment } from '../../shared/runtime-environment-store'
import { getPreferredPairingOffer } from '../../shared/runtime-environments'
import { slackHostKeyFingerprint } from '../../shared/slack-project-route-host'
import type { SlackProjectRoute } from '../../shared/slack-project-connection'
import { splitWorktreeIdForFilesystem } from '../../shared/worktree/id'
import { listRegisteredSshTargets } from '../ssh/targets/ssh-target-registry'
import { mainProcessState } from '../startup/main-process-state'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'

export const routeSchema = z
  .object({
    projectKey: z.string().min(1).max(256),
    projectName: z.string().min(1).max(160),
    workspacePath: z.string().min(1).max(4096),
    executionHostId: z.string().min(1).max(256).optional(),
    workspaceId: z.string().min(1).max(4096).optional(),
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

export async function verifiedResearchSlackRoute(input: unknown): Promise<SlackProjectRoute> {
  const route = routeSchema.parse(input)
  if (!mainProcessState.store) {
    throw new Error('Project storage is not ready')
  }
  const host = parseRoutableExecutionHostId(route.executionHostId ?? 'local')
  if (!host || host.id !== (route.executionHostId ?? 'local')) {
    throw new Error('The selected Slack execution host is unavailable')
  }
  if (host.kind === 'local') {
    const workspacePath = await resolveDesktopAuthorizedPath(
      route.workspacePath,
      mainProcessState.store
    )
    return { ...route, executionHostId: 'local', workspacePath }
  }
  const workspaceId = route.workspaceId
  const parsedWorkspace = workspaceId ? splitWorktreeIdForFilesystem(workspaceId) : null
  if (!workspaceId || !parsedWorkspace || parsedWorkspace.worktreePath !== route.workspacePath) {
    throw new Error('The selected workspace does not match its remote path')
  }
  const environmentId =
    host.kind === 'runtime'
      ? host.environmentId
      : listRegisteredSshTargets().find((target) => target.id === host.targetId)?.orcadFence
          ?.environmentId
  if (!environmentId) {
    throw new Error('Slack requires a paired Aster runtime on this SSH host')
  }
  const userDataPath = getCanonicalUserDataPath()
  const environment = resolveEnvironment(userDataPath, environmentId)
  if (!environment.runtimeId) {
    throw new Error('The remote runtime identity is not yet verified; reconnect the host')
  }
  const response = await callRuntimeEnvironment(
    userDataPath,
    environment.id,
    'worktree.show',
    { worktree: `id:${workspaceId}` },
    undefined,
    environment.pairingRevision,
    undefined,
    { expectedEnvironmentRuntimeId: environment.runtimeId }
  )
  const shown = z
    .object({ worktree: z.object({ id: z.string(), path: z.string(), repoId: z.string() }) })
    .safeParse(response.ok ? response.result : null)
  if (
    !shown.success ||
    shown.data.worktree.id !== workspaceId ||
    shown.data.worktree.path !== route.workspacePath ||
    shown.data.worktree.repoId !== parsedWorkspace.repoId
  ) {
    throw new Error('This workspace is not registered on the selected remote host')
  }
  return {
    ...route,
    executionHostId: host.id,
    workspaceId,
    environmentId: environment.id,
    runtimeId: environment.runtimeId,
    hostKeyFingerprint: slackHostKeyFingerprint(getPreferredPairingOffer(environment).publicKeyB64)
  }
}
