/**
 * Lets a Slack bridge on an SSH host stay out of the desktop's server update and then continue on
 * the new build. See src/shared/slack-bridge-update-follow.ts for the agreement with the desktop.
 */
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import {
  ORCAD_ACTIVATION_JOURNAL_DIRNAME,
  ORCAD_ACTIVATION_JOURNAL_STALE_MS,
  ORCAD_ACTIVE_RECORD_FILENAME,
  SLACK_BRIDGE_FOLLOW_DIRNAME
} from '../shared/slack-bridge-update-follow'

const ORCAD_VERSION_PATTERN = /^v?[0-9]+\.[0-9]+\.[0-9]+\+[0-9a-f]+$/
const FOLLOW_CHECK_MS = 15_000

export type ManagedSlot = { root: string; slotDir: string; version: string }

export type BridgeFollowTarget = { node: string; entry: string; version: string }

export type BridgeFollowPlan =
  | {
      action: 'stay'
      why: 'no-active-record' | 'same-version' | 'activation-in-progress' | 'incomplete-slot'
    }
  | ({ action: 'reexec' } & BridgeFollowTarget)

/** The CLI runs as `<root>/orcad-<version>/out/cli/index.js` when the SSH install put it there. */
export function managedSlotOfCli(argv1: string | undefined): ManagedSlot | null {
  if (!argv1) {
    return null
  }
  // On shared-home clusters the root is .orca-remote/hosts/<key>, not .orca-remote itself.
  const slotDir = dirname(dirname(dirname(argv1)))
  const name = basename(slotDir)
  if (!name.startsWith('orcad-')) {
    return null
  }
  return { root: dirname(slotDir), slotDir, version: name.slice('orcad-'.length) }
}

function mtimeMs(path: string): number | null {
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}

/** The desktop touches the journal while it works; an old one means it went away mid-update. */
export function activationInProgress(root: string, now: number = Date.now()): boolean {
  const dir = join(root, ORCAD_ACTIVATION_JOURNAL_DIRNAME)
  const dirTime = mtimeMs(dir)
  if (dirTime === null) {
    return false
  }
  // Why the files too: a rewrite in place moves their time but not the directory's.
  const newest = Math.max(
    dirTime,
    mtimeMs(join(dir, 'transaction.json')) ?? 0,
    mtimeMs(join(dir, '.install-lock')) ?? 0
  )
  return now - newest < ORCAD_ACTIVATION_JOURNAL_STALE_MS
}

/** Names one update across its heartbeats; null when none is under way. */
export function activationJournalId(root: string, now: number = Date.now()): string | null {
  if (!activationInProgress(root, now)) {
    return null
  }
  try {
    const journal: unknown = JSON.parse(
      readFileSync(join(root, ORCAD_ACTIVATION_JOURNAL_DIRNAME, 'transaction.json'), 'utf8')
    )
    const startedAt =
      journal && typeof journal === 'object' ? Reflect.get(journal, 'startedAt') : null
    if (typeof startedAt === 'string' || typeof startedAt === 'number') {
      return String(startedAt)
    }
  } catch {
    // An unreadable journal still blocks restarts; it just has no better name.
  }
  return 'unknown'
}

export function readActiveOrcadVersion(root: string): string | null {
  try {
    const record: unknown = JSON.parse(
      readFileSync(join(root, ORCAD_ACTIVE_RECORD_FILENAME), 'utf8')
    )
    const active = record && typeof record === 'object' ? Reflect.get(record, 'active') : null
    return typeof active === 'string' && ORCAD_VERSION_PATTERN.test(active) ? active : null
  } catch {
    return null
  }
}

/** The node the install pinned for a slot; null while the slot or its runtime is incomplete. */
export function slotNodePath(root: string, slotDir: string): string | null {
  let marker: string
  try {
    marker = readFileSync(join(slotDir, '.runtime-node'), 'utf8').trim()
  } catch {
    return null
  }
  if (!/^[0-9a-f]{64}$/.test(marker)) {
    return null
  }
  const node = join(root, 'runtimes', `node-${marker}`, 'bin', 'node')
  return existsSync(node) ? node : null
}

