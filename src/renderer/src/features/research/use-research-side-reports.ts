import { useEffect } from 'react'
import type { ResearchWindowPage } from '../../../../shared/research-page-window'

/**
 * A side tells the main window what it shows and when it takes the keyboard, so the main
 * window's header marks the right page and project. Nothing in a pop-out window (null side).
 */
export function useResearchSideReports(sideId: string | null, page: ResearchWindowPage): void {
  useEffect(() => {
    if (sideId) {
      void window.api.researchWindow.sideCommand({ kind: 'page', page })
    }
  }, [sideId, page])
  useEffect(() => {
    if (!sideId) {
      return
    }
    const report = (): void => void window.api.researchWindow.sideCommand({ kind: 'focus' })
    window.addEventListener('focus', report)
    window.addEventListener('pointerdown', report, true)
    return () => {
      window.removeEventListener('focus', report)
      window.removeEventListener('pointerdown', report, true)
    }
  }, [sideId])
}

/** Keeps a side's pages clear of the window controls the main window draws over its corner. */
export function useResearchSideControlsInset(sideId: string | null): void {
  useEffect(() => {
    if (!sideId) {
      return
    }
    return window.api.researchWindow.onSideInset((px) => {
      const width = typeof px === 'number' && Number.isFinite(px) && px >= 0 ? px : 0
      document.documentElement.style.setProperty('--window-controls-width', `${width}px`)
    })
  }, [sideId])
}
