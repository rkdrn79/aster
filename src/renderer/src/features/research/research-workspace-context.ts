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
