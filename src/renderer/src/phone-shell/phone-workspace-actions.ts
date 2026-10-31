import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import type { ResearchHomeWorkspace } from '@/features/research/research-home-projects'
import { resolveUnifiedTabLabel } from '../../../shared/tab-title-resolution'
import { usePhoneNavigation } from './phone-navigation-store'

/** Opens a new terminal in the workspace through the store's own web-aware path, full screen. */
export async function startPhoneTerminal(
  workspace: Pick<ResearchHomeWorkspace, 'id' | 'executionHostId'>,
  subtitle: string,
  options?: { replaceScreen?: boolean }
): Promise<void> {
  activateAndRevealWorkspace(
    workspace.id,
    workspace.executionHostId ? { executionHostId: workspace.executionHostId } : undefined
  )
  const state = useAppStore.getState()
  const groupId =
    state.activeGroupIdByWorktree[workspace.id] ?? state.groupsByWorktree[workspace.id]?.[0]?.id
  const navigation = usePhoneNavigation.getState()
  ;(options?.replaceScreen ? navigation.replace : navigation.push)({
    kind: 'workbench',
    target: { kind: 'workspace', worktreeId: workspace.id },
    title: 'Terminal',
    subtitle
  })
  // Why no group is fine: activating an empty workspace seeds its first terminal itself.
  if (groupId) {
    await state.openNewTerminalTabInActiveWorkspace(groupId)
  }
}

/** The focused tab of the active workspace's focused group. */
export function selectActiveWorkbenchTabId(state: AppState): string | null {
  const worktreeId = state.activeWorktreeId
  if (!worktreeId) {
    return null
  }
  const groups = state.groupsByWorktree[worktreeId] ?? []
  const group =
    groups.find((entry) => entry.id === state.activeGroupIdByWorktree[worktreeId]) ?? groups[0]
  return group?.activeTabId ?? null
}

/** The focused tab's label in the active workspace, for headers that follow the workbench. */
export function selectActiveWorkbenchTabLabel(state: AppState): string | null {
  const worktreeId = state.activeWorktreeId
  const activeTabId = selectActiveWorkbenchTabId(state)
  if (!worktreeId || !activeTabId) {
    return null
  }
  const tab = state.unifiedTabsByWorktree[worktreeId]?.find((entry) => entry.id === activeTabId)
  return tab
    ? resolveUnifiedTabLabel(tab, state.settings?.tabAutoGenerateTitle === true) || null
    : null
}
