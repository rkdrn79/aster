import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_TABS_ORCHESTRATION_LINEAGE_RUNTIME_CAPABILITY } from '../../../../shared/session-tabs-runtime-capabilities'

const mocks = vi.hoisted(() => ({
  callRuntimeRpc: vi.fn(),
  setRuntimeAgentOrchestrationByPaneKey: vi.fn(),
  runtimeStatusByEnvironmentId: new Map<string, { status: { capabilities: string[] } }>()
}))
vi.mock('../runtime-rpc-client', () => ({ callRuntimeRpc: mocks.callRuntimeRpc }))
vi.mock('../../store', () => ({
  useAppStore: {
    getState: () => ({
      runtimeStatusByEnvironmentId: mocks.runtimeStatusByEnvironmentId,
      setRuntimeAgentOrchestrationByPaneKey: mocks.setRuntimeAgentOrchestrationByPaneKey
    })
  }
}))

const COORDINATOR_LEAF = '11111111-1111-4111-8111-111111111111'
const WORKER_LEAF = '22222222-2222-4222-8222-222222222222'
const LOCAL_ROW = { 'local-tab:leaf': { taskId: 'local', dispatchId: 'local-dispatch' } }
const HOST_ANSWER = {
  agentOrchestrationByPaneKey: {
    [`worker:${WORKER_LEAF}`]: {
      taskId: 't',
      dispatchId: 'd',
      parentPaneKey: `coordinator:${COORDINATOR_LEAF}`
    }
  }
}
const MIRRORED_ROW = {
  [`web-terminal-worker:${WORKER_LEAF}`]: {
    taskId: 't',
    dispatchId: 'd',
    parentPaneKey: `web-terminal-coordinator:${COORDINATOR_LEAF}`
  }
}

async function loadModules() {
  const lineage = await import('./host-orchestration-lineage')
  const sources = await import('../agent-orchestration-lineage-sources')
  return { ...lineage, ...sources }
}

function lastPublished(): unknown {
  return mocks.setRuntimeAgentOrchestrationByPaneKey.mock.lastCall?.[0]
}

describe('host orchestration lineage', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    mocks.callRuntimeRpc.mockReset()
    mocks.setRuntimeAgentOrchestrationByPaneKey.mockReset()
    mocks.runtimeStatusByEnvironmentId.clear()
    mocks.runtimeStatusByEnvironmentId.set('vip', {
      status: { capabilities: [SESSION_TABS_ORCHESTRATION_LINEAGE_RUNTIME_CAPABILITY] }
    })
    mocks.runtimeStatusByEnvironmentId.set('old-host', { status: { capabilities: [] } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('never asks a host that does not advertise lineage and leaves the store as it was', async () => {
    const { scheduleHostOrchestrationLineageRefresh, forgetHostOrchestrationLineage } =
      await loadModules()

    scheduleHostOrchestrationLineageRefresh('old-host')
    await vi.advanceTimersByTimeAsync(1_000)
    forgetHostOrchestrationLineage('old-host')

    expect(mocks.callRuntimeRpc).not.toHaveBeenCalled()
    expect(mocks.setRuntimeAgentOrchestrationByPaneKey).not.toHaveBeenCalled()
  })

  it('merges each host beside the local runtime, rekeyed to mirrored tabs, without clobbering either', async () => {
    const {
      scheduleHostOrchestrationLineageRefresh,
      forgetHostOrchestrationLineage,
      publishLocalOrchestrationLineage
    } = await loadModules()
    const setLineage = mocks.setRuntimeAgentOrchestrationByPaneKey
    publishLocalOrchestrationLineage(setLineage, LOCAL_ROW)
    mocks.callRuntimeRpc.mockResolvedValueOnce(HOST_ANSWER)

    scheduleHostOrchestrationLineageRefresh('vip')
    scheduleHostOrchestrationLineageRefresh('vip')
    await vi.advanceTimersByTimeAsync(1_000)

    expect(mocks.callRuntimeRpc).toHaveBeenCalledTimes(1)
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'vip' },
      'session.tabs.orchestrationLineage',
      undefined,
      expect.any(Object)
    )
    expect(lastPublished()).toEqual({ ...LOCAL_ROW, ...MIRRORED_ROW })

    publishLocalOrchestrationLineage(setLineage, {})
    expect(lastPublished()).toEqual(MIRRORED_ROW)

    mocks.callRuntimeRpc.mockRejectedValueOnce(new Error('ssh tunnel hiccup'))
    scheduleHostOrchestrationLineageRefresh('vip')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(lastPublished()).toEqual(MIRRORED_ROW)

    publishLocalOrchestrationLineage(setLineage, LOCAL_ROW)
    forgetHostOrchestrationLineage('vip')
    expect(lastPublished()).toEqual(LOCAL_ROW)
  })
})
