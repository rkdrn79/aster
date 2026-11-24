import { toast } from 'sonner'
import { normalizeExecutionHostId } from '../../../../shared/execution-host'
import type { ResearchWindowPage } from '../../../../shared/research-page-window'
import { RESEARCH_SPLIT_MAX_SIDES } from '../../../../shared/research-side-split'
import { canOpenResearchPageWindows } from './research-page-window-open'
import { lastResearchLocation } from './research-location'
import { closeResearchProjectSwitcherForNavigation } from './research-project-switcher-store'
import { isResearchWindowSurface } from './research-window-surface'
import { enterResearchWorkspace, openResearchView } from './research-navigation'
import {
  openResearchSide,
  researchSidePageFor,
  takeFirstResearchSideForMain
} from './research-split-store'

/**
 * Only the main window of the desktop app splits: a side is a page of its own, which a browser
 * client cannot host, and a project window or a side shows one project.
 */
export function canOpenResearchSides(): boolean {
  return canOpenResearchPageWindows() && !isResearchWindowSurface()
}

/** Where a project was last left, as a side's page (its Workbench is the side's Chats). */
export function lastResearchSidePage(workspaceId: string): ResearchWindowPage {
  return researchSidePageFor(lastResearchLocation(workspaceId)?.view)
}

/**
 * Opens a project beside the one the main column shows, on the page it was last left at, or on
 * `page`. The main column stays on its project and page.
 */
export function openResearchProjectBeside(
  workspace: { id: string; executionHostId?: string | null },
  page?: ResearchWindowPage
): void {
  closeResearchProjectSwitcherForNavigation()
  if (!canOpenResearchSides()) {
    return
  }
  const result = openResearchSide({
    workspaceId: workspace.id,
    hostId: workspace.executionHostId ?? null,
    page: page ?? lastResearchSidePage(workspace.id)
  })
  if (result === 'full') {
    toast.message(`Up to ${RESEARCH_SPLIT_MAX_SIDES + 1} projects fit side by side.`, {
      description: 'Close one to open another beside it.'
    })
  }
}

/** Closing the main column's project: the first side moves into the main column, on its page. */
export function closeResearchSplitMainColumn(): void {
  const side = takeFirstResearchSideForMain()
  if (!side) {
    return
  }
  enterResearchWorkspace({
    id: side.workspaceId,
    executionHostId: normalizeExecutionHostId(side.hostId) ?? undefined
  })
  // A side's Chats are the main window's Workbench.
  openResearchView(side.page === 'research-chats' ? 'terminal' : side.page)
}
