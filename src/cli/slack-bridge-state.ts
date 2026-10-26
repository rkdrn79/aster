import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { SlackIncomingMessage } from './slack-events'

/**
 * `processed` holds message keys (`channel:ts`); older bridges wrote event IDs there, which stay
 * harmless. `cursors` is optional so a state file stays readable by bridges without catch-up.
 */
export type BridgeState = {
  version: 1
  threads: Record<string, string>
  processed: string[]
  /** Per channel: the newest Slack ts this bridge has examined live or through catch-up. */
  cursors?: Record<string, string>
}

const PROCESSED_LIMIT = 2_000

export function statePath(userDataPath: string, teamId: string, botUserId: string): string {
  const digest = createHash('sha256').update(`${teamId}\0${botUserId}`).digest('hex').slice(0, 20)
  return join(userDataPath, 'slack', `bridge-${digest}.json`)
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === 'string')
  )
}

export function readState(path: string): BridgeState {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (value && typeof value === 'object') {
      const state = value as BridgeState
      if (
        state.version === 1 &&
        isStringRecord(state.threads) &&
        Array.isArray(state.processed) &&
        state.processed.every((eventId) => typeof eventId === 'string') &&
        (state.cursors === undefined || isStringRecord(state.cursors))
      ) {
        return state
      }
    }
    throw new Error(`Unsupported Slack bridge state at ${path}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, threads: {}, processed: [], cursors: {} }
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

/** Records a handled message key in insertion order, dropping the oldest past the cap. */
export function rememberProcessed(seen: Set<string>, key: string): string[] {
  seen.delete(key)
  seen.add(key)
  while (seen.size > PROCESSED_LIMIT) {
    const oldest = seen.values().next().value
    if (oldest === undefined) {
      break
    }
    seen.delete(oldest)
  }
  return [...seen]
}

export function operationId(message: SlackIncomingMessage): string {
  const timestamp = Math.trunc(Number(message.eventTs.split('.')[0]) * 1000).toString()
  const digest = createHash('sha256').update(message.eventId).digest('hex').slice(0, 32)
  return `${timestamp}-${digest}`
}

export function threadKey(message: SlackIncomingMessage, routeId: string): string {
  return `${routeId}:${message.teamId}:${message.channel}:${message.threadTs}`
}

/** Thread timestamps this route already has an Aster conversation for, newest first. */
export function knownThreads(
  threads: Record<string, string>,
  routeId: string,
  channel: string
): string[] {
  const prefix = `${routeId}:`
  return Object.keys(threads)
    .filter((key) => key.startsWith(prefix) && key.split(':')[2] === channel)
    .map((key) => key.split(':')[3] ?? '')
    .filter((ts) => /^\d+\.\d+$/.test(ts))
    .sort((left, right) => compareSlackTs(right, left))
}

/** Slack timestamps are `seconds.micros`; compare numerically without float rounding. */
export function compareSlackTs(left: string, right: string): number {
  const [leftSeconds = '0', leftMicros = '0'] = left.split('.')
  const [rightSeconds = '0', rightMicros = '0'] = right.split('.')
  return (
    Number(leftSeconds) - Number(rightSeconds) ||
    Number(leftMicros.padEnd(6, '0')) - Number(rightMicros.padEnd(6, '0'))
  )
}

export function slackTsFromMs(ms: number): string {
  return `${Math.floor(ms / 1000)}.${String((ms % 1000) * 1000).padStart(6, '0')}`
}
