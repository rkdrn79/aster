import type { AppState } from '@/store/types'
import { selectWorkspaceByHostTarget } from '@/store/workspace-record-selectors'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import { getWorktreeAttachmentLabel } from '@/lib/worktree-attachment-label'
import { hostWorktreeTarget } from '../../../../shared/worktree/host-qualified-identity'

export function selectResearchWorkspaceContext(state: AppState) {
  const workspaceId = state.activeWorktreeId
  const hostId = getResolvedExecutionHostIdForWorktree(state, workspaceId)
  const workspace =
    workspaceId && hostId
      ? selectWorkspaceByHostTarget(state, hostWorktreeTarget({ id: workspaceId, hostId }))
      : undefined
  const setup =
    workspace && hostId
      ? state.projectHostSetups.find(
          (entry) => entry.repoId === workspace.repoId && entry.hostId === hostId
        )
      : undefined
  const project = setup ? state.projects.find((entry) => entry.id === setup.projectId) : undefined
  return {
    projectId: project?.id ?? null,
    hostId,
    workspaceId,
    workspaceName: workspace ? getWorktreeAttachmentLabel(workspace) : null,
    workspacePath: workspace?.path ?? null,
    projectName: project?.displayName ?? null,
    hostLabel: hostId ? selectExecutionHostDisplayLabel(state, hostId) : null
  }
}

/** The Library scope of a workspace by ID, as the Library page builds it for the open one. */
export function selectLibraryScopeKeyParts(
  state: AppState,
  workspaceId: string | null | undefined
): { hostId: string; workspacePath: string } | null {
  const hostId = workspaceId ? getResolvedExecutionHostIdForWorktree(state, workspaceId) : null
  const workspace =
    workspaceId && hostId
      ? selectWorkspaceByHostTarget(state, hostWorktreeTarget({ id: workspaceId, hostId }))
      : undefined
  return hostId && workspace?.path ? { hostId, workspacePath: workspace.path } : null
}
