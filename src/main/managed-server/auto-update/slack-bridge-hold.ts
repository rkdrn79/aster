/**
 * A Slack bridge (`aster slack bridge --service`) supervises the host's server and, in builds
 * before it learned to follow updates, starts the recorded version again the moment that server
 * stops. Mid-update that is the OLD version, so the update could never finish
 * (`orcad_outgoing_stop_incomplete`).
 *
 * A bridge whose code follows updates leaves `<root>/.slack-bridge-follow/<pid>`; it is left
 * alone. An older one is paused with SIGSTOP for the activation and continued after it. Neither
 * touches the service manager: no systemctl runs from the app. A host-side watchdog continues the
 * bridge on its own if this desktop goes away mid-update, so it is never left frozen.
 */
import { quotePosixShell } from '../../../shared/shell-argument-quoting'
import { SLACK_BRIDGE_FOLLOW_DIRNAME } from '../../../shared/slack-bridge-update-follow'
import type { ServerAutoUpdateSlackBridge } from '../../../shared/server-auto-update'
import {
  execOrcadRemote,
  type OrcadRemoteExecTarget
} from '../install/orcad-remote-runtime-control'
import { orcadRemoteBaseDir } from '../install/orcad-remote-windows-node'
import { isWindowsRemoteHost } from '../../ssh/ssh-remote-platform'

export type SlackBridgeProcess = ServerAutoUpdateSlackBridge & { pid: number }

const PROBE_LINE = 'ASTER_SLACK_BRIDGE'
const PROBE_DONE = 'ASTER_SLACK_BRIDGE_PROBE_DONE'
const HOLD_DIRNAME = '.slack-bridge-hold'

/** Longer than any activation (stop wait, snapshot, candidate readiness) plus its slack. */
export const SLACK_BRIDGE_PAUSE_WATCHDOG_SECONDS = 600

/**
 * Lists this user's bridge processes that run a CLI from one of this root's server slots, and
 * whether each follows updates. A bridge of a desktop profile on the same machine is not this
 * server's supervisor and is left out. The words are split so the probe's own shell, whose
 * arguments carry this script, never matches itself.
 */
export function slackBridgeProbeCommand(root: string): string {
  return [
    `root=${quotePosixShell(root)}; real=$(cd "$root" 2>/dev/null && pwd -P) || real=$root;`,
    'a=slack; b=bridge; s=--service;',
    'ps -u "$(id -u)" -o pid= -o args= 2>/dev/null | while read -r pid args; do',
    'case "$args" in *"$root/orcad-"*" $a $b"*"$s"*|*"$real/orcad-"*" $a $b"*"$s"*) ;;',
    '*) continue ;; esac;',
    `if [ -f "$root/${SLACK_BRIDGE_FOLLOW_DIRNAME}/$pid" ]; then kind=follows; else kind=old; fi;`,
    // Why the cgroup: it names the systemd unit without asking systemctl anything.
    `unit=$(sed -n "s#.*/\\([^/]*-$a-$b[^/]*\\.service\\).*#\\1#p" "/proc/$pid/cgroup" 2>/dev/null | head -n 1);`,
    `echo "${PROBE_LINE} $pid $kind \${unit:--}";`,
    'done;',
    `echo ${PROBE_DONE}`
  ].join(' ')
}

/** Null when the probe did not finish: an unanswered host is not a host without a bridge. */
export function parseSlackBridgeProbe(output: string): SlackBridgeProcess[] | null {
  const lines = output.split(/\r?\n/u).map((line) => line.trim())
  if (!lines.includes(PROBE_DONE)) {
    return null
  }
  const bridges: SlackBridgeProcess[] = []
  for (const line of lines) {
    const match = /^ASTER_SLACK_BRIDGE (\d+) (follows|old) (\S+)$/u.exec(line)
    if (match) {
      bridges.push({
        pid: Number(match[1]),
        kind: match[2] === 'follows' ? 'follows' : 'old',
        unit: match[3] === '-' ? null : match[3]!
      })
    }
  }
  return bridges
}

function holdFile(pid: number): string {
  return `"$root/${HOLD_DIRNAME}/${pid}"`
}

/**
 * Pauses each bridge and arms its watchdog. The watchdog continues the bridge only while the
 * hold file stays, so a resume that already ran never signals a reused pid later.
 */
