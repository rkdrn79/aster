import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { Tab, TabGroup } from '../../../../shared/tab-types'
import type { ResearchDocument } from '../../../../shared/research/research-records'
import type { ResearchLibraryDocument } from '../../../../shared/research/research-library'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { structuredAgentSessionOwnerForTab } from '@/runtime/structured-agent-session-owner'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import { useResearchRecords } from './research-records-store'
import { useResearchLibrary } from './research-library-store'
import { researchConversationHome } from './research-conversation-home'
import { researchBackgroundTabIsHidden } from './research-background-tab'
import {
  researchWritingEditorTabIds,
  useResearchWritingEditors
} from './research-writing-editor-ownership'

const NO_TABS: readonly Tab[] = []

/** Dedicated chats and background work stay out of the Workbench unless explicitly promoted. */
export function researchHiddenTabIds(
  tabs: readonly Tab[],
  records: ResearchDocument | null,
  library: ResearchLibraryDocument | null,
  ownerOf: (tab: Tab) => string | null
): string[] {
  return tabs.flatMap((tab) => {
    if (tab.contentType !== 'agent-session' && tab.contentType !== 'terminal') {
      return []
    }
    const owner = ownerOf(tab)
    if (researchBackgroundTabIsHidden(records, tab, owner)) {
      return [tab.id]
    }
    return tab.contentType === 'agent-session' &&
      researchConversationHome(records, library, owner, tab.worktreeId, tab.entityId).kind !==
        'workbench'
      ? [tab.id]
      : []
  })
}

function hiddenTabIdsForState(
  state: AppState,
  worktreeId: string,
  records: ResearchDocument | null,
  library: ResearchLibraryDocument | null,
  writingEditors: readonly string[]
): string[] {
  // Why: the Code layout has no Library or Writing pane, so its tab strip keeps every chat.
  if (state.settings?.researchUiEnabled !== true) {
    return []
  }
  const tabs = state.unifiedTabsByWorktree[worktreeId] ?? NO_TABS
  return [
    ...researchHiddenTabIds(tabs, records, library, (tab) =>
      tab.contentType === 'agent-session'
        ? structuredAgentSessionOwnerForTab(state, tab)
        : (tab.executionHostId ?? getResolvedExecutionHostIdForWorktree(state, tab.worktreeId))
    ),
    ...researchWritingEditorTabIds(tabs, writingEditors)
  ]
}

export function selectResearchHiddenTabIds(
  state: AppState,
  worktreeId: string
): ReadonlySet<string> {
  return new Set(
    hiddenTabIdsForState(
      state,
      worktreeId,
      useResearchRecords.getState().document,
      useResearchLibrary.getState().document,
      useResearchWritingEditors.getState().keys
    )
  )
}

export function useResearchHiddenTabIds(worktreeId: string): ReadonlySet<string> {
  const records = useResearchRecords((state) => state.document)
  const library = useResearchLibrary((state) => state.document)
  const writingEditors = useResearchWritingEditors((state) => state.keys)
  const enabled = useAppStore((state) => state.settings?.researchUiEnabled === true)
  const ids = useAppStore(
    useShallow((state) => hiddenTabIdsForState(state, worktreeId, records, library, writingEditors))
  )
  useEffect(() => {
    if (enabled) {
      void useResearchRecords.getState().load()
      void useResearchLibrary.getState().load()
    }
  }, [enabled])
  return useMemo(() => new Set(ids), [ids])
}

/** The group's most recent tab the Workbench still shows, once its active tab is hidden. */
export function researchWorkbenchFallbackTabId(
  group: Pick<TabGroup, 'activeTabId' | 'recentTabIds' | 'tabOrder'>,
  hidden: ReadonlySet<string>
): string | null {
  if (!group.activeTabId || !hidden.has(group.activeTabId)) {
    return null
  }
  const shown = (id: string): boolean => !hidden.has(id) && group.tabOrder.includes(id)
  return group.recentTabIds?.findLast(shown) ?? group.tabOrder.find(shown) ?? null
}

/** Moves a visible Workbench group off a hidden chat; the chat keeps running for its own page. */
export function useResearchWorkbenchTabFallback(
  worktreeId: string,
  groupId: string,
  isVisible: boolean,
  hidden: ReadonlySet<string>
): void {
  const fallbackTabId = useAppStore((state) => {
    const group =
      isVisible && hidden.size > 0
        ? state.groupsByWorktree[worktreeId]?.find((entry) => entry.id === groupId)
        : undefined
    return group ? researchWorkbenchFallbackTabId(group, hidden) : null
  })
  useEffect(() => {
    if (!fallbackTabId) {
      return
    }
    const state = useAppStore.getState()
    const focusedGroupId = state.activeGroupIdByWorktree[worktreeId] ?? groupId
    state.activateTab(fallbackTabId, { worktreeId, recordFocus: false })
    // Why: activateTab focuses the tab's group; keep the user's pane and resync its active surface.
    state.focusGroup(worktreeId, focusedGroupId)
  }, [fallbackTabId, groupId, worktreeId])
}
