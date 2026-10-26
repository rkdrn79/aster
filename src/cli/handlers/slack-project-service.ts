import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { z } from 'zod'
import { upsertSlackProjectRoute } from '../../shared/slack-project-route-binding'
import { slackProjectRouteId } from '../../shared/slack-project-route-binding'
import type { SlackProjectBackgroundTasks } from '../../shared/slack-project-connection'
import { writeSecureFile } from '../../shared/secure-file'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { readSlackBridgeLease, slackBridgeLeasePath } from '../slack-bridge-lease'
import { readState } from '../slack-bridge-state'
import {
  installSlackBridgeService,
  readSlackBridgeServiceStatus,
  uninstallSlackBridgeService
} from '../slack-bridge-service'
import { resolveSlackServiceCommand, slackServiceDeps } from '../slack-service-host'
import {
  deleteSlackServiceTokens,
  readSlackServiceTokens,
  writeSlackServiceTokens
} from '../slack-token-store'

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
const setupSchema = routeSchema.extend({
  appToken: z
    .string()
    .regex(/^xapp-[A-Za-z0-9-]+$/)
    .optional(),
  botToken: z
    .string()
    .regex(/^xoxb-[A-Za-z0-9-]+$/)
    .optional(),
  expectedRuntimeId: z.string().min(1)
})
const configSchema = z.object({ version: z.literal(1), routes: z.array(routeSchema) }).strict()
type ServerRoute = z.infer<typeof routeSchema>

function routeFile(userDataPath: string): string {
  return join(userDataPath, 'slack', 'server-projects-v1.json')
}

function readRoutes(path: string): ServerRoute[] {
  try {
    return configSchema.parse(JSON.parse(readFileSync(path, 'utf8'))).routes
  } catch (error) {
    if (error instanceof Error && Reflect.get(error, 'code') === 'ENOENT') {
      return []
    }
    throw error
  }
}

function saveRoutes(path: string, routes: readonly ServerRoute[]): void {
  if (!writeSecureFile(path, JSON.stringify({ version: 1, routes }), { durable: true })) {
    throw new Error('Could not save the server Slack project bindings')
  }
}

async function readInput(): Promise<unknown> {
  let body = ''
  for await (const chunk of process.stdin) {
    body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
    if (Buffer.byteLength(body) > 16_384) {
      throw new Error('Slack connection request is too large')
    }
  }
  return JSON.parse(body)
}

async function status(projectKey: string): Promise<Record<string, unknown>> {
  const deps = slackServiceDeps()
  const route = readRoutes(routeFile(deps.userDataPath)).find(
    (item) => item.projectKey === projectKey
  )
  const service = await readSlackBridgeServiceStatus(deps)
  const tokens = await readSlackServiceTokens(deps)
  const lease = tokens
    ? readSlackBridgeLease(slackBridgeLeasePath(deps.userDataPath, tokens.appToken))
    : null
  return {
    configured: Boolean(route && tokens && service.installed),
    route: route ?? null,
    connection: lease?.connection ?? (service.installed ? 'disconnected' : 'disabled'),
    error:
      service.installed && service.verdict !== 'live'
        ? service.detail
        : lease?.connection === 'error'
          ? lease.notice
          : null,
    notice: lease?.notice ?? null,
    service: service.verdict,
    runtimeInstalled: service.runtimeInstalled
  }
}

export function readSlackProjectTasks(
  userDataPath: string,
  projectKey: string
): SlackProjectBackgroundTasks {
  const route = readRoutes(routeFile(userDataPath)).find((entry) => entry.projectKey === projectKey)
  if (!route) {
    return { projectKey, workspacePath: null, agent: null, sessions: [] }
  }
  const dir = join(userDataPath, 'slack')
  let files: string[]
  try {
    files = readdirSync(dir).filter((name) => /^bridge-[a-f0-9]{20}\.json$/.test(name))
  } catch (error) {
    if (error instanceof Error && Reflect.get(error, 'code') === 'ENOENT') {
      files = []
    } else {
      throw error
    }
  }
  const prefix = `${slackProjectRouteId(route)}:`
  const sessions = new Map<string, { channelId: string; threadTs: string; sessionId: string }>()
  for (const file of files) {
    let threads: Record<string, string>
    try {
      threads = readState(join(dir, file)).threads
    } catch {
      continue
    }
    for (const [key, sessionId] of Object.entries(threads)) {
      if (!key.startsWith(prefix)) {
        continue
      }
      const [teamId = '', channelId = '', threadTs = ''] = key.slice(prefix.length).split(':')
      if (
        !/^T[A-Z0-9]+$/.test(teamId) ||
        !route.channelIds.includes(channelId) ||
        !/^\d+\.\d+$/.test(threadTs) ||
        !sessionId
      ) {
        continue
      }
      sessions.set(`${channelId}:${threadTs}`, {
        channelId,
        threadTs,
        sessionId
      })
    }
  }
  return {
    projectKey,
    workspacePath: route.workspacePath,
    agent: route.agent,
    sessions: [...sessions.values()]
      .sort((left, right) => Number(right.threadTs) - Number(left.threadTs))
      .slice(0, 100)
  }
}

