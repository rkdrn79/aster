import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  runtimeCall: vi.fn(),
  list: vi.fn(),
  listHost: vi.fn(),
  start: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/profile' },
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      mocks.handlers.set(name, handler)
    }
  }
}))
vi.mock('../startup/main-process-state', () => ({
  mainProcessState: {
    store: { getRepos: () => [], getWorktreeMetaForHost: () => undefined }
  }
}))
vi.mock('../ipc/runtime-environments/runtime-environment-transport-routing', () => ({
  callRuntimeEnvironment: (...args: unknown[]) => mocks.runtimeCall(...args)
}))
vi.mock('../ssh/targets/ssh-target-registry', () => ({
  listRegisteredSshTargets: () => [
    { id: 'ssh-research', orcadFence: { environmentId: 'research' } }
  ]
}))
vi.mock('./research-paseo-companion', () => ({
  listPaseoProjectAgents: (...args: unknown[]) => mocks.list(...args),
  listPaseoHostAgents: (...args: unknown[]) => mocks.listHost(...args),
  getPaseoPhonePairingUrl: vi.fn(),
  setUpPaseoProjectDaemon: vi.fn(),
  readPaseoProjectAgentLog: vi.fn(),
  readPaseoHostAgentLog: vi.fn(),
  sendPaseoProjectAgentMessage: vi.fn(),
  sendPaseoHostAgentMessage: vi.fn()
}))
vi.mock('./research-paseo-agent-create', () => ({
  listPaseoProjectProviders: vi.fn(),
  startPaseoProjectAgent: (...args: unknown[]) => mocks.start(...args)
}))

import { registerResearchPaseoIpcHandlers } from './research-paseo-ipc'

const path = '/srv/projects/research/PaperProject'
const scope = { hostId: 'runtime:research', workspaceId: `repo::${path}`, workspacePath: path }

beforeEach(() => {
  mocks.handlers.clear()
  mocks.runtimeCall.mockReset()
  mocks.list.mockReset()
  mocks.listHost.mockReset()
  mocks.start.mockReset()
  registerResearchPaseoIpcHandlers()
})

describe('Paseo IPC workspace authorization', () => {
  it('accepts a remote workspace proved by its Aster runtime', async () => {
    mocks.runtimeCall.mockResolvedValue({
      ok: true,
      result: { worktree: { id: scope.workspaceId, repoId: 'repo', path } }
    })
    mocks.list.mockResolvedValue([])
    await expect(mocks.handlers.get('researchPaseo:list')?.(null, scope)).resolves.toEqual([])
    expect(mocks.runtimeCall).toHaveBeenCalledWith('/profile', 'research', 'worktree.show', {
      worktree: `id:${scope.workspaceId}`
    })
  })

  it('rejects a path the runtime did not register before reading Paseo', async () => {
    mocks.runtimeCall.mockResolvedValue({
      ok: true,
      result: { worktree: { id: scope.workspaceId, repoId: 'repo', path: '/different' } }
    })
    await expect(mocks.handlers.get('researchPaseo:list')?.(null, scope)).rejects.toThrow(
      'not registered'
    )
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('authorizes the selected host before listing all its Paseo agents', async () => {
    mocks.runtimeCall.mockResolvedValueOnce({
      ok: true,
      result: { worktree: { id: scope.workspaceId, repoId: 'repo', path } }
    })
    mocks.listHost.mockResolvedValueOnce([{ id: 'agent1234', cwd: '/another/project' }])
    await expect(mocks.handlers.get('researchPaseo:listHost')?.(null, scope)).resolves.toEqual([
      { id: 'agent1234', cwd: '/another/project' }
    ])
    expect(mocks.listHost).toHaveBeenCalledWith(scope)

    mocks.runtimeCall.mockResolvedValueOnce({
      ok: true,
      result: { worktree: { id: scope.workspaceId, repoId: 'repo', path: '/different' } }
    })
    await expect(mocks.handlers.get('researchPaseo:listHost')?.(null, scope)).rejects.toThrow(
      'not registered'
    )
    expect(mocks.listHost).toHaveBeenCalledTimes(1)
  })

  it('authorizes the workspace before starting a phone conversation', async () => {
    mocks.runtimeCall.mockResolvedValueOnce({
      ok: true,
      result: { worktree: { id: scope.workspaceId, repoId: 'repo', path } }
    })
    mocks.start.mockResolvedValueOnce('agent-id')
    await expect(
      mocks.handlers.get('researchPaseo:start')?.(null, scope, 'Check the latest PDF', 'codex')
    ).resolves.toBe('agent-id')
    expect(mocks.start).toHaveBeenCalledWith(scope, 'Check the latest PDF', 'codex')
    await expect(
      mocks.handlers.get('researchPaseo:start')?.(null, scope, '', 'codex')
    ).rejects.toThrow()
    expect(mocks.start).toHaveBeenCalledTimes(1)
  })
})
