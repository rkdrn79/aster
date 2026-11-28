/**
 * A managed server host made of a temp dir and real processes, driven through `/bin/sh` with the
 * generated launch and stop commands: stub orcad builds per slot, stub chat agents that end when
 * their orcad does (as the provider supervisor makes them), and a fake Slack bridge.
 *
 * Chats are files under `<data>/chats/<id>.json`. A server starts an agent for each `working` chat
 * and, on start, marks a reply the previous server was in the middle of as cut, which is what the
 * real server's orca-stop row says. Nothing here reaches the network.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { orcadLaunchCommand } from '../install/orcad-remote-launch'
import { ORCAD_PID_FILENAME, ORCAD_READINESS_FILENAME } from '../install/orcad-remote-host-support'
import { parseOrcadStopOutcome, stopOrcadCommand } from '../install/orcad-remote-process-control'
import { getRemoteHostPlatform } from '../../ssh/ssh-remote-platform'
import type { OrcadActivationHold } from '../../ssh/orcad-remote-deploy'

const host = getRemoteHostPlatform('linux-x64')
const RUNTIME_SHA = 'f'.repeat(64)
const followModule = pathToFileURL(
  resolve(__dirname, '../../../cli/slack-bridge-update-follow.ts')
).href

export type LocalChat = {
  status: 'working' | 'idle'
  turn: 'in-progress' | 'cut' | 'done'
  continued: number
  agentPid?: number
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

export class LocalOrcadRemote {
  readonly home = mkdtempSync(join(tmpdir(), 'local-orcad-remote-'))
  readonly root = join(this.home, '.orca-remote')
  readonly dataDir = join(this.home, '.orca')
  private readonly children = new Set<ChildProcess>()

  constructor(versions: readonly string[], active: string) {
    mkdirSync(join(this.dataDir, 'chats'), { recursive: true })
    mkdirSync(join(this.root, 'runtimes', `node-${RUNTIME_SHA}`, 'bin'), { recursive: true })
    symlinkSync(process.execPath, join(this.root, 'runtimes', `node-${RUNTIME_SHA}`, 'bin', 'node'))
    for (const version of versions) {
      this.writeSlot(version, true)
    }
    this.writeRecord(active, null)
  }

  sh(command: string): string {
    return execFileSync('/bin/sh', ['-c', command], { encoding: 'utf8', timeout: 10_000 })
  }

  slot(version: string): string {
    return join(this.root, `orcad-${version}`)
  }

  /** A build that answers ready, or one that dies on start, as a broken candidate would. */
  writeSlot(version: string, healthy: boolean): void {
    const chats = join(this.dataDir, 'chats')
    mkdirSync(join(this.slot(version), 'out', 'cli'), { recursive: true })
    writeFileSync(join(this.slot(version), '.runtime-node'), RUNTIME_SHA)
    writeFileSync(
      join(this.slot(version), 'orcad.js'),
      healthy ? orcadStub(chats) : 'process.exit(1)\n'
    )
  }

  launchCommand(version: string): string {
    return orcadLaunchCommand(host, {
      remoteInstallDir: this.slot(version),
      nodePath: process.execPath,
      fullVersion: version,
      userDataDir: this.dataDir,
      bindHost: '127.0.0.1',
      port: 0,
      activationRoot: join(this.root, '.orcad-activation-transaction')
    })
  }

  /**
   * True once the build printed its ready line and still runs, as the readiness probe asks; false
   * once its process is gone without one. Generous, since a loaded machine starts node slowly.
   */
  async launch(version: string): Promise<boolean> {
    const readiness = join(this.slot(version), ORCAD_READINESS_FILENAME)
    rmSync(readiness, { force: true })
    this.sh(this.launchCommand(version))
    for (let waited = 0; waited < 20_000; waited += 50) {
      await sleep(50)
      if (existsSync(readiness) && readFileSync(readiness, 'utf8').includes('orca_server_ready')) {
        await sleep(100)
        return this.servingPid(version) !== null
      }
      if (this.servingPid(version) === null) {
        return false
      }
    }
    return false
  }

  servingPid(version: string): number | null {
    try {
      const pid = Number(readFileSync(join(this.slot(version), ORCAD_PID_FILENAME), 'utf8'))
      process.kill(pid, 0)
      return pid
    } catch {
      return null
    }
  }

  record(): { active: string | null; previous: string | null } {
    return JSON.parse(readFileSync(join(this.root, 'orcad-active.json'), 'utf8'))
  }

  writeRecord(active: string, previous: string | null): void {
    writeFileSync(
      join(this.root, 'orcad-active.json'),
      JSON.stringify({ schemaVersion: 1, active, previous, activatedAt: new Date().toISOString() })
    )
  }

  chat(id: string): LocalChat {
    return JSON.parse(readFileSync(join(this.dataDir, 'chats', `${id}.json`), 'utf8'))
  }

  chats(): Record<string, LocalChat> {
    const dir = join(this.dataDir, 'chats')
    return Object.fromEntries(
      readdirSync(dir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => [name.slice(0, -5), this.chat(name.slice(0, -5))])
    )
  }

  writeChat(id: string, chat: LocalChat): void {
    writeFileSync(join(this.dataDir, 'chats', `${id}.json`), JSON.stringify(chat))
  }

  /**
   * One activation in the real one's order: hold, journal, stop, start the candidate, record,
   * drop the journal, release. A candidate that never answers restores the incumbent.
   */
  async activate(
    candidate: string,
    hold: () => Promise<OrcadActivationHold>
  ): Promise<{ outcome: 'activated' | 'refused' | 'rejected' | 'stop-incomplete' }> {
    const held = await hold()
    if ('refused' in held) {
      return { outcome: 'refused' }
    }
    const incumbent = this.record().active
    const journal = join(this.root, '.orcad-activation-transaction')
    try {
      mkdirSync(journal, { recursive: true })
      writeFileSync(join(journal, 'transaction.json'), JSON.stringify({ operation: 'activate' }))
      if (incumbent) {
        const stopped = parseOrcadStopOutcome(
          this.sh(
            stopOrcadCommand(host, this.slot(incumbent), {
              waitSeconds: 3,
              nodePath: process.execPath
            })
          )
        )
        await sleep(1_000)
        if ((stopped !== 'stopped' && stopped !== 'already-exited') || this.servingPid(incumbent)) {
          return { outcome: 'stop-incomplete' }
        }
      }
      if (!(await this.launch(candidate))) {
        if (incumbent) {
          await this.launch(incumbent)
        }
        return { outcome: 'rejected' }
      }
      this.writeRecord(candidate, incumbent)
      return { outcome: 'activated' }
    } finally {
      rmSync(journal, { recursive: true, force: true })
      await held.release()
    }
  }

  /** A bridge running from `version`'s slot; `follows` runs the real CLI follow module. */
  startBridge(version: string, kind: 'old' | 'follows'): ChildProcess {
    const entry = join(
      this.slot(version),
      'out',
      'cli',
      kind === 'follows' ? 'bridge.mjs' : 'bridge.js'
    )
    writeFileSync(entry, bridgeScript(this, kind))
    for (const slotVersion of this.versions()) {
      // Where a following bridge re-executes to: plain code that logs and keeps supervising.
      writeFileSync(
        join(this.slot(slotVersion), 'out', 'cli', 'index.js'),
        bridgeScript(this, 'after-exec')
      )
    }
    const child = spawn(
      process.execPath,
      [
        ...(kind === 'follows' ? ['--import', 'tsx'] : []),
        entry,
        'slack',
        'bridge',
        '--routes-file',
        'r',
        '--service'
      ],
      { cwd: resolve(__dirname, '../../../..'), stdio: 'ignore' }
    )
    this.children.add(child)
    return child
  }

  versions(): string[] {
    return readdirSync(this.root)
      .filter((name) => name.startsWith('orcad-') && !name.endsWith('.json'))
      .map((name) => name.slice('orcad-'.length))
  }

  bridgeLog(): string[] {
    const log = join(this.root, 'bridge.log')
    return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : []
  }

  processArgs(pid: number): string {
    return this.sh(`ps -o args= -p ${pid} || true`).trim()
  }

  cleanup(): void {
    for (const child of this.children) {
      child.kill('SIGKILL')
    }
    const pids = [
      ...this.versions().map((version) => this.servingPid(version)),
      ...Object.values(this.chats()).map((chat) => chat.agentPid ?? null)
    ]
    for (const pid of pids) {
      try {
        if (pid) {
          process.kill(pid, 'SIGKILL')
        }
      } catch {
        // Already gone.
      }
    }
    rmSync(this.home, { recursive: true, force: true })
  }
}

