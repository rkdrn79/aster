import { spawn } from 'node:child_process'
import { closeSync, openSync, readFileSync, existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { RuntimeClient } from './runtime-client'

/** The bridge can restore its SSH-managed runtime after the host reboots without a desktop. */
export async function ensureSlackManagedRuntime(client: RuntimeClient): Promise<void> {
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

async function ensureSlackManagedRuntimeOnce(client: RuntimeClient): Promise<void> {
  // On shared-home clusters the active slot lives below .orca-remote/machines/<machine-key>.
  const cliSlot = process.argv[1] ? dirname(dirname(dirname(process.argv[1]))) : null
  if (!cliSlot || !basename(cliSlot).startsWith('orcad-')) {
    return
  }
  const root = dirname(cliSlot)
  const recordPath = join(root, 'orcad-active.json')
  if (!existsSync(recordPath)) {
    return
  }
  try {
    await client.call('status.get', undefined, { timeoutMs: 4_000 })
    return
  } catch {
    // The active slot below is authoritative; stale metadata is expected after a reboot.
  }
  const record: unknown = JSON.parse(readFileSync(recordPath, 'utf8'))
  const active = record && typeof record === 'object' ? Reflect.get(record, 'active') : null
  if (typeof active !== 'string' || !/^v?[0-9]+\.[0-9]+\.[0-9]+\+[0-9a-f]+$/.test(active)) {
    throw new Error('The SSH server has no valid active Aster runtime')
  }
  const slot = join(root, `orcad-${active}`)
  const marker = readFileSync(join(slot, '.runtime-node'), 'utf8').trim()
  if (!/^[0-9a-f]{64}$/.test(marker)) {
    throw new Error('The SSH server runtime marker is invalid')
  }
  const node = join(root, 'runtimes', `node-${marker}`, 'bin', 'node')
  const entry = join(slot, 'orcad-server.js')
  if (!existsSync(node) || !existsSync(entry)) {
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
