import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { launchAgentInNewTab, nameResearchChat, trackDelegationLaunch, update, surface } =
  vi.hoisted(() => ({
    launchAgentInNewTab: vi.fn(),
    nameResearchChat: vi.fn(),
    trackDelegationLaunch: vi.fn(),
    update: vi.fn(),
    surface: vi.fn<() => unknown>(() => null)
  }))

vi.mock('@/lib/launch-agent-in-new-tab', () => ({ launchAgentInNewTab }))
vi.mock('@/lib/agent-launch-request-id', () => ({ newAgentLaunchRequestId: () => 'request-1' }))
vi.mock('./research-chat-label', () => ({ nameResearchChat }))
vi.mock('./research-delegation-launch', () => ({ trackDelegationLaunch }))
vi.mock('./research-records-store', () => ({
  useResearchRecords: { getState: () => ({ update }) }
}))
vi.mock('./research-window-surface', () => ({ researchWindowSurfaceTarget: surface }))

import { launchResearchBackgroundAgent } from './research-background-agent-launch'

const launch = {
  agent: 'claude' as const,
  hostId: 'runtime:gpu',
  workspaceId: 'wt-1',
  surface: 'chat' as const,
  prompt: 'Judge the samples.',
  promptDelivery: 'auto-submit' as const,
  label: 'Judge · samples',
  noFallbackTerminal: true
}
const delegation = {
  id: '6f1b6a7e-3c1f-4a59-9a43-1f2c7b0d9e21',
  sourceWorkspaceId: 'wt-1',
  sourceHostId: 'runtime:gpu',
  sourceExperimentId: null,
  targetWorkspaceId: 'wt-1',
  targetHostId: 'runtime:gpu',
  targetLabel: 'Project',
  agent: 'claude',
  task: 'Judge outputs: samples'
}
const runAction = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  surface.mockReturnValue(null)
  update.mockResolvedValue(undefined)
  vi.stubGlobal('window', { api: { researchWindow: { runAction } } })
})

afterEach(() => vi.unstubAllGlobals())

describe('launchResearchBackgroundAgent', () => {
  it('in a research window, asks the main window and starts nothing here', async () => {
    surface.mockReturnValue({ page: 'research-experiments', workspaceId: 'wt-1', hostId: 'local' })
    runAction.mockResolvedValue({ ok: true, delegationId: delegation.id })

    await expect(launchResearchBackgroundAgent(launch, delegation)).resolves.toEqual({
      ok: true,
      delegationId: delegation.id
    })
    expect(runAction).toHaveBeenCalledWith({
      kind: 'launch-background-agent',
      launch,
      delegation
    })
    expect(launchAgentInNewTab).not.toHaveBeenCalled()
  })

  it('in the main window, starts it, names it, lists it and follows it', async () => {
    const result = { surface: { kind: 'local-chat', tabId: 'tab-9' } }
    launchAgentInNewTab.mockReturnValue(result)
    let saved: unknown = null
    update.mockImplementation(async (change: (doc: { delegations: unknown[] }) => unknown) => {
      saved = change({ delegations: [] })
    })

    await expect(launchResearchBackgroundAgent(launch, delegation)).resolves.toEqual({
      ok: true,
      delegationId: delegation.id
    })
    expect(launchAgentInNewTab).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedSurface: 'chat',
        selectedExecutionHostId: 'runtime:gpu',
        worktreeId: 'wt-1',
        prompt: 'Judge the samples.',
        promptDelivery: 'auto-submit',
        activate: false,
        onStructuredHostDeclined: expect.any(Function)
      })
    )
    expect(nameResearchChat).toHaveBeenCalledWith('wt-1', result, 'Judge · samples')
    expect(saved).toEqual({
      delegations: [
        expect.objectContaining({
          ...delegation,
          tabId: 'tab-9',
          state: 'launching',
          sessionId: null
        })
      ]
    })
    expect(trackDelegationLaunch).toHaveBeenCalledWith(delegation.id, result)
  })

  it('says whether the agent never started or was started but not listed', async () => {
    launchAgentInNewTab.mockReturnValue(null)
    await expect(launchResearchBackgroundAgent(launch, delegation)).resolves.toMatchObject({
      ok: false,
      stage: 'launch'
    })

    launchAgentInNewTab.mockReturnValue({ surface: { kind: 'host-published' } })
    update.mockRejectedValue(new Error('stale'))
    await expect(launchResearchBackgroundAgent(launch, delegation)).resolves.toMatchObject({
      ok: false,
      stage: 'record'
    })
    expect(trackDelegationLaunch).not.toHaveBeenCalled()
  })
})