export function planBridgeFollow(input: {
  root: string
  ownVersion: string
  now?: number
}): BridgeFollowPlan {
  const active = readActiveOrcadVersion(input.root)
  if (!active) {
    return { action: 'stay', why: 'no-active-record' }
  }
  if (active === input.ownVersion) {
    return { action: 'stay', why: 'same-version' }
  }
  if (activationInProgress(input.root, input.now)) {
    return { action: 'stay', why: 'activation-in-progress' }
  }
  const slotDir = join(input.root, `orcad-${active}`)
  const entry = join(slotDir, 'out', 'cli', 'index.js')
  const node = slotNodePath(input.root, slotDir)
  if (!node || !existsSync(entry)) {
    return { action: 'stay', why: 'incomplete-slot' }
  }
  return { action: 'reexec', node, entry, version: active }
}

const followMarkerPath = (root: string, pid: number): string =>
  join(root, SLACK_BRIDGE_FOLLOW_DIRNAME, String(pid))

/** Tells the desktop this bridge's code follows updates, so it need not pause the bridge. */
export function writeFollowMarker(root: string, pid: number, version: string): void {
  mkdirSync(join(root, SLACK_BRIDGE_FOLLOW_DIRNAME), { recursive: true, mode: 0o700 })
  writeFileSync(
    followMarkerPath(root, pid),
    JSON.stringify({ pid, version, startedAt: new Date().toISOString() }),
    { mode: 0o600 }
  )
}

export function removeFollowMarker(root: string, pid: number): void {
  rmSync(followMarkerPath(root, pid), { force: true })
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Why preflight: a failed process.execve aborts the process natively instead of throwing. */
export function canReexecBridge(target: BridgeFollowTarget): boolean {
  return (
    typeof process.execve === 'function' && isExecutable(target.node) && existsSync(target.entry)
  )
}

/**
 * Replaces this process with the new build's CLI, keeping the pid so the service manager keeps
 * tracking it. Returns only when it did not (the caller keeps running or exits).
 */
export function reexecBridge(
  target: BridgeFollowTarget,
  argv: readonly string[],
  env: NodeJS.ProcessEnv
): boolean {
  if (!canReexecBridge(target)) {
    return false
  }
  try {
    process.execve?.(target.node, [target.node, target.entry, ...argv.slice(2)], env)
  } catch {
    // Falls through: the caller keeps the old code running.
  }
  return false
}

/**
 * Polls for a finished update. `serverIsUp` guards the switch: the new bridge would otherwise
 * start before its server and fall into the runtime recovery. Returns a function that stops it.
 */
export function startBridgeFollow(args: {
  root: string
  ownVersion: string
  serverIsUp: () => Promise<boolean>
  /** Called once, when the bridge should stop and continue as `target`. */
  onFollow: (target: BridgeFollowTarget) => void
  intervalMs?: number
  now?: () => number
  log?: (line: string) => void
}): () => void {
  const log = args.log ?? ((line: string) => console.error(line))
  let busy = false
  let done = false
  let warned = false
  const check = async (): Promise<void> => {
    if (busy || done) {
      return
    }
    busy = true
    try {
      const plan = planBridgeFollow({
        root: args.root,
        ownVersion: args.ownVersion,
        now: args.now?.()
      })
      if (plan.action !== 'reexec') {
        return
      }
      if (!canReexecBridge(plan)) {
        if (!warned) {
          warned = true
          log(
            `[slack-bridge] server moved to ${plan.version}; this runtime cannot restart itself, so the old bridge keeps running`
          )
        }
        return
      }
      if (!(await args.serverIsUp().catch(() => false)) || done) {
        return
      }
      done = true
      log(`[slack-bridge] server moved to ${plan.version}; restarting the bridge on it`)
      args.onFollow(plan)
    } finally {
      busy = false
    }
  }
  const timer = setInterval(() => void check(), args.intervalMs ?? FOLLOW_CHECK_MS)
  timer.unref()
  return () => {
    done = true
    clearInterval(timer)
  }
}
