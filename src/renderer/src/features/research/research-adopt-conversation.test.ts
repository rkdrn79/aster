import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  targetForHost: vi.fn(),
  callRuntimeRpc: vi.fn()
}))

vi.mock('@/store', () => ({ useAppStore: { getState: mocks.getState } }))
vi.mock('@/runtime/runtime-client-target', () => ({
  ipcOrRuntimeTargetForHostId: mocks.targetForHost
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: mocks.callRuntimeRpc }))
vi.mock('./research-records-store', () => ({ useResearchRecords: { getState: vi.fn() } }))

import { resolveResearchAdoptAgent } from './research-adopt-conversation'

describe('resolveResearchAdoptAgent', () => {
  beforeEach(() => {
    mocks.getState.mockReturnValue({ settings: { defaultTuiAgent: 'claude' } })
    mocks.targetForHost.mockReset()
    mocks.callRuntimeRpc.mockReset()
  })

  it('uses the Research host host default instead of the Mac default', async () => {
    mocks.targetForHost.mockReturnValue({ kind: 'environment', environmentId: 'research' })
    mocks.callRuntimeRpc.mockResolvedValue({
      settings: { defaultTuiAgent: 'codex', disabledTuiAgents: [] }
    })

    await expect(resolveResearchAdoptAgent('runtime:research')).resolves.toBe('codex')
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'research' },
      'settings.get',
      undefined,
      { timeoutMs: 15_000 }
    )
  })

  it('uses the local default only for a local project', async () => {
    mocks.targetForHost.mockReturnValue({ kind: 'local' })

    await expect(resolveResearchAdoptAgent('local')).resolves.toBe('claude')
    expect(mocks.callRuntimeRpc).not.toHaveBeenCalled()
  })

  it('refuses an unavailable host default instead of silently starting Claude', async () => {
    mocks.targetForHost.mockReturnValue({ kind: 'environment', environmentId: 'research' })
    mocks.callRuntimeRpc.mockResolvedValue({ settings: { defaultTuiAgent: 'blank' } })

    await expect(resolveResearchAdoptAgent('runtime:research')).rejects.toThrow(
      'Set an available default agent on the project host'
    )
  })
})
