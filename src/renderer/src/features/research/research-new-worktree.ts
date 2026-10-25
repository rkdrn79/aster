import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { findRepoForHost } from '@/store/slices/repo-host-identity'
import { getRepoWorkspaceCreationTargetHint } from '@/lib/project-host-workspace-target'
import { isGitRepoKind } from '../../../../shared/repo-kind'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { ResearchHomeWorkspace } from './research-home-projects'

export type ResearchWorktreeSource = Pick<
  ResearchHomeWorkspace,
  'repoId' | 'executionHostId' | 'isFolder'
>

/** A new worktree branches from the same repo on the same host; folder workspaces have no Git. */
function findWorktreeRepo(
  state: Pick<AppState, 'repos' | 'settings'>,
  source: ResearchWorktreeSource
): AppState['repos'][number] | null {
  if (source.isFolder) {
    return null
  }
  const repo = findRepoForHost(state.repos, source.repoId, {
    hostId: source.executionHostId,
    settings: state.settings
  })
  return repo && isGitRepoKind(repo) ? repo : null
}

export function canCreateResearchWorktree(
  state: Pick<AppState, 'repos' | 'settings'>,
  source: ResearchWorktreeSource | null
): boolean {
  return source !== null && findWorktreeRepo(state, source) !== null
}

/** Opens the regular worktree composer for this project, with the agent already chosen. */
export function openResearchNewWorktree(source: ResearchWorktreeSource, agent?: TuiAgent): void {
  const state = useAppStore.getState()
  const repo = findWorktreeRepo(state, source)
  if (!repo) {
    return
  }
  state.openModal('new-workspace-composer', {
    initialRepoId: repo.id,
    initialWorkspaceTarget: getRepoWorkspaceCreationTargetHint(repo, state.projectHostSetups),
    ...(agent ? { initialAgent: agent } : {}),
    telemetrySource: 'sidebar'
  })
}
