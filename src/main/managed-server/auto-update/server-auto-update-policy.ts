/**
 * The server-update scheduler's contract and the words it logs: what it asks of the desktop, the
 * results it reads back, and how long a waiting host waits before the next look.
 */
import {
  describeAgentsWorking,
  type ServerAutoUpdateHostStatus,
  type ServerAutoUpdateMode,
  type ServerAutoUpdateSlackBridge,
  type ServerAutoUpdateWait
} from '../../../shared/server-auto-update'
import type { ServerChatActivity } from './server-chat-activity'

export type ServerAutoUpdateHost = {
  environmentId: string
  sshTargetId: string
  hostLabel: string
  mode: ServerAutoUpdateMode
  modeSource: 'global' | 'host'
}

export type ServerVersionCheck =
  /** Not connected now: nothing is compared, and the host's next connect checks again. */
  | { state: 'offline' }
  | { state: 'due' | 'current'; activeVersion: string | null; bundledVersion: string | null }
  /** The host's own reason not to take this build now (see `planManagedOrcadAutoUpdate`). */
  | {
      state: 'held'
      activeVersion: string | null
      bundledVersion: string | null
      why: HeldWhy
    }

export type HeldWhy = 'host-newer' | 'rolled-back' | 'failed-before' | 'migrating' | 'no-template'

/** How a host's own reason not to take this build reads on its status line. */
export function heldVersionStatus(
  why: HeldWhy,
  failure: string | undefined
): { phase: 'up-to-date' } | { phase: 'failed'; failure: string } | { wait: ServerAutoUpdateWait } {
  switch (why) {
    case 'host-newer':
    case 'no-template':
      return { phase: 'up-to-date' }
    case 'failed-before':
      return { phase: 'failed', failure: failure ?? 'The last update to this version failed.' }
    case 'rolled-back':
      return { wait: { reason: 'other', detail: ROLLED_BACK_DETAIL } }
    case 'migrating':
      return { wait: { reason: 'other', detail: MIGRATING_DETAIL } }
  }
}

/** What the scheduler learns from the activation's last look at the host, just before the stop. */
export type ServerUpdateHold = {
  /** Set when chats started after the first check; the incumbent keeps serving. */
  refusedAgents?: number
  /** Chats the stop may have cut, to continue afterwards. */
  mayCut: string[]
  slackBridge?: ServerAutoUpdateSlackBridge
}

export type ScheduledServerUpdate =
  | { outcome: 'updated'; activeVersion: string; previousVersion: string | null }
  | { outcome: 'current'; activeVersion: string | null }
  | { outcome: 'waiting'; wait: ServerAutoUpdateWait }
  | { outcome: 'failed'; reason: string }

export type ServerAutoUpdateSchedulerDeps = {
  now: () => Date
  setTimer: (run: () => void, ms: number) => () => void
  hosts: () => ServerAutoUpdateHost[]
  versions: (environmentId: string) => Promise<ServerVersionCheck>
  chats: (environmentId: string) => Promise<ServerChatActivity | null>
  /**
   * Runs the update. `hold` is asked under the host fence right before the stop; `refuse`
   * reports whether working chats should keep the old server running.
   */
  update: (
    environmentId: string,
    request: {
      intent: 'auto' | 'now'
      onUpdating: () => void
      hold: (refuseIfBusy: boolean) => Promise<ServerUpdateHold>
    }
  ) => Promise<ScheduledServerUpdate & { hold?: ServerUpdateHold }>
  resume: (environmentId: string, sessionIds: string[]) => Promise<number>
  publish: (statuses: ServerAutoUpdateHostStatus[]) => void
  trace: (event: string, attributes: Record<string, unknown>) => void
}

/** Short enough that a finished reply is followed soon, long enough not to load the host. */
export const AGENTS_RECHECK_MS = 60_000
export const UNREACHABLE_RECHECK_MS = 3 * 60_000
export const OTHER_RECHECK_MS = 10 * 60_000
/** Lets a connect finish and the transport settle before the host is probed. */
export const CONNECT_SETTLE_MS = 5_000

const ROLLED_BACK_DETAIL =
  'this server was rolled back from this version; use Update now to try it again'
const MIGRATING_DETAIL = 'a move into this server is still running'

export function recheckDelay(wait: ServerAutoUpdateWait): number {
  switch (wait.reason) {
    case 'agents-working':
      return AGENTS_RECHECK_MS
    case 'unreachable':
      return UNREACHABLE_RECHECK_MS
    case 'terminals':
    case 'ask':
    case 'other':
      return OTHER_RECHECK_MS
  }
}

export function waitText(wait: ServerAutoUpdateWait, hostLabel: string): string {
  switch (wait.reason) {
    case 'agents-working':
      return describeAgentsWorking(wait.agents, hostLabel)
    case 'ask':
      return 'waiting for Update now'
    case 'terminals':
    case 'unreachable':
    case 'other':
      return wait.detail
  }
}
