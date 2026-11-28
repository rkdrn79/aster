// The automatic server update's two additions to an activation, against the in-memory host: it
// carries counted terminals across, and its hold (chat re-check, Slack bridge pause) brackets the
// stop. A rejected candidate still restores the incumbent, with the hold released after it.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ExecCommandModule from './remote-exec/remote-exec-command'
import type * as RecordFile from '../managed-server/install/orcad-remote-record-file'
import type * as InstallLock from '../managed-server/install/remote-install-lock'
import type * as VersionedInstall from '../managed-server/install/remote-versioned-install'

vi.mock('./remote-exec/remote-exec-command', async (importOriginal) => ({
  ...(await importOriginal<typeof ExecCommandModule>()),
  execCommand: vi.fn()
}))
vi.mock('../../shared/shell-argument-quoting', () => ({ quotePosixShell: (s: string) => `'${s}'` }))
vi.mock('../managed-server/install/remote-install-lock', async (importOriginal) => ({
  ...(await importOriginal<typeof InstallLock>()),
  acquireInstallLock: vi.fn()
}))
vi.mock('../managed-server/install/orcad-remote-record-file', async (importOriginal) => ({
  ...(await importOriginal<typeof RecordFile>()),
  writeAtomicOrcadRemoteRecord: vi.fn()
}))
vi.mock('../managed-server/install/remote-versioned-install', async (importOriginal) => ({
  ...(await importOriginal<typeof VersionedInstall>()),
  readLocalFullVersion: () => '0.2.0+bb01'
}))
vi.mock('../managed-server/install/orcad-remote-install', () => ({ installOrcadBundle: vi.fn() }))
vi.mock('../managed-server/install/orcad-remote-preflight', () => ({
  preflightInstalledOrcad: vi.fn()
}))
vi.mock('./orcad-local-build-hash', () => ({
  computeLocalOrcadBuildHash: () => 'abc123def4567890'
}))

import { execCommand } from './remote-exec/remote-exec-command'
import { acquireInstallLock } from '../managed-server/install/remote-install-lock'
import { writeAtomicOrcadRemoteRecord } from '../managed-server/install/orcad-remote-record-file'
import { deployOrcad } from './orcad-remote-deploy'
import { getRemoteHostPlatform } from './ssh-remote-platform'
import type { OrcadTerminalCensus } from '../../shared/orcad-terminal-census'
import type { OrcadDeployOptions } from './orcad-remote-deploy'
import {
  FakeOrcadHost,
  NEW,
  OLD
} from '../managed-server/activation/orcad-activation-host-test-harness'

let host = FakeOrcadHost.deployedOld()

const LIVE = { liveSessions: 2, startedSinceActivation: 1, daemonProtocolVersion: 3 }

function deploy(
  census: OrcadTerminalCensus,
  extra: Pick<OrcadDeployOptions, 'carryLiveTerminals' | 'holdActivation'> = {}
) {
  return deployOrcad({
    conn: Object.create(null),
    host: getRemoteHostPlatform('linux-x64'),
    remoteHome: '/home/work',
    nodePath: '/usr/bin/node',
    userDataDir: '/home/work/.orca',
    bindHost: '127.0.0.1',
    port: 7777,
    readinessTimeoutMs: 50,
    sleep: async () => {},
    localOrcadDir: '/local/out/orcad',
    target: 'linux-x64-glibc217',
    census,
    recountCensus: async () => census,
    releaseIncumbentAdmission: async () => {},
    ...extra
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  host = FakeOrcadHost.deployedOld()
  vi.mocked(execCommand).mockImplementation(async (_conn, command) => host.exec(command))
  vi.mocked(acquireInstallLock).mockImplementation(async (_conn, _dir, _host, options) => {
    host.acquireFence(options)
  })
  vi.mocked(writeAtomicOrcadRemoteRecord).mockImplementation(async (_target, path, contents) =>
    host.write(path, contents)
  )
})

const stopped = (): boolean => host.commands.some((command) => command.includes('kill -TERM'))

describe('the automatic update on a host whose terminals keep running', () => {
  it('defers over counted terminals unless the update carries them', async () => {
    await expect(deploy(LIVE)).resolves.toMatchObject({
      outcome: 'installed-not-activated',
      code: 'orcad_update_terminals_running'
    })
    await expect(deploy(LIVE, { carryLiveTerminals: true })).resolves.toMatchObject({
      outcome: 'installed-and-activated'
    })
    expect([...host.alive]).toEqual([NEW])
  })
})

describe("the automatic update's hold around the stop", () => {
  it('pauses before anything stops and resumes once the new server is recorded', async () => {
    const order: string[] = []
    const release = vi.fn(async () => {
      order.push(`release:${host.activeVersion()}`)
    })
    const holdActivation = vi.fn(async () => {
      order.push(`hold:stopped=${stopped()}`)
      return { release }
    })
    await expect(deploy(LIVE, { carryLiveTerminals: true, holdActivation })).resolves.toMatchObject(
      {
        outcome: 'installed-and-activated'
      }
    )
    expect(order).toEqual(['hold:stopped=false', `release:${NEW}`])
  })

  it('leaves the old server serving when chats started since the first check', async () => {
    const holdActivation = vi.fn(async () => ({
      refused: { code: 'orcad_update_agents_working', reason: '1 agent working on VIP' }
    }))
    await expect(deploy(LIVE, { carryLiveTerminals: true, holdActivation })).resolves.toMatchObject(
      {
        outcome: 'installed-not-activated',
        code: 'orcad_update_agents_working'
      }
    )
    expect(stopped()).toBe(false)
    expect([...host.alive]).toEqual([OLD])
  })

  it('rolls a rejected candidate back to the old server and still resumes the paused bridge', async () => {
    // The new build never becomes ready: its launch leaves a pid file but no live server.
    vi.mocked(execCommand).mockImplementation(async (_conn, command) => {
      if (command.includes('nohup') && command.includes(`orcad-${NEW}`)) {
        host.pidFiles.add(NEW)
        return '9999'
      }
      return host.exec(command)
    })
    const release = vi.fn(async () => {})
    const result = await deploy(LIVE, {
      carryLiveTerminals: true,
      holdActivation: async () => ({ release })
    })
    expect(result.outcome).toBe('installed-not-activated')
    expect([...host.alive]).toEqual([OLD])
    expect(host.activeVersion()).toBe(OLD)
    expect(release).toHaveBeenCalledTimes(1)
  })
})
