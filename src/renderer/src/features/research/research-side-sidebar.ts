import { useEffect, useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { researchWindowSideId } from './research-window-surface'

/** A side narrower than this shows its sidebar as icons, so its page keeps room to work. */
export const SIDE_SIDEBAR_AUTO_COLLAPSE_PX = 600

const STORAGE_PREFIX = 'aster.research-side-sidebar.v1:'

type SideSidebarState = {
  /** What the person chose while the side was wide enough; remembered per side. */
  collapsed: boolean
  /** Opened by hand while the side is narrow; forgotten once it is wide again. */
  narrowExpanded: boolean
}

function storageKey(): string | null {
  const sideId = researchWindowSideId()
  return sideId ? `${STORAGE_PREFIX}${sideId}` : null
}

function readCollapsed(): boolean {
  const key = storageKey()
  try {
    return key ? localStorage.getItem(key) === 'collapsed' : false
  } catch {
    return false
  }
}

export const useResearchSideSidebar = create<SideSidebarState>(() => ({
  collapsed: false,
  narrowExpanded: false
}))

/** Called by the research window entry once it knows its side, before the first render. */
export function hydrateResearchSideSidebar(): void {
  useResearchSideSidebar.setState({ collapsed: readCollapsed() })
}

function subscribeWidth(onChange: () => void): () => void {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

function isNarrow(): boolean {
  return window.innerWidth < SIDE_SIDEBAR_AUTO_COLLAPSE_PX
}

/** Whether the side's sidebar shows as icons: by choice, or because the side is narrow. */
export function sideSidebarCollapsed(state: SideSidebarState, narrow: boolean): boolean {
  return narrow ? !state.narrowExpanded : state.collapsed
}

export function useResearchSideSidebarCollapsed(): boolean {
  const narrow = useSyncExternalStore(subscribeWidth, isNarrow, () => false)
  const collapsed = useResearchSideSidebar((state) => state.collapsed)
  const narrowExpanded = useResearchSideSidebar((state) => state.narrowExpanded)
  useEffect(() => {
    if (!narrow && narrowExpanded) {
      useResearchSideSidebar.setState({ narrowExpanded: false })
    }
  }, [narrow, narrowExpanded])
  return sideSidebarCollapsed({ collapsed, narrowExpanded }, narrow)
}

/** The sidebar's own toggle: kept for this side when it is wide, for now when it is narrow. */
export function toggleResearchSideSidebar(): void {
  const state = useResearchSideSidebar.getState()
  if (isNarrow()) {
    useResearchSideSidebar.setState({ narrowExpanded: !state.narrowExpanded })
    return
  }
  const collapsed = !state.collapsed
  useResearchSideSidebar.setState({ collapsed })
  const key = storageKey()
  try {
    if (key) {
      localStorage.setItem(key, collapsed ? 'collapsed' : 'expanded')
    }
  } catch {
    // Storage can be full; the choice then lasts until the side reloads.
  }
}