/** The stub server: cuts the reply its predecessor left running, runs an agent per working chat. */
function orcadStub(chats: string): string {
  return `const fs = require('node:fs'); const path = require('node:path');
const { spawn } = require('node:child_process');
const dir = ${JSON.stringify(chats)};
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const write = (f, c) => fs.writeFileSync(path.join(dir, f), JSON.stringify(c));
const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } };
for (const f of fs.readdirSync(dir)) {
  const c = read(f);
  if (c.turn === 'in-progress' && c.agentPid && !alive(c.agentPid)) write(f, { ...c, status: 'idle', turn: 'cut', agentPid: undefined });
}
const agent = 'const p = process.ppid; setInterval(() => { if (process.ppid !== p) process.exit(0) }, 50)';
setInterval(() => {
  for (const f of fs.readdirSync(dir)) {
    const c = read(f);
    if (c.status === 'working' && !(c.agentPid && alive(c.agentPid))) {
      const child = spawn(process.execPath, ['-e', agent], { stdio: 'ignore' });
      write(f, { ...c, turn: 'in-progress', agentPid: child.pid });
    }
  }
}, 50);
process.on('SIGTERM', () => process.exit(0));
console.log(JSON.stringify({ type: 'orca_server_ready', health: { pid: process.pid } }));
setTimeout(() => process.exit(1), 120_000);
`
}

