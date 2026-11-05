import type { ResearchWindowTarget } from '../../../../shared/research-page-window'

let surfaceTarget: ResearchWindowTarget | null = null

/** Called once by the research window entry, before it renders. */
export function markResearchWindowSurface(target: ResearchWindowTarget): void {
  surfaceTarget = target
}

/** The page and workspace this research window shows; null in the main window. */
export function researchWindowSurfaceTarget(): ResearchWindowTarget | null {
  return surfaceTarget
}

/** A research window has no terminals, chats or editor tabs of its own; those stay in the main window. */
export function isResearchWindowSurface(): boolean {
  return surfaceTarget !== null
}
