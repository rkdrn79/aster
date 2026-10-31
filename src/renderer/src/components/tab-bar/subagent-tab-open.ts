import { useAppStore } from '@/store'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import type { Tab } from '../../../../shared/tab-types'

/** Opens a subagent as its group's active tab; the strip drops it again once another tab is chosen. */
export function openSubagentTab(tab: Tab): boolean {
  const revealed = activateAndRevealWorkspace(
    tab.worktreeId,
    tab.executionHostId ? { executionHostId: tab.executionHostId } : undefined
  )
  if (revealed === false) {
    return false
  }
  useAppStore.getState().activateTab(tab.id, { worktreeId: tab.worktreeId })
  return true
}
