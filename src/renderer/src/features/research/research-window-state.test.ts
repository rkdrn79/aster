import { describe, expect, it } from 'vitest'
import type { AppState } from '@/store/types'
import { pickResearchWindowState, researchWindowStateChanged } from './research-window-state'

function makeState(overrides: Partial<AppState> = {}): AppState {
  const base = {
    repos: [],
    worktreesByRepo: {},
    detectedWorktreesByRepo: {},
    folderWorkspaces: [],
    projectGroups: [],
    projects: [],
    projectHostSetups: [],
    lastVisitedAtByWorktreeId: {},
    runtimeEnvironments: [],
    runtimeEnvironmentCatalogHydrated: true,
    removedRuntimeEnvironmentIds: new Set<string>(),
    restoredRuntimeHostIdByWorkspaceSessionKey: {},
    runtimeStatusByEnvironmentId: new Map(),
    sshStateByEnvironment: new Map(),
    settings: null,
    sshConnectionStates: new Map(),
    sshTargetLabels: new Map(),
    unifiedTabsByWorktree: {},
    groupsByWorktree: {},
    tabsByWorktree: {},
    agentStatusByPaneKey: {}
  }
  // Only the slices the research window reads; the rest of AppState is not consulted here.
  return Object.assign(Object.create(null), base, overrides)
}

describe('research window state', () => {
  it('carries each host connection a remote project window reads', () => {
    const statuses = new Map([['env-1', { status: null, checkedAt: 1 }]])
    const picked = pickResearchWindowState(makeState({ runtimeStatusByEnvironmentId: statuses }))

    expect(picked.runtimeStatusByEnvironmentId).toBe(statuses)
  })

  it('republishes when a host connects, drops, or returns', () => {
    const before = makeState({ runtimeStatusByEnvironmentId: new Map() })
    const after: AppState = {
      ...before,
      runtimeStatusByEnvironmentId: new Map([['env-1', { status: null, checkedAt: 2 }]])
    }

    expect(researchWindowStateChanged(before, after)).toBe(true)
    expect(researchWindowStateChanged(before, makeState({ ...before }))).toBe(false)
  })
})
