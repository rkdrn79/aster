import type { DragEvent } from 'react'
import { useAppStore } from '@/store'
import { isWebClientLocation } from '@/lib/web-client-location'
import type {
  ResearchWindowPage,
  ResearchWindowTarget
} from '../../../../shared/research-page-window'
import { selectResearchWorkspaceContext } from './research-workspace-context'

export const RESEARCH_PAGE_DRAG_TYPE = 'application/x-aster-research-page'

/** Only the desktop app opens windows; a phone or browser client has one page at a time. */
export function canOpenResearchPageWindows(): boolean {
  return !isWebClientLocation() && typeof window.api.researchWindow?.openWindow === 'function'
}

function researchWindowTargetForPage(page: ResearchWindowPage): ResearchWindowTarget | null {
  const context = selectResearchWorkspaceContext(useAppStore.getState())
  return context.workspaceId
    ? { page, workspaceId: context.workspaceId, hostId: context.hostId }
    : null
}

export function openResearchPageInNewWindow(
  page: ResearchWindowPage,
  options: { fromDrag?: boolean } = {}
): void {
  const target = researchWindowTargetForPage(page)
  if (target && canOpenResearchPageWindows()) {
    void window.api.researchWindow.openWindow(target, options)
  }
}

/** A sidebar page row that opens in its own window when dragged out of this one. */
export function researchPageDragProps(page: ResearchWindowPage): {
  draggable?: boolean
  onDragStart?: (event: DragEvent<HTMLElement>) => void
  onDragEnd?: (event: DragEvent<HTMLElement>) => void
} {
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
        openResearchPageInNewWindow(page, { fromDrag: true })
      }
    }
  }
}