export function slackBridgePauseCommand(
  root: string,
  pids: readonly number[],
  watchdogSeconds = SLACK_BRIDGE_PAUSE_WATCHDOG_SECONDS
): string {
  const each = pids.map((pid) =>
    [
      `f=${holdFile(pid)}; : > "$f" &&`,
      `kill -STOP ${pid} 2>/dev/null && {`,
      // Why a polling loop: a resume removes the file, and the watchdog then exits within a second.
      `w="i=0; while [ \\$i -lt ${watchdogSeconds} ] && [ -f '$f' ]; do sleep 1; i=\\$((i + 1)); done;`,
      `[ -f '$f' ] && kill -CONT ${pid}; rm -f '$f'";`,
      // Why detached: the watchdog must outlive this SSH command and its session.
      'if command -v setsid >/dev/null 2>&1; then setsid sh -c "$w" </dev/null >/dev/null 2>&1 &',
      'else nohup sh -c "$w" </dev/null >/dev/null 2>&1 & fi;',
      `echo "ASTER_SLACK_BRIDGE_PAUSED ${pid}"; } ||`,
      `{ rm -f "$f"; echo "ASTER_SLACK_BRIDGE_PAUSE_FAILED ${pid}"; };`
    ].join(' ')
  )
  return [
    `root=${quotePosixShell(root)};`,
    `mkdir -p "$root/${HOLD_DIRNAME}" && chmod 700 "$root/${HOLD_DIRNAME}";`,
    ...each
  ].join(' ')
}

export function slackBridgeResumeCommand(root: string, pids: readonly number[]): string {
  return [
    `root=${quotePosixShell(root)};`,
    ...pids.map(
      (pid) =>
        `rm -f ${holdFile(pid)}; kill -CONT ${pid} 2>/dev/null; echo "ASTER_SLACK_BRIDGE_RESUMED ${pid}";`
    )
  ].join(' ')
}

export function parsePausedSlackBridges(output: string): number[] {
  return [...output.matchAll(/ASTER_SLACK_BRIDGE_PAUSED (\d+)/gu)].map((match) => Number(match[1]))
}

export type SlackBridgeHold = {
  /** Every bridge found, old and following; null when the host did not answer the probe. */
  bridges: SlackBridgeProcess[] | null
  paused: number[]
  release: () => Promise<void>
}

/** Pauses the old bridges for the duration of an activation; `release` continues them. */
export async function holdOldSlackBridges(
  exec: (command: string) => Promise<string>,
  root: string
): Promise<SlackBridgeHold> {
  const bridges = parseSlackBridgeProbe(await exec(slackBridgeProbeCommand(root)))
  const old = (bridges ?? []).filter((bridge) => bridge.kind === 'old').map((bridge) => bridge.pid)
  const paused =
    old.length > 0 ? parsePausedSlackBridges(await exec(slackBridgePauseCommand(root, old))) : []
  let released = false
  return {
    bridges,
    paused,
    release: async () => {
      if (released || paused.length === 0) {
        return
      }
      released = true
      await exec(slackBridgeResumeCommand(root, paused))
    }
  }
}

export type SlotSlackBridgeHold = {
  /** The bridge to report: an old one when any is found, else one that follows. */
  summary: ServerAutoUpdateSlackBridge | undefined
  release: () => Promise<void>
}

const NO_HOLD: SlotSlackBridgeHold = { summary: undefined, release: async () => {} }

/**
 * The hold for a slot's host. A probe that fails leaves the bridges as they are: an old one may
 * then fail the activation, which restores the incumbent, so nothing is lost by trying.
 */
export async function holdSlotSlackBridges(
  target: OrcadRemoteExecTarget & { remoteHome: string }
): Promise<SlotSlackBridgeHold> {
  try {
    if (isWindowsRemoteHost(target.host)) {
      return NO_HOLD
    }
    const hold = await holdOldSlackBridges(
      (command) => execOrcadRemote(target, command),
      orcadRemoteBaseDir(target.host, target.remoteHome)
    )
    const shown = hold.bridges?.find((bridge) => bridge.kind === 'old') ?? hold.bridges?.[0]
    return {
      summary: shown ? { kind: shown.kind, unit: shown.unit } : undefined,
      release: hold.release
    }
  } catch (error) {
    console.warn('[server-auto-update] Could not check the Slack bridge before the update:', error)
    return NO_HOLD
  }
}

/** Runs `run` with the slot's old Slack bridges paused; they continue whatever `run` does. */
export async function withSlotSlackBridgesHeld<T>(
  target: OrcadRemoteExecTarget & { remoteHome: string },
  run: () => Promise<T>
): Promise<T> {
  const bridges = await holdSlotSlackBridges(target)
  try {
    return await run()
  } finally {
    await bridges.release().catch((error: unknown) => {
      console.warn('[server-auto-update] Could not continue the Slack bridge:', error)
    })
  }
}
