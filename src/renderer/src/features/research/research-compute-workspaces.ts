import type { AppState } from '@/store/types'
import { selectFolderWorkspaces, selectWorktreesByRepo } from '@/store/workspace-record-selectors'
import {
  getRepoExecutionHostId,
  getSshTargetIdForExecutionHost,
  getWorktreeExecutionHostId,
  parseExecutionHostId
} from '../../../../shared/execution-host'
import type { ResearchComputeLink } from '../../../../shared/research/research-compute-links'
import { matchResearchComputeFolder } from '../../../../shared/research/research-compute-folder-match'
import { computeLinkFolderName } from './research-compute-link-folders'

export type ResearchComputeWorkspace = {
  path: string
  workspaceName: string
  projectKey: string
  projectName: string
  badgeColor: string | null
}

type WorkspaceSourceState = Pick<
  AppState,
  'repos' | 'worktreesByRepo' | 'projects' | 'folderWorkspaces' | 'projectGroups'
>

/**
 * Every folder on this SSH target that belongs to a project open in Aster: folders the user linked
 * to one first (an explicit choice wins for the same path), then workspaces whose files live there.
 */
export function selectResearchComputeWorkspaces(
  state: WorkspaceSourceState,
  targetId: string,
  links: readonly ResearchComputeLink[] = []
): ResearchComputeWorkspace[] {
  const workspaces = new Map<string, ResearchComputeWorkspace>()
  const add = (workspace: ResearchComputeWorkspace): void => {
    if (workspace.path !== '/' && !workspaces.has(workspace.path)) {
      workspaces.set(workspace.path, workspace)
    }
  }
  for (const link of links) {
    if (link.targetId !== targetId) {
      continue
    }
    // Why skip: Compute lists only projects open in Aster; a link to a closed one waits for it.
    const project = state.projects.find((entry) => entry.id === link.projectId)
    if (!project) {
      continue
    }
    add({
      path: link.remotePath,
      workspaceName: computeLinkFolderName(link.remotePath),
      projectKey: `project:${project.id}`,
      projectName: project.displayName,
      badgeColor: project.badgeColor ?? null
    })
  }
  for (const repo of state.repos) {
    const repoProject =
      state.projects.find((project) => project.sourceRepoIds.includes(repo.id)) ?? null
    for (const worktree of selectWorktreesByRepo(state)[repo.id] ?? []) {
      if (getSshTargetIdForExecutionHost(getWorktreeExecutionHostId(worktree, repo)) !== targetId) {
        continue
      }
      const project = state.projects.find((entry) => entry.id === worktree.projectId) ?? repoProject
      add({
        path: worktree.path,
        workspaceName: worktree.displayName || worktree.path,
        projectKey: project ? `project:${project.id}` : `repo:${repo.id}`,
        projectName: project?.displayName ?? repo.displayName,
        badgeColor: project?.badgeColor ?? repo.badgeColor ?? null
      })
    }
    if (getSshTargetIdForExecutionHost(getRepoExecutionHostId(repo)) === targetId) {
      add({
        path: repo.path,
        workspaceName: repo.displayName,
        projectKey: repoProject ? `project:${repoProject.id}` : `repo:${repo.id}`,
        projectName: repoProject?.displayName ?? repo.displayName,
        badgeColor: repoProject?.badgeColor ?? repo.badgeColor ?? null
      })
    }
  }
  for (const folder of selectFolderWorkspaces(state)) {
    const group = state.projectGroups.find((entry) => entry.id === folder.projectGroupId)
    const explicitHost = parseExecutionHostId(folder.executionHostId ?? group?.executionHostId)
    const folderTargetId = explicitHost
      ? getSshTargetIdForExecutionHost(explicitHost.id)
      : folder.connectionId?.trim() || group?.connectionId?.trim() || null
    if (folderTargetId !== targetId) {
      continue
    }
    add({
      path: folder.folderPath,
      workspaceName: folder.name,
      projectKey: group ? `group:${group.id}` : `folder:${folder.id}`,
      projectName: group?.name ?? folder.name,
      badgeColor: group?.color ?? null
    })
  }
  return [...workspaces.values()]
}

export type ResearchComputeAttribution = {
  workspace: ResearchComputeWorkspace
  matchedBy: 'cwd' | 'command'
}

/**
 * Longest workspace root containing the working directory (a PID's cwd or a job's WorkDir),
 * else an absolute path in its command line (argv or the batch script).
 */
export function attributeResearchComputePath(
  source: { cwd: string | null; command: string | null },
  workspaces: readonly ResearchComputeWorkspace[],
  resolvedWorkspacePaths: Readonly<Record<string, string>>
): ResearchComputeAttribution | null {
  const match = matchResearchComputeFolder(source, workspaces, resolvedWorkspacePaths)
  return match ? { workspace: match.folder, matchedBy: match.matchedBy } : null
}
