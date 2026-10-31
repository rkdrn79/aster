import { create } from 'zustand'
import { useAppStore } from '@/store'
import { isCompactViewport } from './use-compact-viewport'

/**
 * Whether the phone-width sidebar drawer is showing. Kept apart from the persisted `sidebarOpen`,
 * which UI-state hydration can rewrite after load, so a phone always starts with the drawer closed.
 */
export const useCompactDrawer = create<{ open: boolean; setOpen: (open: boolean) => void }>(
  (set) => ({ open: false, setOpen: (open) => set({ open }) })
)

/** The left-sidebar toggle: the drawer on a compact viewport, the docked sidebar otherwise. */
export function toggleLeftSidebar(): void {
  if (isCompactViewport()) {
    const drawer = useCompactDrawer.getState()
    drawer.setOpen(!drawer.open)
  } else {
    useAppStore.getState().toggleSidebar()
  }
}
