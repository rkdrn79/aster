import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { useCompactDrawer } from '@/app-shell/compact-drawer-store'
import { usePhoneNavigation } from './phone-navigation-store'

/**
 * A workspace picked in the sidebar drawer opens full screen, like a session picked in a list.
 * Must subscribe before useCompactSidebarDrawer, whose listener closes the drawer on the same write.
 */
export function usePhoneDrawerNavigation(): void {
  useEffect(
    () =>
      useAppStore.subscribe((state, previous) => {
        const worktreeId = state.activeWorktreeId
        if (
          !useCompactDrawer.getState().open ||
          !worktreeId ||
          worktreeId === previous.activeWorktreeId ||
          state.activeView !== 'terminal'
        ) {
          return
        }
        const worktree = state.getKnownWorktreeById(worktreeId)
        usePhoneNavigation.getState().push({
          kind: 'workbench',
          target: { kind: 'workspace', worktreeId },
          title: worktree?.displayName || 'Workspace'
        })
      }),
    []
  )
}
