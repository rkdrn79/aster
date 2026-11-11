import { toast } from 'sonner'
import { useAppStore } from '@/store'
import type { Tab } from '../../../../shared/tab-types'
import type { ResearchWindowFile } from '../../../../shared/research-window-actions'
import { researchWindowSurfaceTarget } from './research-window-surface'

type ChatTab = Pick<Tab, 'id' | 'entityId' | 'worktreeId'>

/**
 * Tab changes a research page makes. The main window owns the tabs: a research window renders
 * from a copy of its state, so there each change is asked of the main window instead.
 */

/** Closes a chat's tab; false when it could not be closed. */
export async function closeResearchChatTab(tab: ChatTab): Promise<boolean> {
  if (researchWindowSurfaceTarget()) {
    const result = await window.api.researchWindow.runAction({
      kind: 'close-chat',
      workspaceId: tab.worktreeId,
      tabId: tab.id,
      entityId: tab.entityId
    })
    return result.ok
  }
  return closeChatTabHere(tab)
}

/** Gives a chat's tab the title Aster chose for it, as a rename by the person would. */
export function renameResearchChatTab(tab: ChatTab, label: string): void {
  if (researchWindowSurfaceTarget()) {
    void window.api.researchWindow.runAction({
      kind: 'rename-chat',
      workspaceId: tab.worktreeId,
      tabId: tab.id,
      label
    })
    return
  }
  renameChatTabHere(tab.id, label)
}

/** From a research window: opens files in the main window's editor, which then shows itself. */
export function openInMainWindowEditor(
  owner: { workspaceId: string; hostId: string },
  file: ResearchWindowFile,
  besidePdf?: ResearchWindowFile | null
): void {
  void window.api.researchWindow
    .runAction({
      kind: 'open-in-editor',
      workspaceId: owner.workspaceId,
      hostId: owner.hostId,
      file,
      ...(besidePdf ? { besidePdf } : {})
    })
    .then((result) => {
      if (!result.ok) {
        toast.error(result.error)
      }
    })
}

export function closeChatTabHere(tab: ChatTab): boolean {
  const state = useAppStore.getState()
  const open = (state.unifiedTabsByWorktree[tab.worktreeId] ?? []).some(
    (entry) => entry.id === tab.id && entry.entityId === tab.entityId
  )
  return open && state.closeUnifiedTab(tab.id) !== null
}

export function renameChatTabHere(tabId: string, label: string): void {
  useAppStore.getState().setTabCustomTitle(tabId, label, { recordInteraction: false })
}
