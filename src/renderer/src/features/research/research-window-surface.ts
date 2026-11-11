import { create } from 'zustand'
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

/** The chat a research window's Chats section should show next; `seq` repeats a request. */
export const useResearchWindowChatRequest = create<{ tabId: string | null; seq: number }>(() => ({
  tabId: null,
  seq: 0
}))

let showChatsSection: (() => void) | null = null

/** Called by the research window's root, which owns its sections. */
export function setResearchWindowChatsSection(show: (() => void) | null): void {
  showChatsSection = show
}

/**
 * Shows a chat of this research window's workspace in its Chats section, as the main window shows
 * one in its Workbench; false in the main window or for another workspace's chat.
 */
export function openChatInResearchWindow(workspaceId: string, tabId: string): boolean {
  if (!surfaceTarget || surfaceTarget.workspaceId !== workspaceId || !showChatsSection) {
    return false
  }
  useResearchWindowChatRequest.setState((state) => ({ tabId, seq: state.seq + 1 }))
  showChatsSection()
  return true
}
