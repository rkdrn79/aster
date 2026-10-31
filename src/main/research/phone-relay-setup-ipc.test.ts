import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSavedRelayUrl, relaySetupCommand } from './phone-relay-setup-ipc'

vi.mock('electron', () => ({ app: { isPackaged: false }, ipcMain: { handle: vi.fn() } }))

describe('phone relay setup IPC', () => {
  const directories: string[] = []
  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  function home(relayUrl?: string): string {
    const directory = mkdtempSync(join(tmpdir(), 'phone-relay-setup-'))
    directories.push(directory)
    if (relayUrl !== undefined) {
      mkdirSync(join(directory, '.config', 'aster-relay'), { recursive: true })
      writeFileSync(join(directory, '.config', 'aster-relay', 'relay-url'), relayUrl)
    }
    return directory
  }

  it('prefills only a saved relay URL', async () => {
    expect(await readSavedRelayUrl(home())).toBeNull()
    expect(
      await readSavedRelayUrl(home('https://aster-relay.me.workers.dev/ws?key=k\n'))
    ).toBeNull()
    expect(await readSavedRelayUrl(home('wss://aster-relay.me.workers.dev/ws?key=k\n'))).toBe(
      'wss://aster-relay.me.workers.dev/ws?key=k'
    )
  })

  it('offers the setup command only for a script every shell can quote', () => {
    const directory = home()
    const script = join(directory, 'setup.mjs')
    expect(relaySetupCommand(script)).toBeNull()
    writeFileSync(script, '')
    expect(relaySetupCommand(script)).toBe(`node "${script}"`)
    const quoted = join(directory, 'a$b')
    mkdirSync(quoted)
    writeFileSync(join(quoted, 'setup.mjs'), '')
    expect(relaySetupCommand(join(quoted, 'setup.mjs'))).toBeNull()
  })
})
