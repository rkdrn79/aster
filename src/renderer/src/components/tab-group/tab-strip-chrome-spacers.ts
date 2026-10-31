import { useAppStore } from '@/store'
import { useCompactViewport, useLeftSidebarDocked } from '@/app-shell/use-compact-viewport'
import { usePhoneShell } from '@/phone-shell/use-phone-shell'

/** Whether a top-edge tab strip shows, and whether it needs room for the floating toggles beside it. */
export function useTabStripChromeSpacers(edges: { left: boolean; right: boolean }): {
  left: boolean
  right: boolean
  stripHidden: boolean
} {
  const leftSidebarDocked = useLeftSidebarDocked()
  const rightSidebarOpen = useAppStore((state) => state.rightSidebarOpen)
  const researchUiEnabled = useAppStore((state) => state.settings?.researchUiEnabled === true)
  const compactViewport = useCompactViewport()
  // Why: the phone opens one session at a time under its own header, so it has no tab row.
  const stripHidden = usePhoneShell()
  // Why: on a phone the Research page header already clears the floating controls, and the
  // right-sidebar toggle is hidden, so neither spacer would cover anything.
  return {
    left: edges.left && !leftSidebarDocked && !(compactViewport && researchUiEnabled),
    right: edges.right && !rightSidebarOpen && !compactViewport,
    stripHidden
  }
}
