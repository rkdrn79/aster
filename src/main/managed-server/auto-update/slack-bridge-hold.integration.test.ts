/**
 * The Slack bridge against a real `/bin/sh` and real processes: a fake bridge that supervises the
 * server the way the shipped one does (start the recorded version whenever the server is gone), a
 * stub orcad started and stopped through the real launch and stop commands, and the update's
 * journal and record written where the real activation writes them.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { orcadLaunchCommand } from '../install/orcad-remote-launch'
import { ORCAD_PID_FILENAME } from '../install/orcad-remote-host-support'
import { parseOrcadStopOutcome, stopOrcadCommand } from '../install/orcad-remote-process-control'
import { getRemoteHostPlatform } from '../../ssh/ssh-remote-platform'
import {
  holdOldSlackBridges,
  parseSlackBridgeProbe,
  slackBridgePauseCommand,
  slackBridgeProbeCommand
} from './slack-bridge-hold'

const host = getRemoteHostPlatform('linux-x64')
const OLD = '0.1.0+aaaa'
const NEW = '0.2.0+bbbb'
let home = ''
let root = ''
let dataDir = ''
const children = new Set<ChildProcess>()
const pids = new Set<number>()

function sh(command: string): string {
  return execFileSync('/bin/sh', ['-c', command], { encoding: 'utf8', timeout: 10_000 })
}

const slot = (version: string): string => join(root, `orcad-${version}`)

function writeStub(version: string): void {
  mkdirSync(join(slot(version), 'out', 'cli'), { recursive: true })
  writeFileSync(
    join(slot(version), 'orcad.js'),
    [
      `process.on('SIGTERM', () => process.exit(0));`,
      `console.log(JSON.stringify({type: 'orca_server_ready', health: {pid: process.pid}}));`,
      `setTimeout(() => process.exit(1), 60_000);`
    ].join('\n')
  )
}

function launchCommand(version: string): string {
  return orcadLaunchCommand(host, {
    remoteInstallDir: slot(version),
    nodePath: process.execPath,
    fullVersion: version,
    userDataDir: dataDir,
    bindHost: '127.0.0.1',
    port: 0,
    activationRoot: join(root, '.orcad-activation-transaction')
  })
}

function servingPid(version: string): number | null {
  try {
    const pid = Number(readFileSync(join(slot(version), ORCAD_PID_FILENAME), 'utf8').trim())
    process.kill(pid, 0)
    pids.add(pid)
    return pid
  } catch {
    return null
  }
}

function writeRecord(active: string, previous: string | null): void {
  writeFileSync(
    join(root, 'orcad-active.json'),
    JSON.stringify({ schemaVersion: 1, active, previous, activatedAt: new Date().toISOString() })
  )
}

/**
 * Behaves like the shipped bridge's runtime recovery, polled fast instead of every 30 s: when the
 * recorded server is gone, start the recorded version. `follows` adds what new bridges do.
 */
function startFakeBridge(kind: 'old' | 'follows'): ChildProcess {
  const entry = join(slot(OLD), 'out', 'cli', 'index.js')
  writeFileSync(
    entry,
    [
      `const fs = require('node:fs'); const path = require('node:path');`,
      `const { execFileSync } = require('node:child_process');`,
      `const root = ${JSON.stringify(root)};`,
      `const commands = ${JSON.stringify({ [OLD]: launchCommand(OLD), [NEW]: launchCommand(NEW) })};`,
      kind === 'follows'
        ? `fs.mkdirSync(path.join(root, '.slack-bridge-follow'), { recursive: true });` +
          `fs.writeFileSync(path.join(root, '.slack-bridge-follow', String(process.pid)), '{}');`
        : '',
      `const alive = (v) => { try { const pid = Number(fs.readFileSync(path.join(root, 'orcad-' + v, '.orcad-pid'), 'utf8')); process.kill(pid, 0); return true } catch { return false } };`,
      `setInterval(() => {`,
      `  const active = JSON.parse(fs.readFileSync(path.join(root, 'orcad-active.json'), 'utf8')).active;`,
      kind === 'follows'
        ? `  if (fs.existsSync(path.join(root, '.orcad-activation-transaction'))) return;`
        : '',
      `  if (alive(active)) return;`,
      `  execFileSync('/bin/sh', ['-c', commands[active]], { stdio: 'ignore' });`,
      `  fs.appendFileSync(path.join(root, 'bridge.log'), 'respawned ' + active + '\\n');`,
      `}, 100);`
    ].join('\n')
  )
  const child = spawn(
    process.execPath,
    [entry, 'slack', 'bridge', '--routes-file', 'r', '--service'],
    {
      stdio: 'ignore'
    }
  )
  children.add(child)
  return child
}

function respawns(): string[] {
  const log = join(root, 'bridge.log')
  return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : []
}

