import { createHash } from 'node:crypto'
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync
} from 'node:fs'
import { dirname, join } from 'node:path'

export type SlackBridgeConnection =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'standby'

export type SlackBridgeLeaseRecord = {
  version: 1
  pid: number
  /** `service` is the per-user background service; `process` is the app's child or a manual CLI. */
  mode: 'service' | 'process'
  connection: SlackBridgeConnection
  notice: string | null
  updatedAt: number
}

/** A holder refreshes every 30 s; one silent for this long has crashed or hung. */
const STALE_AFTER_MS = 90_000
export const SLACK_LEASE_REFRESH_MS = 30_000

type LeaseDeps = { pid: number; now: () => number; isAlive: (pid: number) => boolean }

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error instanceof Error && Reflect.get(error, 'code') === 'EPERM'
  }
}

const defaultDeps: LeaseDeps = { pid: process.pid, now: Date.now, isAlive: isProcessAlive }

/** One lease per app token in a profile: Slack splits events across sockets that share a token. */
export function slackBridgeLeasePath(userDataPath: string, appToken: string): string {
  const digest = createHash('sha256').update(appToken).digest('hex').slice(0, 16)
  return join(userDataPath, 'slack', `socket-${digest}.json`)
}

function parse(path: string): SlackBridgeLeaseRecord | null {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!value || typeof value !== 'object') {
      return null
    }
    const pid = Reflect.get(value, 'pid')
    const mode = Reflect.get(value, 'mode')
    const connection = Reflect.get(value, 'connection')
    const notice = Reflect.get(value, 'notice')
    const updatedAt = Reflect.get(value, 'updatedAt')
    if (
      Reflect.get(value, 'version') !== 1 ||
      typeof pid !== 'number' ||
      !Number.isSafeInteger(pid) ||
      pid <= 0 ||
      (mode !== 'service' && mode !== 'process') ||
      (connection !== 'connecting' &&
        connection !== 'connected' &&
        connection !== 'disconnected' &&
        connection !== 'error' &&
        connection !== 'standby') ||
      (notice !== null && typeof notice !== 'string') ||
      typeof updatedAt !== 'number' ||
      !Number.isFinite(updatedAt)
    ) {
      return null
    }
    return { version: 1, pid, mode, connection, notice, updatedAt }
  } catch {
    return null
  }
}

/** The live holder, or null when nobody holds the connection. */
export function readSlackBridgeLease(
  path: string,
  deps: LeaseDeps = defaultDeps
): SlackBridgeLeaseRecord | null {
  const record = parse(path)
  if (!record || deps.now() - record.updatedAt > STALE_AFTER_MS || !deps.isAlive(record.pid)) {
    return null
  }
  return record
}

export class SlackBridgeLease {
  private record: SlackBridgeLeaseRecord | null = null

  constructor(
    private readonly path: string,
    private readonly mode: SlackBridgeLeaseRecord['mode'],
    private readonly deps: LeaseDeps = defaultDeps
  ) {}

  /** Takes the lease unless another live process holds it; `holder` is that process when known. */
  claim(): { claimed: true } | { claimed: false; holder: SlackBridgeLeaseRecord | null } {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
    const mine: SlackBridgeLeaseRecord = {
      version: 1,
      pid: this.deps.pid,
      mode: this.mode,
      connection: 'connecting',
      notice: this.record?.notice ?? null,
      updatedAt: this.deps.now()
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const fd = openSync(this.path, 'wx', 0o600)
        try {
          writeSync(fd, JSON.stringify(mine))
        } finally {
          closeSync(fd)
        }
        this.record = mine
        return { claimed: true }
      } catch (error) {
        if (!(error instanceof Error) || Reflect.get(error, 'code') !== 'EEXIST') {
          throw error
        }
      }
      const holder = readSlackBridgeLease(this.path, this.deps)
      if (holder && holder.pid !== this.deps.pid) {
        return { claimed: false, holder }
      }
      // Why remove: the holder crashed (or is this pid from an earlier claim) and cannot release.
      rmSync(this.path, { force: true })
    }
    return { claimed: false, holder: null }
  }

  /** Refreshes the record; false when another process took the lease over. */
  update(patch: Partial<Pick<SlackBridgeLeaseRecord, 'connection' | 'notice'>> = {}): boolean {
    if (!this.record) {
      return false
    }
    if (parse(this.path)?.pid !== this.deps.pid) {
      this.record = null
      return false
    }
    this.record = { ...this.record, ...patch, updatedAt: this.deps.now() }
    const temporary = `${this.path}.${this.deps.pid}.tmp`
    writeFileSync(temporary, JSON.stringify(this.record), { mode: 0o600 })
    renameSync(temporary, this.path)
    return true
  }

  get held(): boolean {
    return this.record !== null
  }

  release(): void {
    if (this.record && parse(this.path)?.pid === this.deps.pid) {
      rmSync(this.path, { force: true })
    }
    this.record = null
  }
}
