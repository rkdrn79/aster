import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ORCAD_ACTIVATION_JOURNAL_DIRNAME,
  ORCAD_ACTIVATION_JOURNAL_STALE_MS,
  SLACK_BRIDGE_FOLLOW_DIRNAME
} from '../shared/slack-bridge-update-follow'
import {
  activationInProgress,
  activationJournalId,
  canReexecBridge,
  managedSlotOfCli,
  planBridgeFollow,
  readActiveOrcadVersion,
  reexecBridge,
  removeFollowMarker,
  startBridgeFollow,
  writeFollowMarker
} from './slack-bridge-update-follow'

const OLD = '1.2.3+aaaa111'
const NEW = '1.2.4+bbbb222'
const SHA = 'c'.repeat(64)

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aster-bridge-follow-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function writeRecord(active: unknown): void {
  writeFileSync(join(root, 'orcad-active.json'), JSON.stringify({ schemaVersion: 1, active }))
}

/** A complete slot: the CLI entry plus the runtime node its marker points at. */
function installSlot(version: string, options: { entry?: boolean; node?: boolean } = {}): void {
  const slot = join(root, `orcad-${version}`)
  mkdirSync(join(slot, 'out', 'cli'), { recursive: true })
  writeFileSync(join(slot, '.runtime-node'), `${SHA}\n`)
  if (options.entry !== false) {
    writeFileSync(join(slot, 'out', 'cli', 'index.js'), '')
  }
  if (options.node !== false) {
    mkdirSync(join(root, 'runtimes', `node-${SHA}`, 'bin'), { recursive: true })
    writeFileSync(join(root, 'runtimes', `node-${SHA}`, 'bin', 'node'), '', { mode: 0o755 })
  }
}

function writeJournal(ageMs: number, now: number): string {
  const dir = join(root, ORCAD_ACTIVATION_JOURNAL_DIRNAME)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'transaction.json')
  writeFileSync(file, JSON.stringify({ operation: 'activate', startedAt: 'journal-1' }))
  const at = new Date(now - ageMs)
  utimesSync(file, at, at)
  utimesSync(dir, at, at)
  return dir
}

describe('managedSlotOfCli', () => {
  it('finds the root, slot and version of a managed CLI', () => {
    expect(managedSlotOfCli(`/h/.orca-remote/orcad-${OLD}/out/cli/index.js`)).toEqual({
      root: '/h/.orca-remote',
      slotDir: `/h/.orca-remote/orcad-${OLD}`,
      version: OLD
    })
    expect(managedSlotOfCli(`/h/.orca-remote/hosts/k/orcad-${OLD}/out/cli/index.js`)?.root).toBe(
      '/h/.orca-remote/hosts/k'
    )
  })

  it('rejects a CLI that is not in an orcad slot', () => {
    expect(managedSlotOfCli(undefined)).toBeNull()
    expect(managedSlotOfCli('/Applications/Aster.app/out/cli/index.js')).toBeNull()
    expect(managedSlotOfCli('index.js')).toBeNull()
  })
})

describe('activationInProgress', () => {
  const now = Date.now()

  it('is false without a journal', () => {
    expect(activationInProgress(root, now)).toBe(false)
  })

  it('is true for a fresh journal and false once it goes stale', () => {
    writeJournal(60_000, now)
    expect(activationInProgress(root, now)).toBe(true)
    writeJournal(ORCAD_ACTIVATION_JOURNAL_STALE_MS + 60_000, now)
    expect(activationInProgress(root, now)).toBe(false)
  })

  it('counts a fresh transaction file or install lock inside an old directory', () => {
    const dir = writeJournal(ORCAD_ACTIVATION_JOURNAL_STALE_MS + 60_000, now)
    const old = new Date(now - ORCAD_ACTIVATION_JOURNAL_STALE_MS - 60_000)
    writeFileSync(join(dir, '.install-lock'), '')
    // Creating the lock touched the directory; only the lock stays fresh.
    utimesSync(dir, old, old)
    expect(activationInProgress(root, now)).toBe(true)
    utimesSync(join(dir, '.install-lock'), old, old)
    expect(activationInProgress(root, now)).toBe(false)
    const fresh = new Date(now - 1_000)
    utimesSync(join(dir, 'transaction.json'), fresh, fresh)
    expect(activationInProgress(root, now)).toBe(true)
  })

  it('treats a fresh directory without readable files as in progress', () => {
    mkdirSync(join(root, ORCAD_ACTIVATION_JOURNAL_DIRNAME))
    expect(activationInProgress(root, Date.now())).toBe(true)
    expect(activationJournalId(root, Date.now())).toBe('unknown')
  })

  it('names a journal by when it started', () => {
    expect(activationJournalId(root, now)).toBeNull()
    writeJournal(1_000, now)
    expect(activationJournalId(root, now)).toBe('journal-1')
  })
})

describe('readActiveOrcadVersion', () => {
  it('reads a valid active version', () => {
    writeRecord(NEW)
    expect(readActiveOrcadVersion(root)).toBe(NEW)
  })

  it('returns null for a missing, malformed or path-like record', () => {
    expect(readActiveOrcadVersion(root)).toBeNull()
    writeFileSync(join(root, 'orcad-active.json'), '{')
    expect(readActiveOrcadVersion(root)).toBeNull()
    writeRecord('../../etc')
    expect(readActiveOrcadVersion(root)).toBeNull()
    writeRecord(42)
    expect(readActiveOrcadVersion(root)).toBeNull()
  })
})

