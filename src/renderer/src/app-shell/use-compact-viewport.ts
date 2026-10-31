import { useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'
import { COMPACT_VIEWPORT_QUERY } from './compact-viewport-query'

function readQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(COMPACT_VIEWPORT_QUERY) : null
}

function subscribeCompactViewport(onChange: () => void): () => void {
  const query = readQuery()
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}

export function isCompactViewport(): boolean {
  return readQuery()?.matches === true
}

/** True on phone-width viewports, where the left sidebar becomes a drawer over the page. */
export function useCompactViewport(): boolean {
  return useSyncExternalStore(subscribeCompactViewport, isCompactViewport, () => false)
}

/** The left sidebar takes layout width; on a compact viewport it only ever overlays the page. */
export function useLeftSidebarDocked(): boolean {
  const sidebarOpen = useAppStore((state) => state.sidebarOpen)
  return useCompactViewport() ? false : sidebarOpen
}
