import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { z } from 'zod'
import { readSlackBridgeLease, slackBridgeLeasePath } from '../../cli/slack-bridge-lease'
import type { SlackTokens } from '../../cli/slack-token-store'
import type {
  SlackConnectionStatus,
  SlackProjectRoute
} from '../../shared/slack-project-connection'
import { upsertSlackProjectRoute } from '../../shared/slack-project-route-binding'
import { resolveEnvironment } from '../../shared/runtime-environment-store'
import {
  assertSlackRouteLifetimeCompatible,
  slackBackgroundRouteBlocker
} from '../../shared/slack-route-lifetime'
import { writeSecureFile } from '../../shared/secure-file'
import { guardedSafeStorage } from '../host/safe-storage-availability'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import {
  disableSlackBackground,
  enableSlackBackground,
  readSlackBackgroundConfig,
  refreshSlackBackgroundTokens,
  slackBackgroundUnavailableReason
} from './research-slack-background'
import { backgroundHost } from './research-slack-background-host'
import {
  desktopSlackBridgeStatus,
  restartDesktopSlackBridge,
  stopDesktopSlackBridge
} from './research-slack-desktop-bridge'

const routeSchema = z
  .object({
    projectKey: z.string().min(1).max(256),
    projectName: z.string().min(1).max(160),
    workspacePath: z.string().min(1).max(4096),
    executionHostId: z.string().min(1).max(256).optional(),
    workspaceId: z.string().min(1).max(4096).optional(),
    environmentId: z.string().min(1).max(256).optional(),
    hostKeyFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    runtimeId: z.string().min(1).max(256).optional(),
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
const diskSchema = z
  .object({
    version: z.literal(1),
    encryptedCredentials: z.string().nullable(),
    routes: z.array(routeSchema)
  })
  .strict()
type Disk = z.infer<typeof diskSchema>
const empty: Disk = { version: 1, encryptedCredentials: null, routes: [] }

function configPath(): string {
  return join(getCanonicalUserDataPath(), 'slack', 'connection-v1.json')
}

function readConfig(): Disk {
  try {
    return diskSchema.parse(JSON.parse(readFileSync(configPath(), 'utf8')))
  } catch (error) {
    if (error instanceof Error && Reflect.get(error, 'code') === 'ENOENT') {
      return empty
    }
    throw error
  }
}

function saveConfig(config: Disk): void {
  if (!writeSecureFile(configPath(), JSON.stringify(config), { durable: true })) {
    throw new Error('Slack settings could not be saved with restricted file permissions')
  }
}

function credentials(config: Disk): SlackTokens | null {
  if (!config.encryptedCredentials) {
    return null
  }
  if (!guardedSafeStorage.isEncryptionAvailable()) {
    throw new Error('Protected credential storage is unavailable on this host')
  }
  const parsed: unknown = JSON.parse(
    guardedSafeStorage.decryptString(Buffer.from(config.encryptedCredentials, 'base64'))
  )
  return z.object({ appToken: z.string(), botToken: z.string() }).strict().parse(parsed)
}

/** Internal migration snapshot; never exposed through IPC. */
export function getResearchSlackTokens(): SlackTokens | null {
  ensureLoaded()
  return credentials(current)
}

let current: Disk = empty
let loaded = false
let leaseFile: string | null = null
let loadError: string | null = null

function ensureLoaded(): void {
  if (loaded) {
    return
  }
  current = readConfig()
  loaded = true
}

function backgroundEnabled(): boolean {
  return readSlackBackgroundConfig(getCanonicalUserDataPath()).enabled
}

function backgroundRouteBlocker(routes: readonly SlackProjectRoute[]): string | null {
  return slackBackgroundRouteBlocker(
    routes,
    (environmentId) =>
      resolveEnvironment(getCanonicalUserDataPath(), environmentId).connectionDependency
  )
}

function liveLease(): ReturnType<typeof readSlackBridgeLease> {
  if (!leaseFile && current.encryptedCredentials) {
    try {
      const tokens = credentials(current)
      leaseFile = tokens ? slackBridgeLeasePath(getCanonicalUserDataPath(), tokens.appToken) : null
    } catch {
      return null
    }
  }
  return leaseFile ? readSlackBridgeLease(leaseFile) : null
}

export function getResearchSlackConnection(): SlackConnectionStatus {
  ensureLoaded()
  const background = readSlackBackgroundConfig(getCanonicalUserDataPath())
  const desktop = desktopSlackBridgeStatus()
  const holder = liveLease()
  const owner = !holder
    ? null
    : holder.pid === desktop.pid
      ? 'app'
      : holder.mode === 'service'
        ? 'service'
        : 'other'
  return {
    configured: current.encryptedCredentials !== null,
    // Why from the lease: with the service on, the app has no child to ask.
    connection: background.enabled ? (holder?.connection ?? 'disconnected') : desktop.connection,
    error: loadError ?? (background.enabled ? null : desktop.error),
    routes: current.routes.map((route) => ({
      ...route,
      channelIds: [...route.channelIds],
      allowedUsers: [...route.allowedUsers]
    })),
    owner,
    notice: holder?.notice ?? null,
    background: {
      unavailableReason:
        backgroundRouteBlocker(current.routes) ??
        slackBackgroundUnavailableReason({
          platform: process.platform,
          isPackaged: app.isPackaged
        }),
      enabled: background.enabled,
      installedRuntime: background.installedRuntime
    }
  }
}

/** One Socket Mode connection per token: the app connects only while the service is off. */
function startBridge(): void {
  ensureLoaded()
  restartDesktopSlackBridge({
    routesFile: configPath(),
    userDataPath: getCanonicalUserDataPath(),
    tokens: () => (current.routes.length > 0 && !backgroundEnabled() ? credentials(current) : null)
  })
}

export function startResearchSlackConnection(): void {
  try {
    loadError = null
    startBridge()
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Slack settings could not be loaded'
  }
}

export function stopResearchSlackConnection(): void {
  void stopDesktopSlackBridge()
}

function save(next: Disk): void {
  saveConfig(next)
  current = next
  leaseFile = null
}

export async function setResearchSlackBackground(enabled: boolean): Promise<SlackConnectionStatus> {
  ensureLoaded()
  if (!enabled) {
    await disableSlackBackground(backgroundHost())
    startBridge()
    return getResearchSlackConnection()
  }
  const tokens = credentials(current)
  if (!tokens || current.routes.length === 0) {
    throw new Error('Connect the Slack bot and bind a channel before keeping it connected')
  }
  const routeBlocker = backgroundRouteBlocker(current.routes)
  if (routeBlocker) {
    throw new Error(routeBlocker)
  }
  // Why stop first: the service must not open a second socket while the app's is still up.
  await stopDesktopSlackBridge()
  try {
    await enableSlackBackground(backgroundHost(), tokens, configPath())
  } finally {
    startBridge()
  }
  return getResearchSlackConnection()
}

export async function setResearchSlackCredentials(
  appToken: string,
  botToken: string
): Promise<SlackConnectionStatus> {
  ensureLoaded()
  if (!/^xapp-\S+$/.test(appToken) || !/^xoxb-\S+$/.test(botToken)) {
    throw new Error('Enter Slack-issued xapp and xoxb tokens')
  }
  if (!guardedSafeStorage.isEncryptionAvailable()) {
    throw new Error('Protected credential storage is unavailable on this host')
  }
  const encryptedCredentials = guardedSafeStorage
    .encryptString(JSON.stringify({ appToken, botToken }))
    .toString('base64')
  save({ ...current, encryptedCredentials })
  if (backgroundEnabled()) {
    await refreshSlackBackgroundTokens(backgroundHost(), { appToken, botToken })
  }
  startBridge()
  return getResearchSlackConnection()
}

export async function clearResearchSlackCredentials(): Promise<SlackConnectionStatus> {
  ensureLoaded()
  save({ ...current, encryptedCredentials: null })
  if (backgroundEnabled()) {
    await disableSlackBackground(backgroundHost())
  }
  startBridge()
  return getResearchSlackConnection()
}

export function upsertResearchSlackRoute(routeInput: SlackProjectRoute): SlackConnectionStatus {
  ensureLoaded()
  const route = routeSchema.parse(routeInput)
  assertSlackRouteLifetimeCompatible(
    [route],
    backgroundEnabled(),
    (environmentId) =>
      resolveEnvironment(getCanonicalUserDataPath(), environmentId).connectionDependency
  )
  // Why no service restart: the service rereads this file when it changes.
  save({ ...current, routes: upsertSlackProjectRoute(current.routes, route) })
  startBridge()
  return getResearchSlackConnection()
}

export async function removeResearchSlackRoute(projectKey: string): Promise<SlackConnectionStatus> {
  ensureLoaded()
  save({ ...current, routes: current.routes.filter((item) => item.projectKey !== projectKey) })
  if (current.routes.length === 0 && backgroundEnabled()) {
    await disableSlackBackground(backgroundHost())
  }
  startBridge()
  return getResearchSlackConnection()
}
