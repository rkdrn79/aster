// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerAutoUpdateHostStatus } from '../../../../shared/server-auto-update'

const setServerAutoUpdateStatuses = vi.hoisted(() => vi.fn())
vi.mock('../../store', () => ({
  useAppStore: { getState: () => ({ setServerAutoUpdateStatuses }) }
}))

import { registerServerAutoUpdateIpcBridge } from './server-auto-update-ipc-bridge'

function host(environmentId: string, phase: ServerAutoUpdateHostStatus['phase']) {
  return {
    environmentId,
    sshTargetId: `ssh-${environmentId}`,
    hostLabel: environmentId,
    mode: 'idle',
    modeSource: 'global',
    activeVersion: '1.2.3',
    bundledVersion: '1.2.3',
    phase
  } satisfies ServerAutoUpdateHostStatus
}

function stubApi(managedOrcad: unknown): void {
  vi.stubGlobal('window', Object.assign(window, { api: { runtimeEnvironments: { managedOrcad } } }))
}

beforeEach(() => {
  setServerAutoUpdateStatuses.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('registerServerAutoUpdateIpcBridge', () => {
  it('reads the statuses once, then follows each broadcast', async () => {
    let push: (statuses: ServerAutoUpdateHostStatus[]) => void = () => {}
    const unsubscribe = vi.fn()
    stubApi({
      autoUpdateStatus: vi.fn(async () => [host('a', 'up-to-date')]),
      onAutoUpdateChanged: vi.fn((callback) => {
        push = callback
        return unsubscribe
      })
    })
    const unsubs: (() => void)[] = []
    registerServerAutoUpdateIpcBridge(unsubs)
    await vi.waitFor(() =>
      expect(setServerAutoUpdateStatuses).toHaveBeenCalledWith([host('a', 'up-to-date')])
    )
    push([host('a', 'updating')])
    expect(setServerAutoUpdateStatuses).toHaveBeenLastCalledWith([host('a', 'updating')])
    expect(unsubs).toEqual([unsubscribe])
  })

  it('lets a broadcast that lands before the first read win over it', async () => {
    let push: (statuses: ServerAutoUpdateHostStatus[]) => void = () => {}
    let resolveRead: (statuses: ServerAutoUpdateHostStatus[]) => void = () => {}
    stubApi({
      autoUpdateStatus: () => new Promise((resolve) => (resolveRead = resolve)),
      onAutoUpdateChanged: (callback: typeof push) => {
        push = callback
        return () => {}
      }
    })
    registerServerAutoUpdateIpcBridge([])
    push([host('a', 'updating')])
    resolveRead([host('a', 'up-to-date')])
    await Promise.resolve()
    await Promise.resolve()
    expect(setServerAutoUpdateStatuses).toHaveBeenCalledTimes(1)
    expect(setServerAutoUpdateStatuses).toHaveBeenCalledWith([host('a', 'updating')])
  })

  it('does nothing where the managed API does not exist', () => {
    stubApi(undefined)
    const unsubs: (() => void)[] = []
    registerServerAutoUpdateIpcBridge(unsubs)
    expect(unsubs).toEqual([])
    expect(setServerAutoUpdateStatuses).not.toHaveBeenCalled()
  })
})