function processState(pid: number): string {
  return sh(`ps -o stat= -p ${pid} || true`).trim()
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The activation's order: journal, stop, record, start the candidate, drop the journal.
 * `respawnWindowMs` is how long a bridge gets to start the old server again; generous, since a
 * loaded machine runs the fake bridge's 100 ms poll late, and it ends as soon as one appears.
 */
async function runUpdate(
  respawnWindowMs = 1_500
): Promise<{ stopped: string; oldRespawned: boolean }> {
  const journal = join(root, '.orcad-activation-transaction')
  mkdirSync(journal, { recursive: true })
  writeFileSync(join(journal, 'transaction.json'), JSON.stringify({ operation: 'activate' }))
  const stopped = parseOrcadStopOutcome(
    sh(stopOrcadCommand(host, slot(OLD), { waitSeconds: 3, nodePath: process.execPath }))
  )
  for (let waited = 0; waited < respawnWindowMs && servingPid(OLD) === null; waited += 100) {
    await sleep(100)
  }
  const oldRespawned = servingPid(OLD) !== null
  if (!oldRespawned) {
    writeRecord(NEW, OLD)
    sh(launchCommand(NEW))
  }
  rmSync(journal, { recursive: true, force: true })
  return { stopped, oldRespawned }
}

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'slack-bridge-hold-'))
  root = join(home, '.orca-remote')
  dataDir = join(home, '.orca')
  mkdirSync(dataDir, { recursive: true })
  writeStub(OLD)
  writeStub(NEW)
  writeRecord(OLD, null)
  sh(launchCommand(OLD))
  await expect.poll(() => servingPid(OLD), { timeout: 15_000 }).not.toBeNull()
})

afterEach(() => {
  for (const child of children) {
    child.kill('SIGKILL')
  }
  children.clear()
  for (const pid of [...pids, servingPid(OLD), servingPid(NEW)]) {
    try {
      if (pid) {
        process.kill(pid, 'SIGKILL')
      }
    } catch {
      // Already gone.
    }
  }
  pids.clear()
  rmSync(home, { recursive: true, force: true })
})

// Why the long timeout: real processes on a machine that may run the whole suite at once.
describe('Slack bridge during a server update, with real processes', { timeout: 90_000 }, () => {
  it('reproduces the bug: an old bridge starts the old server again mid-update', async () => {
    startFakeBridge('old')
    await sleep(300)
    const { oldRespawned } = await runUpdate(15_000)
    expect(oldRespawned).toBe(true)
    expect(respawns()).toContain(`respawned ${OLD}`)
  })

  it('pauses an old bridge for the update, then lets it supervise the new server', async () => {
    const bridge = startFakeBridge('old')
    await sleep(300)
    const exec = async (command: string): Promise<string> => sh(command)
    const hold = await holdOldSlackBridges(exec, root)
    expect(hold.bridges).toEqual([{ pid: bridge.pid, kind: 'old', unit: null }])
    expect(hold.paused).toEqual([bridge.pid])
    await expect.poll(() => processState(bridge.pid!), { timeout: 10_000 }).toMatch(/^T/)

    const { stopped, oldRespawned } = await runUpdate()
    expect(stopped).toBe('stopped')
    expect(oldRespawned).toBe(false)
    await hold.release()
    await expect.poll(() => processState(bridge.pid!), { timeout: 10_000 }).not.toMatch(/^T/)
    await sleep(500)
    expect(servingPid(NEW)).not.toBeNull()
    expect(servingPid(OLD)).toBeNull()
    expect(respawns()).toEqual([])
  })

  it('leaves a bridge that follows updates running; it stands down on the journal itself', async () => {
    const bridge = startFakeBridge('follows')
    await sleep(300)
    const hold = await holdOldSlackBridges(async (command) => sh(command), root)
    expect(hold.bridges).toEqual([{ pid: bridge.pid, kind: 'follows', unit: null }])
    expect(hold.paused).toEqual([])
    const { oldRespawned } = await runUpdate()
    await hold.release()
    expect(oldRespawned).toBe(false)
    expect(servingPid(NEW)).not.toBeNull()
  })

  it('continues a paused bridge on its own when the desktop never comes back', async () => {
    const bridge = startFakeBridge('old')
    await sleep(200)
    // Why 5 s: long enough that a loaded machine still sees the pause before the watchdog ends it.
    const paused = sh(slackBridgePauseCommand(root, [bridge.pid!], 5))
    expect(paused).toContain(`ASTER_SLACK_BRIDGE_PAUSED ${bridge.pid}`)
    expect(existsSync(join(root, '.slack-bridge-hold', String(bridge.pid)))).toBe(true)
    expect(processState(bridge.pid!)).toMatch(/^T/)
    await expect
      .poll(() => processState(bridge.pid!), { timeout: 30_000, interval: 200 })
      .not.toMatch(/^T/)
    await expect
      .poll(() => existsSync(join(root, '.slack-bridge-hold', String(bridge.pid))), {
        timeout: 5_000
      })
      .toBe(false)
    expect(existsSync(join(root, '.slack-bridge-hold', String(bridge.pid)))).toBe(false)
  })

  it('ignores bridges that do not run from this root', async () => {
    const elsewhere = join(home, 'elsewhere', 'out', 'cli')
    mkdirSync(elsewhere, { recursive: true })
    writeFileSync(join(elsewhere, 'index.js'), 'setInterval(() => {}, 1000)')
    const child = spawn(
      process.execPath,
      [join(elsewhere, 'index.js'), 'slack', 'bridge', '--service'],
      {
        stdio: 'ignore'
      }
    )
    children.add(child)
    await sleep(200)
    expect(parseSlackBridgeProbe(sh(slackBridgeProbeCommand(root)))).toEqual([])
  })
})