/**
 * Supervises like the shipped bridge: whenever the recorded server is gone, start the recorded
 * version. `follows` asks the real follow module first and re-executes through it.
 */
function bridgeScript(remote: LocalOrcadRemote, kind: 'old' | 'follows' | 'after-exec'): string {
  const root = remote.root
  const launch = Object.fromEntries(
    remote.versions().map((version) => [version, remote.launchCommand(version)])
  )
  const common = `const root = ${JSON.stringify(root)};
const launch = ${JSON.stringify(launch)};
const log = (line) => fs.appendFileSync(path.join(root, 'bridge.log'), line + '\\n');
const alive = (v) => { try { process.kill(Number(fs.readFileSync(path.join(root, 'orcad-' + v, '.orcad-pid'), 'utf8')), 0); return true } catch { return false } };
const active = () => JSON.parse(fs.readFileSync(path.join(root, 'orcad-active.json'), 'utf8')).active;
const restore = (journal) => {
  if (journal) return;
  const v = active();
  if (!alive(v)) { execFileSync('/bin/sh', ['-c', launch[v]], { stdio: 'ignore' }); log('respawned ' + v); }
};`
  if (kind === 'follows') {
    return `import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { activationInProgress, managedSlotOfCli, planBridgeFollow, reexecBridge, writeFollowMarker } from ${JSON.stringify(followModule)};
${common}
const own = managedSlotOfCli(process.argv[1]);
writeFollowMarker(root, process.pid, own.version);
log('started ' + process.pid + ' ' + own.version);
setInterval(() => {
  restore(activationInProgress(root));
  const plan = planBridgeFollow({ root, ownVersion: own.version });
  if (plan.action === 'reexec' && alive(plan.version)) { log('reexec ' + process.pid + ' ' + plan.version); reexecBridge(plan, process.argv, process.env); }
}, 100);
`
  }
  return `const fs = require('node:fs'); const path = require('node:path'); const { execFileSync } = require('node:child_process');
${common}
${
  kind === 'after-exec'
    ? `log('now ' + process.pid + ' ' + path.basename(path.dirname(path.dirname(path.dirname(process.argv[1])))));
fs.mkdirSync(path.join(root, '.slack-bridge-follow'), { recursive: true });
fs.writeFileSync(path.join(root, '.slack-bridge-follow', String(process.pid)), '{}');`
    : ''
}
setInterval(() => restore(${kind === 'after-exec' ? "fs.existsSync(path.join(root, '.orcad-activation-transaction'))" : 'false'}), 100);
`
}