describe('planBridgeFollow', () => {
  it('stays on the same version', () => {
    writeRecord(OLD)
    installSlot(OLD)
    expect(planBridgeFollow({ root, ownVersion: OLD })).toEqual({
      action: 'stay',
      why: 'same-version'
    })
  })

  it('stays without an active record', () => {
    expect(planBridgeFollow({ root, ownVersion: OLD })).toEqual({
      action: 'stay',
      why: 'no-active-record'
    })
  })

  it('re-executes through a complete new slot', () => {
    writeRecord(NEW)
    installSlot(OLD)
    installSlot(NEW)
    expect(planBridgeFollow({ root, ownVersion: OLD })).toEqual({
      action: 'reexec',
      node: join(root, 'runtimes', `node-${SHA}`, 'bin', 'node'),
      entry: join(root, `orcad-${NEW}`, 'out', 'cli', 'index.js'),
      version: NEW
    })
  })

  it('stays while the new slot has no CLI entry or runtime node', () => {
    writeRecord(NEW)
    installSlot(NEW, { entry: false })
    expect(planBridgeFollow({ root, ownVersion: OLD })).toMatchObject({
      action: 'stay',
      why: 'incomplete-slot'
    })
    rmSync(join(root, `orcad-${NEW}`), { recursive: true })
    rmSync(join(root, 'runtimes'), { recursive: true })
    installSlot(NEW, { node: false })
    expect(planBridgeFollow({ root, ownVersion: OLD })).toMatchObject({
      action: 'stay',
      why: 'incomplete-slot'
    })
  })

  it('stays while an update is in progress, then follows once the journal is stale', () => {
    writeRecord(NEW)
    installSlot(NEW)
    const now = Date.now()
    writeJournal(1_000, now)
    expect(planBridgeFollow({ root, ownVersion: OLD, now })).toEqual({
      action: 'stay',
      why: 'activation-in-progress'
    })
    expect(
      planBridgeFollow({ root, ownVersion: OLD, now: now + ORCAD_ACTIVATION_JOURNAL_STALE_MS })
    ).toMatchObject({ action: 'reexec', version: NEW })
  })
})

describe('follow marker', () => {
  it('is written private and removed again', () => {
    writeFollowMarker(root, 4242, OLD)
    const dir = join(root, SLACK_BRIDGE_FOLLOW_DIRNAME)
    const file = join(dir, '4242')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ pid: 4242, version: OLD })
    expect(JSON.parse(readFileSync(file, 'utf8')).startedAt).toEqual(expect.any(String))
    if (process.platform !== 'win32') {
      expect(statSync(file).mode & 0o777).toBe(0o600)
      expect(statSync(dir).mode & 0o777).toBe(0o700)
    }
    removeFollowMarker(root, 4242)
    expect(existsSync(file)).toBe(false)
    expect(() => removeFollowMarker(root, 4242)).not.toThrow()
  })
})

describe('reexecBridge', () => {
  it('returns false instead of replacing the process when the target is missing', () => {
    const target = { node: join(root, 'no-node'), entry: join(root, 'no-entry.js'), version: NEW }
    expect(canReexecBridge(target)).toBe(false)
    expect(reexecBridge(target, ['node', 'cli', 'slack'], {})).toBe(false)
  })

  it('returns false when the runtime cannot replace its process', () => {
    installSlot(NEW)
    const execve = process.execve
    Object.defineProperty(process, 'execve', { value: undefined, configurable: true })
    try {
      const target = {
        node: join(root, 'runtimes', `node-${SHA}`, 'bin', 'node'),
        entry: join(root, `orcad-${NEW}`, 'out', 'cli', 'index.js'),
        version: NEW
      }
      expect(reexecBridge(target, ['node', 'cli'], {})).toBe(false)
    } finally {
      Object.defineProperty(process, 'execve', { value: execve, configurable: true })
    }
  })
})

describe('startBridgeFollow', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('hands over once the new server answers, and only once', async () => {
    vi.useFakeTimers()
    writeRecord(NEW)
    installSlot(NEW)
    let up = false
    const onFollow = vi.fn()
    const log = vi.fn()
    const stop = startBridgeFollow({
      root,
      ownVersion: OLD,
      serverIsUp: async () => up,
      onFollow,
      log,
      intervalMs: 1_000
    })
    await vi.advanceTimersByTimeAsync(3_000)
    expect(onFollow).not.toHaveBeenCalled()
    up = true
    await vi.advanceTimersByTimeAsync(1_000)
    // The real process.execve exists on the test runtime, so the preflight passes.
    if (typeof process.execve === 'function') {
      expect(onFollow).toHaveBeenCalledTimes(1)
      expect(onFollow).toHaveBeenCalledWith(expect.objectContaining({ version: NEW }))
      await vi.advanceTimersByTimeAsync(3_000)
      expect(onFollow).toHaveBeenCalledTimes(1)
    }
    stop()
  })

  it('does nothing while the version is unchanged', async () => {
    vi.useFakeTimers()
    writeRecord(OLD)
    const onFollow = vi.fn()
    const serverIsUp = vi.fn(async () => true)
    const stop = startBridgeFollow({
      root,
      ownVersion: OLD,
      serverIsUp,
      onFollow,
      intervalMs: 1_000
    })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(serverIsUp).not.toHaveBeenCalled()
    expect(onFollow).not.toHaveBeenCalled()
    stop()
  })
})
