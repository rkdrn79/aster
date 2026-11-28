import { spawn } from 'node:child_process'
import { closeSync, openSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ORCAD_ACTIVE_RECORD_FILENAME } from '../shared/slack-bridge-update-follow'
import type { RuntimeClient } from './runtime-client'
import {
  activationJournalId,
  managedSlotOfCli,
  readActiveOrcadVersion,
  slotNodePath
} from './slack-bridge-update-follow'

/** The bridge can restore its SSH-managed runtime after the host reboots without a desktop. */
/** Only the status call and the profile path; tests pass a stub without a socket. */
type ManagedRuntimeClient = Pick<RuntimeClient, 'call' | 'userDataPath'>

export async function ensureSlackManagedRuntime(client: ManagedRuntimeClient): Promise<void> {
  if (inFlight) {
    return inFlight
  }
  const work = ensureSlackManagedRuntimeOnce(client)
  inFlight = work
  try {
    await work
  } finally {
    if (inFlight === work) {
      inFlight = null
    }
  }
}

let inFlight: Promise<void> | null = null
let loggedJournal: string | null = null

async function ensureSlackManagedRuntimeOnce(client: ManagedRuntimeClient): Promise<void> {
  const managed = managedSlotOfCli(process.argv[1])
  if (!managed) {
    return
  }
  const { root } = managed
  if (!existsSync(join(root, ORCAD_ACTIVE_RECORD_FILENAME))) {
    return
  }
  try {
    await client.call('status.get', undefined, { timeoutMs: 4_000 })
    return
  } catch {
    // The active slot below is authoritative; stale metadata is expected after a reboot.
  }
  // Why: a desktop update stops the server before it changes the record, so the recorded
  // version is still the old one; starting it again would fail the update.
  const journal = activationJournalId(root)
  if (journal) {
    if (loggedJournal !== journal) {
      loggedJournal = journal
      console.error('[slack-bridge] server update in progress; not restarting orcad')
    }
    return
  }
  loggedJournal = null
  const active = readActiveOrcadVersion(root)
  if (!active) {
    throw new Error('The SSH server has no valid active Aster runtime')
  }
  const slot = join(root, `orcad-${active}`)
  const node = slotNodePath(root, slot)
  const entry = join(slot, 'orcad-server.js')
  if (!node || !existsSync(entry)) {
    throw new Error('The active Aster runtime is incomplete')
  }
  const log = openSync(join(root, 'slack-runtime.log'), 'a', 0o600)
  let spawnError: Error | null = null
  try {
    const child = spawn(node, [entry, '--json', '--bind', '127.0.0.1'], {
      cwd: slot,
      detached: true,
      stdio: ['ignore', log, log],
      env: {
        ...process.env,
        ORCA_VERSION: active,
        ORCA_USER_DATA: client.userDataPath,
        ORCA_USER_DATA_PATH: client.userDataPath
      }
    })
    child.once('error', (error) => {
      spawnError = error
    })
    child.unref()
  } finally {
    closeSync(log)
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    if (spawnError) {
      throw spawnError
    }
    try {
      await client.call('status.get', undefined, { timeoutMs: 2_000 })
      return
    } catch {
      // The runtime writes metadata after its transport starts.
    }
  }
  throw new Error('The SSH server runtime did not become ready')
}
