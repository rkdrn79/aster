import type { ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnProcess } from '@orca/process-host'
import { app } from 'electron'
import type { SlackTokens } from '../../cli/slack-token-store'
import type { SlackConnectionStatus } from '../../shared/slack-project-connection'

type Connection = SlackConnectionStatus['connection']
const STATUSES: readonly string[] = ['connecting', 'connected', 'disconnected', 'error', 'standby']

function isBridgeStatus(value: string | null): value is Connection {
  return value !== null && STATUSES.includes(value)
}

let bridgeChild: ChildProcess | null = null
let running: Promise<void> | null = null
let generation = 0
let connection: Connection = 'disabled'
let lastError: string | null = null

export function desktopSlackBridgeStatus(): {
  connection: Connection
  error: string | null
  pid: number | null
} {
  return { connection, error: lastError, pid: bridgeChild?.pid ?? null }
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

/**
 * Replaces the app's own bridge child. `tokens` returns null when the app must not connect
 * (no bot, no binding, or the background service owns the connection).
 */
export function restartDesktopSlackBridge(input: {
  routesFile: string
  userDataPath: string
  tokens: () => SlackTokens | null
}): void {
  const old = bridgeChild
  bridgeChild = null
  const previous = running
  const turn = ++generation
  connection = 'connecting'
  lastError = null
  running = (async () => {
    await stopChild(old)
    await previous
    const tokens = turn === generation ? input.tokens() : null
    if (!tokens) {
      if (turn === generation) {
        connection = 'disabled'
      }
      return
    }
    const cliEntry = cliEntryPath()
    if (!existsSync(cliEntry)) {
      throw new Error('Aster CLI is missing from this build')
    }
    const child = spawnProcess({
      program: process.execPath,
      args: [cliEntry, 'slack', 'bridge', '--routes-file', input.routesFile],
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        ORCA_USER_DATA_PATH: input.userDataPath,
        ORCA_PAIRING_CODE: '',
        ORCA_REMOTE_PAIRING: '',
        SLACK_APP_TOKEN: tokens.appToken,
        SLACK_BOT_TOKEN: tokens.botToken
      }
    })
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
        const status = line.startsWith('ASTER_SLACK_STATUS:')
          ? line.slice('ASTER_SLACK_STATUS:'.length)
          : null
        if (turn === generation && isBridgeStatus(status)) {
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

/** Stops the app's bridge and waits until its socket is gone. */
export async function stopDesktopSlackBridge(): Promise<void> {
  generation += 1
  const child = bridgeChild
  bridgeChild = null
  connection = 'disabled'
  await stopChild(child)
  await running
}
