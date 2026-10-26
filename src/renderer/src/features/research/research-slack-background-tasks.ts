import { create, type StoreApi } from 'zustand'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { ResearchDelegationRecord } from '../../../../shared/research/research-records'
import type { ResearchHomeProject } from './research-home-projects'
import { parseRoutableExecutionHostId } from '../../../../shared/execution-host'

type SlackTaskEntry = { scope: string; delegation: ResearchDelegationRecord }
type SlackTaskState = {
  entries: SlackTaskEntry[]
  errors: Record<string, string>
  refresh: (project: ResearchHomeProject) => Promise<void>
  setWorkbenchVisible: (id: string, visible: boolean) => void
}

const pending = new Map<string, Promise<void>>()

export const useResearchSlackBackgroundTasks = create<SlackTaskState>((set, get) => ({
  entries: [],
  errors: {},
  refresh: (project) => {
    const remotes = project.workspaces.filter((workspace) => {
      const kind = parseRoutableExecutionHostId(workspace.executionHostId ?? 'local')?.kind
      return kind === 'ssh' || kind === 'runtime'
    })
    if (!remotes.length || !window.api.researchSlack?.getRemoteProjectTasks) {
      return Promise.resolve()
    }
    return Promise.all(
      [...new Set(remotes.map((workspace) => workspace.executionHostId).filter((id) => !!id))].map(
        (hostId) => refreshHost(project, hostId, set, get)
      )
    ).then(() => undefined)
  },
  setWorkbenchVisible: (id, visible) =>
    set((state) => ({
      entries: state.entries.map((entry) =>
        entry.delegation.id === id
          ? { ...entry, delegation: { ...entry.delegation, workbenchVisible: visible } }
          : entry
      )
    }))
}))

function refreshHost(
  project: ResearchHomeProject,
  hostId: string,
  set: StoreApi<SlackTaskState>['setState'],
  get: StoreApi<SlackTaskState>['getState']
): Promise<void> {
  const scope = `${hostId}:${project.key}`
  const active = pending.get(scope)
  if (active) {
    return active
  }
  const request = window.api.researchSlack
    .getRemoteProjectTasks({ executionHostId: hostId, projectKey: project.key })
    .then((result) => {
      const workspace = project.workspaces.find(
        (entry) => entry.path === result.workspacePath && entry.executionHostId === hostId
      )
      set((state) => {
        if (!(scope in state.errors)) {
          return state
        }
        const errors = { ...state.errors }
        delete errors[scope]
        return { errors }
      })
      if (!workspace || !result.agent) {
        set((state) => ({ entries: state.entries.filter((entry) => entry.scope !== scope) }))
        return
      }
      const previous = new Map(
        get()
          .entries.filter((entry) => entry.scope === scope)
          .map((entry) => [entry.delegation.sessionId, entry.delegation])
      )
      const next = result.sessions.map(({ channelId, threadTs, sessionId }) => {
        const old = previous.get(sessionId)
        if (old) {
          return { scope, delegation: old }
        }
        const createdAt = new Date(Number(threadTs) * 1000).toISOString()
        const delegation: ResearchDelegationRecord = {
          id: createBrowserUuid(),
          sourceWorkspaceId: workspace.id,
          sourceHostId: hostId,
          sourceExperimentId: null,
          targetWorkspaceId: workspace.id,
          targetHostId: hostId,
          targetLabel: project.name,
          agent: result.agent!,
          task: `Slack · ${channelId} · ${new Date(createdAt).toLocaleString()}`,
          tabId: null,
          sessionId,
          state: 'ready',
          createdAt,
          updatedAt: createdAt
        }
        return { scope, delegation }
      })
      set((state) => {
        const current = state.entries.filter((entry) => entry.scope === scope)
        if (
          current.length === next.length &&
          current.every((entry, index) => entry.delegation === next[index]?.delegation)
        ) {
          return state
        }
        return {
          entries: [...state.entries.filter((entry) => entry.scope !== scope), ...next]
        }
      })
    })
    .catch((cause) => {
      set((state) => ({ errors: { ...state.errors, [scope]: String(cause) } }))
      throw cause
    })
    .finally(() => pending.delete(scope))
  pending.set(scope, request)
  return request
}