async function assertRuntime(
  client: Parameters<CommandHandler>[0]['client'],
  expected: string
): Promise<void> {
  const response = await client.call<{ runtimeId: string }>('status.get')
  if (response.result.runtimeId !== expected) {
    throw new Error('The SSH host now runs a different Aster runtime; reconnect the project')
  }
}

export const SLACK_PROJECT_SERVICE_HANDLERS: Record<string, CommandHandler> = {
  'slack project setup': async ({ client }) => {
    if (client.isRemote) {
      throw new Error('Run Slack project setup on the project server')
    }
    const input = setupSchema.parse(await readInput())
    if (!isAbsolute(input.workspacePath)) {
      throw new Error('The project path must be absolute on this server')
    }
    await assertRuntime(client, input.expectedRuntimeId)
    const deps = slackServiceDeps(client.userDataPath)
    const path = routeFile(deps.userDataPath)
    const previousRoutes = readRoutes(path)
    const previousTokens = await readSlackServiceTokens(deps)
    if (Boolean(input.appToken) !== Boolean(input.botToken)) {
      throw new Error('Enter both Slack tokens or leave both empty to keep the server bot')
    }
    const tokens =
      input.appToken && input.botToken
        ? { appToken: input.appToken, botToken: input.botToken }
        : previousTokens
    if (!tokens) {
      throw new Error('Enter Slack app and bot tokens for this server')
    }
    const {
      appToken: _appToken,
      botToken: _botToken,
      expectedRuntimeId: _expectedRuntimeId,
      ...route
    } = input
    const nextRoutes = upsertSlackProjectRoute(previousRoutes, route).map((item) =>
      routeSchema.parse(item)
    )
    if (
      previousRoutes.some((item) => item.projectKey !== route.projectKey) &&
      previousTokens &&
      (previousTokens.appToken !== tokens.appToken || previousTokens.botToken !== tokens.botToken)
    ) {
      throw new Error('Other projects on this server use a different Slack bot')
    }
    if (deps.platform === 'linux') {
      const linger = await deps.run('loginctl', ['enable-linger', String(deps.uid)])
      if (linger.code !== 0) {
        throw new Error(
          `Could not enable this server user's background services after logout: ${linger.stderr.trim() || 'loginctl enable-linger failed'}`
        )
      }
    }
    try {
      saveRoutes(path, nextRoutes)
      await writeSlackServiceTokens(tokens, deps)
      await installSlackBridgeService(deps, resolveSlackServiceCommand(null, deps), [
        '--routes-file',
        path
      ])
    } catch (error) {
      const restoreRoutes = previousRoutes.length
        ? () => saveRoutes(path, previousRoutes)
        : () => rmSync(path, { force: true })
      restoreRoutes()
      await (previousTokens
        ? writeSlackServiceTokens(previousTokens, deps)
        : deleteSlackServiceTokens(deps))
      throw error
    }
    console.log(JSON.stringify({ ok: true, result: await status(route.projectKey) }))
  },
  'slack project status': async ({ flags }) => {
    const projectKey = getRequiredStringFlag(flags, 'project-key')
    console.log(JSON.stringify({ ok: true, result: await status(projectKey) }))
  },
  'slack project tasks': async ({ flags }) => {
    const projectKey = getRequiredStringFlag(flags, 'project-key')
    console.log(
      JSON.stringify({
        ok: true,
        result: readSlackProjectTasks(slackServiceDeps().userDataPath, projectKey)
      })
    )
  },
  'slack project rm': async ({ flags }) => {
    const projectKey = getRequiredStringFlag(flags, 'project-key')
    const deps = slackServiceDeps()
    const path = routeFile(deps.userDataPath)
    const routes = readRoutes(path).filter((item) => item.projectKey !== projectKey)
    if (routes.length) {
      saveRoutes(path, routes)
    } else {
      await uninstallSlackBridgeService(deps)
      await deleteSlackServiceTokens(deps)
      rmSync(path, { force: true })
    }
    console.log(JSON.stringify({ ok: true, result: await status(projectKey) }))
  }
}
