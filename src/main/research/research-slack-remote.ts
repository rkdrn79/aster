import { z } from 'zod'
import { parseRoutableExecutionHostId } from '../../shared/execution-host'
import type {
  SlackProjectRoute,
  SlackRemoteProjectStatus,
  SlackProjectBackgroundTasks
} from '../../shared/slack-project-connection'
import { resolveEnvironment } from '../../shared/runtime-environment-store'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import { listRegisteredSshTargets } from '../ssh/targets/ssh-target-registry'
import {
  clearResearchSlackCredentials,
  getResearchSlackConnection,
  getResearchSlackTokens,
  removeResearchSlackRoute,
  setResearchSlackBackground,
  setResearchSlackCredentials,
  upsertResearchSlackRoute
} from './research-slack-connection'
import { stopDesktopSlackBridge } from './research-slack-desktop-bridge'
import { verifiedResearchSlackRoute } from './research-slack-route-validation'
import { runResearchSshCli } from './research-ssh-cli'

const remoteStatusSchema = z
  .object({
    configured: z.boolean(),
    connection: z.enum(['disabled', 'connecting', 'connected', 'disconnected', 'error', 'standby']),
    error: z.string().nullable(),
    notice: z.string().nullable(),
    route: z
      .object({
        projectKey: z.string(),
        projectName: z.string(),
        workspacePath: z.string(),
        channelIds: z.array(z.string()),
        allowedUsers: z.array(z.string()),
        agent: z.enum(['codex', 'claude'])
      })
      .nullable(),
    service: z.enum(['live', 'exited', 'unverifiable']),
    runtimeInstalled: z.boolean()
  })
  .strict()

const remoteTasksSchema = z
  .object({
    projectKey: z.string(),
    workspacePath: z.string().nullable(),
    agent: z.enum(['codex', 'claude']).nullable(),
    sessions: z.array(
      z.object({
        channelId: z.string().regex(/^[CG][A-Z0-9]+$/),
        threadTs: z.string().regex(/^\d+\.\d+$/),
        sessionId: z.string().min(1)
      })
    )
  })
  .strict()

function sshProjectHost(executionHostId: string): { targetId: string; runtimeId: string } {
  const host = parseRoutableExecutionHostId(executionHostId)
  if (host?.kind !== 'ssh' && host?.kind !== 'runtime') {
    throw new Error('This project is not on a remote host')
  }
  const target = listRegisteredSshTargets().find((item) =>
    host.kind === 'ssh'
      ? item.id === host.targetId
      : item.orcadFence?.environmentId === host.environmentId
  )
  const environmentId = target?.orcadFence?.environmentId
  if (!target || !environmentId) {
    throw new Error('Connect this project server through SSH in Aster before setting up Slack')
  }
  const environment = resolveEnvironment(getCanonicalUserDataPath(), environmentId)
  if (!environment.runtimeId) {
    throw new Error('Aster on the SSH host is not verified. Reconnect the host.')
  }
  return { targetId: target.id, runtimeId: environment.runtimeId }
}

async function command(
  executionHostId: string,
  args: readonly string[],
  stdin?: string
): Promise<SlackRemoteProjectStatus> {
  const host = sshProjectHost(executionHostId)
  return remoteStatusSchema.parse(
    await runResearchSshCli({
      ...host,
      args,
      stdin,
      timeoutMs: stdin ? 90_000 : 30_000
    })
  ) satisfies SlackRemoteProjectStatus
}

export async function getRemoteResearchSlackProject(input: {
  executionHostId: string
  projectKey: string
}): Promise<SlackRemoteProjectStatus> {
  return command(input.executionHostId, [
    'slack',
    'project',
    'status',
    '--project-key',
    input.projectKey
  ])
}

export async function getRemoteResearchSlackProjectTasks(input: {
  executionHostId: string
  projectKey: string
}): Promise<SlackProjectBackgroundTasks> {
  const host = sshProjectHost(input.executionHostId)
  return remoteTasksSchema.parse(
    await runResearchSshCli({
      ...host,
      args: ['slack', 'project', 'tasks', '--project-key', input.projectKey],
      timeoutMs: 30_000
    })
  )
}

export async function saveRemoteResearchSlackProject(input: {
  route: unknown
  appToken: string
  botToken: string
}): Promise<SlackRemoteProjectStatus> {
  const route = await verifiedResearchSlackRoute(input.route)
  const host = parseRoutableExecutionHostId(route.executionHostId)
  if ((host?.kind !== 'ssh' && host?.kind !== 'runtime') || !route.runtimeId) {
    throw new Error('Connect the project SSH host before setting up Slack')
  }
  sshProjectHost(host.id)
  if (Boolean(input.appToken) !== Boolean(input.botToken)) {
    throw new Error('Enter both Slack tokens or leave both empty to keep the server bot')
  }
  const local = getResearchSlackConnection()
  if (local.routes.some((item) => item.projectKey !== route.projectKey)) {
    throw new Error(
      'This computer still connects other projects with its Slack bot. Move those connections or use a separate bot for this server.'
    )
  }
  const serverRoute: Pick<
    SlackProjectRoute,
    'projectKey' | 'projectName' | 'workspacePath' | 'channelIds' | 'allowedUsers' | 'agent'
  > = {
    projectKey: route.projectKey,
    projectName: route.projectName,
    workspacePath: route.workspacePath,
    channelIds: route.channelIds,
    allowedUsers: route.allowedUsers,
    agent: route.agent
  }
  const previousRoute = local.routes.find((item) => item.projectKey === route.projectKey)
  const previousTokens = previousRoute ? getResearchSlackTokens() : null
  const previousBackground = local.background.enabled
  if (previousRoute) {
    await removeResearchSlackRoute(route.projectKey)
    await clearResearchSlackCredentials()
    await stopDesktopSlackBridge()
  }
  try {
    return await command(
      host.id,
      ['slack', 'project', 'setup'],
      JSON.stringify({
        ...serverRoute,
        ...(input.appToken ? { appToken: input.appToken, botToken: input.botToken } : {}),
        expectedRuntimeId: route.runtimeId
      })
    )
  } catch (error) {
    if (previousRoute) {
      if (previousTokens) {
        await setResearchSlackCredentials(previousTokens.appToken, previousTokens.botToken)
      }
      upsertResearchSlackRoute(previousRoute)
      if (previousBackground) {
        await setResearchSlackBackground(true)
      }
    }
    throw error
  }
}

export async function removeRemoteResearchSlackProject(input: {
  executionHostId: string
  projectKey: string
}): Promise<SlackRemoteProjectStatus> {
  return command(input.executionHostId, [
    'slack',
    'project',
    'remove',
    '--project-key',
    input.projectKey
  ])
}
