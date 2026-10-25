import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { SlackIncomingMessage } from './slack-events'

export type BridgeState = { version: 1; threads: Record<string, string>; processed: string[] }

export function statePath(userDataPath: string, teamId: string, botUserId: string): string {
  const digest = createHash('sha256').update(`${teamId}\0${botUserId}`).digest('hex').slice(0, 20)
  return join(userDataPath, 'slack', `bridge-${digest}.json`)
}

export function readState(path: string): BridgeState {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (value && typeof value === 'object') {
      const state = value as BridgeState
      if (
        state.version === 1 &&
        state.threads &&
        typeof state.threads === 'object' &&
        !Array.isArray(state.threads) &&
        Object.values(state.threads).every((sessionId) => typeof sessionId === 'string') &&
        Array.isArray(state.processed) &&
        state.processed.every((eventId) => typeof eventId === 'string')
      ) {
        return state
      }
    }
    throw new Error(`Unsupported Slack bridge state at ${path}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, threads: {}, processed: [] }
    }
    throw error
  }
}

export function saveState(path: string, state: BridgeState): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 })
  renameSync(temporary, path)
}

export function operationId(message: SlackIncomingMessage): string {
  const timestamp = Math.trunc(Number(message.eventTs.split('.')[0]) * 1000).toString()
  const digest = createHash('sha256').update(message.eventId).digest('hex').slice(0, 32)
  return `${timestamp}-${digest}`
}

export function threadKey(message: SlackIncomingMessage, routeId: string): string {
  return `${routeId}:${message.teamId}:${message.channel}:${message.threadTs}`
}
