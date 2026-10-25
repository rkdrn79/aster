import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { z } from 'zod'
import type {
  SlackConnectionStatus,
  SlackProjectRoute
} from '../../shared/slack-project-connection'
import { upsertSlackProjectRoute } from '../../shared/slack-project-route-binding'
import { writeSecureFile } from '../../shared/secure-file'
import { guardedSafeStorage } from '../host/safe-storage-availability'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'

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

function credentials(config: Disk): { appToken: string; botToken: string } | null {
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

let current: Disk = empty
let loaded = false
let bridgeChild: ChildProcess | null = null
let running: Promise<void> | null = null
let generation = 0
let connection: SlackConnectionStatus['connection'] = 'disabled'
let lastError: string | null = null

export function getResearchSlackConnection(): SlackConnectionStatus {
  ensureLoaded()
  return {
    configured: current.encryptedCredentials !== null,
    connection,
    error: lastError,
    routes: current.routes.map((route) => ({
      ...route,
      channelIds: [...route.channelIds],
      allowedUsers: [...route.allowedUsers]
    }))
  }
}

function ensureLoaded(): void {
  if (loaded) {
    return
  }
  current = readConfig()
  loaded = true
}

function cliEntryPath(): string {
  const root = app.isPackaged ? join(process.resourcesPath, 'app.asar.unpacked') : app.getAppPath()
  return join(root, 'out', 'cli', 'index.js')
}

function stopChild(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, 3_000)
    timer.unref?.()
    child.once('close', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill()
  })
}

function startBridge(): void {
  ensureLoaded()
  const old = bridgeChild
  bridgeChild = null
  const previous = running
  const turn = ++generation
  connection = current.encryptedCredentials && current.routes.length ? 'connecting' : 'disabled'
  lastError = null
  running = (async () => {
    await stopChild(old)
    await previous
    if (turn !== generation || !current.encryptedCredentials || current.routes.length === 0) {
      return
    }
    const tokens = credentials(current)
    if (!tokens) {
      return
    }
    const cliEntry = cliEntryPath()
    if (!existsSync(cliEntry)) {
      throw new Error('Aster CLI is missing from this build')
    }
    const child = spawn(
      process.execPath,
      [cliEntry, 'slack', 'bridge', '--routes-file', configPath()],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          ORCA_USER_DATA_PATH: getCanonicalUserDataPath(),
          ORCA_PAIRING_CODE: '',
          ORCA_REMOTE_PAIRING: '',
          SLACK_APP_TOKEN: tokens.appToken,
          SLACK_BOT_TOKEN: tokens.botToken
        }
      }
    )
    bridgeChild = child
    let output = ''
    child.stderr?.resume()
    child.stdout?.on('data', (data: Buffer) => {
      output += data.toString('utf8')
      if (output.length > 8_192) {
        output = output.slice(-8_192)
      }
      const lines = output.split('\n')
      output = lines.pop() ?? ''
      for (const line of lines) {
        if (turn !== generation || !line.startsWith('ASTER_SLACK_STATUS:')) {
          continue
        }
        const status = line.slice('ASTER_SLACK_STATUS:'.length)
        if (
          status === 'connecting' ||
          status === 'connected' ||
          status === 'disconnected' ||
          status === 'error'
        ) {
          connection = status
        }
      }
    })
    await new Promise<void>((resolve) => {
      child.once('error', (error) => {
        if (turn === generation) {
          connection = 'error'
          lastError = error.message
        }
        resolve()
      })
      child.once('close', (code) => {
        if (turn === generation) {
          connection = 'error'
          lastError = `Slack bridge exited (${code ?? 'unknown'})`
        }
        resolve()
      })
    })
    if (bridgeChild === child) {
      bridgeChild = null
    }
  })().catch((error: unknown) => {
    if (turn === generation) {
      connection = 'error'
      lastError = error instanceof Error ? error.message : 'Slack connection failed'
    }
  })
}

export function startResearchSlackConnection(): void {
  try {
    startBridge()
  } catch (error) {
    connection = 'error'
    lastError = error instanceof Error ? error.message : 'Slack settings could not be loaded'
  }
}

export function stopResearchSlackConnection(): void {
  generation += 1
  void stopChild(bridgeChild)
  bridgeChild = null
  connection = 'disabled'
}

export function setResearchSlackCredentials(
  appToken: string,
  botToken: string
): SlackConnectionStatus {
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
  const next = { ...current, encryptedCredentials }
  saveConfig(next)
  current = next
  startBridge()
  return getResearchSlackConnection()
}

export function clearResearchSlackCredentials(): SlackConnectionStatus {
  ensureLoaded()
  const next = { ...current, encryptedCredentials: null }
  saveConfig(next)
  current = next
  startBridge()
  return getResearchSlackConnection()
}

export function upsertResearchSlackRoute(routeInput: SlackProjectRoute): SlackConnectionStatus {
  ensureLoaded()
  const route = routeSchema.parse(routeInput)
  const next = {
    ...current,
    routes: upsertSlackProjectRoute(current.routes, route)
  }
  saveConfig(next)
  current = next
  startBridge()
  return getResearchSlackConnection()
}

export function removeResearchSlackRoute(projectKey: string): SlackConnectionStatus {
  ensureLoaded()
  const next = {
    ...current,
    routes: current.routes.filter((item) => item.projectKey !== projectKey)
  }
  saveConfig(next)
  current = next
  startBridge()
  return getResearchSlackConnection()
}
