/**
 * Updating the managed servers (orcad on SSH hosts) to the build this app bundles, on their own:
 * the policy a user picks, globally and per host, and the per-host status the desktop reports.
 *
 * `idle` updates a host only while no chat agent on it is working; `ask` only offers the update;
 * `off` never touches the host's version.
 */

export const SERVER_AUTO_UPDATE_MODES = ['idle', 'ask', 'off'] as const
export type ServerAutoUpdateMode = (typeof SERVER_AUTO_UPDATE_MODES)[number]

export const DEFAULT_SERVER_AUTO_UPDATE_MODE: ServerAutoUpdateMode = 'idle'

export type ServerAutoUpdateSettings = {
  /** Whether managed SSH servers update to this app's build on their own; absent reads as `idle`. */
  serverAutoUpdate?: ServerAutoUpdateMode
}

export function isServerAutoUpdateMode(value: unknown): value is ServerAutoUpdateMode {
  return SERVER_AUTO_UPDATE_MODES.some((mode) => mode === value)
}

/** A stored value, or undefined when it is absent or unknown (an unknown value never means off). */
export function normalizeServerAutoUpdateMode(value: unknown): ServerAutoUpdateMode | undefined {
  return isServerAutoUpdateMode(value) ? value : undefined
}

/** The host's own choice wins; a host without one follows the global setting. */
export function resolveServerAutoUpdateMode(
  globalMode: unknown,
  hostMode: unknown
): { mode: ServerAutoUpdateMode; source: 'global' | 'host' } {
  const host = normalizeServerAutoUpdateMode(hostMode)
  if (host) {
    return { mode: host, source: 'host' }
  }
  return {
    mode: normalizeServerAutoUpdateMode(globalMode) ?? DEFAULT_SERVER_AUTO_UPDATE_MODE,
    source: 'global'
  }
}

/** Why an update that is due has not run yet. */
export type ServerAutoUpdateWait =
  | { reason: 'agents-working'; agents: number }
  /** Terminals that the update cannot prove it would carry across (not merely running ones). */
  | { reason: 'terminals'; detail: string }
  | { reason: 'unreachable'; detail: string }
  /** The user chose "ask first": the update waits for their Update now. */
  | { reason: 'ask' }
  | { reason: 'other'; detail: string }

export type ServerAutoUpdatePhase =
  | 'checking'
  | 'up-to-date'
  | 'waiting'
  | 'updating'
  | 'updated'
  | 'failed'
  | 'off'
  /** Nothing to compare yet: the host has not been reached during this launch. */
  | 'unknown'

/** What the update did about a Slack bridge supervising the host's server. */
export type ServerAutoUpdateSlackBridge = {
  /**
   * `follows`: its code stands down during an update and moves to the new version itself.
   * `old`: its code would restart the old server mid-update, so the update pauses it meanwhile.
   */
  kind: 'follows' | 'old'
  /** The systemd user unit that runs it, when the host names one. */
  unit: string | null
}

export type ServerAutoUpdateHostStatus = {
  environmentId: string
  sshTargetId: string
  hostLabel: string
  mode: ServerAutoUpdateMode
  modeSource: 'global' | 'host'
  activeVersion: string | null
  bundledVersion: string | null
  phase: ServerAutoUpdatePhase
  wait?: ServerAutoUpdateWait & { since: string }
  /** When an update this launch landed, and from which version. */
  updatedAt?: string
  updatedFrom?: string | null
  /** Why the last update failed; the old version kept serving. */
  failure?: string
  /** Chats an update cut off and that were continued after it. */
  resumedChats?: number
  slackBridge?: ServerAutoUpdateSlackBridge
  checkedAt?: string
}

export type ServerAutoUpdateNowResult =
  | { outcome: 'updated'; activeVersion: string; resumedChats: number }
  | { outcome: 'already-current'; activeVersion: string }
  | { outcome: 'deferred' | 'failed'; reason: string }

/** The one-line command that restarts a Slack bridge unit, for a user to run on the host. */
export function slackBridgeRestartCommand(unit: string): string {
  return `systemctl --user restart ${unit}`
}

/** The English waiting line, for logs and the trace; the UI words it through its catalog. */
export function describeAgentsWorking(agents: number, hostLabel: string): string {
  return `${agents} agent${agents === 1 ? '' : 's'} working on ${hostLabel}`
}
