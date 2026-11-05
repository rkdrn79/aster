import type { AppState } from '@/store/types'
import {
  selectDetectedWorktreesByRepo,
  selectFolderWorkspaces,
  selectWorktreesByRepo
} from '@/store/workspace-record-selectors'

/** What a research page window needs from the main window: its workspace, project and chat tabs. */
export function pickResearchWindowState(state: AppState) {
  return {
    repos: state.repos,
    worktreesByRepo: selectWorktreesByRepo(state),
    detectedWorktreesByRepo: selectDetectedWorktreesByRepo(state),
    folderWorkspaces: selectFolderWorkspaces(state),
    projectGroups: state.projectGroups,
    projects: state.projects,
    projectHostSetups: state.projectHostSetups,
    lastVisitedAtByWorktreeId: state.lastVisitedAtByWorktreeId,
    runtimeEnvironments: state.runtimeEnvironments,
    runtimeEnvironmentCatalogHydrated: state.runtimeEnvironmentCatalogHydrated,
    removedRuntimeEnvironmentIds: state.removedRuntimeEnvironmentIds,
    restoredRuntimeHostIdByWorkspaceSessionKey: state.restoredRuntimeHostIdByWorkspaceSessionKey,
    settings: state.settings,
    sshConnectionStates: state.sshConnectionStates,
    sshTargetLabels: state.sshTargetLabels,
    // The workspace's chat tabs, so a Writing or Library pane shows the chat bound to it.
    unifiedTabsByWorktree: state.unifiedTabsByWorktree,
    groupsByWorktree: state.groupsByWorktree,
    tabsByWorktree: state.tabsByWorktree,
    agentStatusByPaneKey: state.agentStatusByPaneKey
  }
}

export type ResearchWindowState = ReturnType<typeof pickResearchWindowState>

export function isResearchWindowState(value: unknown): value is ResearchWindowState {
  return (
    value !== null &&
    typeof value === 'object' &&
    'repos' in value &&
    Array.isArray(value.repos) &&
    'projects' in value &&
    Array.isArray(value.projects) &&
    'worktreesByRepo' in value &&
    typeof value.worktreesByRepo === 'object' &&
    'settings' in value
  )
}

export function researchWindowStateChanged(a: AppState, b: AppState): boolean {
  const before = Object.values(pickResearchWindowState(a))
  const after = Object.values(pickResearchWindowState(b))
  return before.some((value, index) => value !== after[index])
}
