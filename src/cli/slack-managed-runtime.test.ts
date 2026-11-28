import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ORCAD_ACTIVATION_JOURNAL_DIRNAME } from '../shared/slack-bridge-update-follow'
import type { RuntimeClient } from './runtime-client'

const spawnMock = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import { ensureSlackManagedRuntime } from './slack-managed-runtime'

const VERSION = '1.2.3+aaaa111'
const SHA = 'd'.repeat(64)

let root: string
let savedArgv1: string | undefined
const client: Pick<RuntimeClient, 'call' | 'userDataPath'> = {
  userDataPath: '/unused',
  call: vi.fn(async () => {
    throw new Error('server is down')
  })
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aster-managed-runtime-'))
  savedArgv1 = process.argv[1]
  process.argv[1] = join(root, `orcad-${VERSION}`, 'out', 'cli', 'index.js')
  const slot = join(root, `orcad-${VERSION}`)
  mkdirSync(join(slot, 'out', 'cli'), { recursive: true })
  writeFileSync(join(slot, '.runtime-node'), SHA)
  writeFileSync(join(slot, 'orcad-server.js'), '')
  mkdirSync(join(root, 'runtimes', `node-${SHA}`, 'bin'), { recursive: true })
  writeFileSync(join(root, 'runtimes', `node-${SHA}`, 'bin', 'node'), '', { mode: 0o755 })
  writeFileSync(
    join(root, 'orcad-active.json'),
    JSON.stringify({ schemaVersion: 1, active: VERSION })
  )
  spawnMock.mockReset()
  spawnMock.mockImplementation(() => {
    throw new Error('spawn reached')
  })
})
afterEach(() => {
  process.argv[1] = savedArgv1 ?? ''
  rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

function writeJournal(startedAt: string, ageMs: number): void {
  const dir = join(root, ORCAD_ACTIVATION_JOURNAL_DIRNAME)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'transaction.json')
  writeFileSync(file, JSON.stringify({ operation: 'activate', startedAt }))
  const at = new Date(Date.now() - ageMs)
  utimesSync(file, at, at)
  utimesSync(dir, at, at)
}

describe('ensureSlackManagedRuntime', () => {
  it('does not start the old server while an update is in progress, and logs once per update', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    writeJournal('update-1', 5_000)
    await expect(ensureSlackManagedRuntime(client)).resolves.toBeUndefined()
    await expect(ensureSlackManagedRuntime(client)).resolves.toBeUndefined()
    expect(spawnMock).not.toHaveBeenCalled()
    expect(log.mock.calls.filter(([line]) => String(line).includes('update in progress'))).toEqual([
      ['[slack-bridge] server update in progress; not restarting orcad']
    ])
    // A later update is a new journal and is reported again.
    writeJournal('update-2', 5_000)
    await ensureSlackManagedRuntime(client)
    expect(
      log.mock.calls.filter(([line]) => String(line).includes('update in progress'))
    ).toHaveLength(2)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('starts the recorded server again when the journal is stale', async () => {
    writeJournal('update-3', 60 * 60_000)
    await expect(ensureSlackManagedRuntime(client)).rejects.toThrow('spawn reached')
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  it('starts the recorded server again without a journal', async () => {
    await expect(ensureSlackManagedRuntime(client)).rejects.toThrow('spawn reached')
    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(spawnMock.mock.calls[0][1]).toEqual([
      join(root, `orcad-${VERSION}`, 'orcad-server.js'),
      '--json',
      '--bind',
      '127.0.0.1'
    ])
  })
})
