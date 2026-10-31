import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { useResearchHistory } from '@/features/research/research-history-store'
import { useCompactDrawer } from './compact-drawer-store'

function closeDrawer(): void {
  useCompactDrawer.getState().setOpen(false)
}

/** Closes the compact sidebar drawer when the user navigates or the viewport widens. */
export function useCompactSidebarDrawer(compact: boolean): void {
  useEffect(() => {
    if (!compact) {
      closeDrawer()
      return
    }
    const unsubscribeApp = useAppStore.subscribe((state, previous) => {
      if (
        state.activeView !== previous.activeView ||
        state.activeWorktreeId !== previous.activeWorktreeId
      ) {
        closeDrawer()
      }
    })
    // Why: Experiment and page picks in Research don't change the view, but do land in its history.
    const unsubscribeHistory = useResearchHistory.subscribe((state, previous) => {
      if (state.history !== previous.history) {
        closeDrawer()
      }
    })
    return () => {
      unsubscribeApp()
      unsubscribeHistory()
    }
  }, [compact])
}
