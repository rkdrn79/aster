import type { DragEvent } from 'react'
import { useAppStore } from '@/store'
import { isWebClientLocation } from '@/lib/web-client-location'
import type {
  ResearchWindowPage,
  ResearchWindowTarget
} from '../../../../shared/research-page-window'
import { selectResearchWorkspaceContext } from './research-workspace-context'

export const RESEARCH_PAGE_DRAG_TYPE = 'application/x-aster-research-page'

type WindowOpenOptions = { fromDrag?: boolean }

type ResearchWindowDragProps = {
  draggable?: boolean
  onDragStart?: (event: DragEvent<HTMLElement>) => void
  onDragEnd?: (event: DragEvent<HTMLElement>) => void
}

/** Only the desktop app opens windows; a phone or browser client has one page at a time. */
export function canOpenResearchPageWindows(): boolean {
  return typeof window.api?.researchWindow?.openWindow === 'function' && !isWebClientLocation()
}

function openResearchWindow(
  target: ResearchWindowTarget | null,
  options: WindowOpenOptions = {}
): void {
  if (target && canOpenResearchPageWindows()) {
    void window.api.researchWindow.openWindow(target, options)
  }
}

function researchWindowTargetForPage(page: ResearchWindowPage): ResearchWindowTarget | null {
  const context = selectResearchWorkspaceContext(useAppStore.getState())
  return context.workspaceId
    ? { page, workspaceId: context.workspaceId, hostId: context.hostId }
    : null
}

/** The open project's page in that project's window. */
export function openResearchPageInNewWindow(
  page: ResearchWindowPage,
  options: WindowOpenOptions = {}
): void {
  openResearchWindow(researchWindowTargetForPage(page), options)
}

function researchProjectWindowTarget(workspace: {
  id: string
  executionHostId?: string | null
}): ResearchWindowTarget {
  return {
    page: 'research-chats',
    workspaceId: workspace.id,
    hostId: workspace.executionHostId ?? null
  }
}

/** A project in its own window, opening on its chats; the main window stays where it is. */
export function openResearchProjectInNewWindow(
  workspace: { id: string; executionHostId?: string | null },
  options: WindowOpenOptions = {}
): void {
  openResearchWindow(researchProjectWindowTarget(workspace), options)
}

/** A row that opens `target` in its own window when dragged out of this one. */
function researchWindowDragProps(
  page: string,
  resolveTarget: () => ResearchWindowTarget | null
): ResearchWindowDragProps {
  if (!canOpenResearchPageWindows()) {
    return {}
  }
  return {
    draggable: true,
    onDragStart: (event) => {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData(RESEARCH_PAGE_DRAG_TYPE, page)
    },
    onDragEnd: (event) => {
      // Why: nothing here took the drop; main opens the window only if the pointer left this one.
      if (event.dataTransfer.dropEffect === 'none') {
        openResearchWindow(resolveTarget(), { fromDrag: true })
      }
    }
  }
}

/** A sidebar page row that opens in its project's window when dragged out of this one. */
export function researchPageDragProps(page: ResearchWindowPage): ResearchWindowDragProps {
  return researchWindowDragProps(page, () => researchWindowTargetForPage(page))
}

/** A Home project row that opens the project in its own window when dragged out of this one. */
export function researchProjectDragProps(
  workspace: { id: string; executionHostId?: string | null } | undefined
): ResearchWindowDragProps {
  return workspace
    ? researchWindowDragProps('research-chats', () => researchProjectWindowTarget(workspace))
    : {}
}
