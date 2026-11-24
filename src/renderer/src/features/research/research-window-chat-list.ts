import { useMemo } from 'react'
import { create } from 'zustand'
import { toast } from 'sonner'
import type { Tab } from '../../../../shared/tab-types'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { formatAgentTypeLabel } from '../../../../shared/agent-type-label'
import type { ResearchWindowTarget } from '../../../../shared/research-page-window'
import { useAppStore } from '@/store'
import { researchChatSessionTabs } from './ResearchAgentChatPane'
import { selectResearchWorkspaceContext } from './research-workspace-context'
import { researchChatIsSubtask } from './research-chat-branches'
import { useResearchRecords } from './research-records-store'

const EMPTY_TABS: readonly Tab[] = []

export type ResearchWindowChatTab = ReturnType<typeof researchChatSessionTabs>[number]

/**
 * Which chat a project window or side shows, shared by its Chats page and (in a side) the
 * sidebar's Workbench list: the picked one, and the chats there were before a start from here,
 * so the first new one is the chat that start made.
 */
export const useResearchWindowChatSelection = create<{
  selectedId: string | null
  launchBaseline: ReadonlySet<string> | null
  awaitingNewChat: boolean
}>(() => ({ selectedId: null, launchBaseline: null, awaitingNewChat: false }))

export function researchWindowChatLabel(tab: ResearchWindowChatTab): string {
  return (
    tab.customLabel ??
    tab.aiVaultTitle?.title ??
    tab.label ??
    formatAgentTypeLabel(tab.agentSessionAgent)
  )
}

/** This window's project chats, without subtasks (they open from the chat they report to). */
export function useResearchWindowChats(target: ResearchWindowTarget): {
  hostId: string | null
  chats: ResearchWindowChatTab[]
  selected: ResearchWindowChatTab | null
  created: ResearchWindowChatTab | null
  starting: boolean
} {
  const hostId = useAppStore((state) => selectResearchWorkspaceContext(state).hostId)
  const workspaceTabs = useAppStore(
    (state) => state.unifiedTabsByWorktree[target.workspaceId] ?? EMPTY_TABS
  )
  const records = useResearchRecords((state) => state.document)
  const chats = useMemo(
    () =>
      hostId
        ? researchChatSessionTabs(useAppStore.getState(), workspaceTabs, hostId).filter(
            (tab) =>
              !researchChatIsSubtask(
                records,
                { hostId, workspaceId: target.workspaceId },
                tab.entityId
              )
          )
        : [],
    [hostId, records, target.workspaceId, workspaceTabs]
  )
  const selectedId = useResearchWindowChatSelection((state) => state.selectedId)
  const launchBaseline = useResearchWindowChatSelection((state) => state.launchBaseline)
  const created = launchBaseline ? (chats.find((tab) => !launchBaseline.has(tab.id)) ?? null) : null
  const selected = created ?? chats.find((tab) => tab.id === selectedId) ?? chats[0] ?? null
  return { hostId, chats, selected, created, starting: launchBaseline !== null && !created }
}

export function chooseResearchWindowChat(tabId: string): void {
  useResearchWindowChatSelection.setState({ selectedId: tabId, launchBaseline: null })
}

/** Starts a chat in this window's project through the main window, which owns the tabs. */
export function startResearchWindowChat(
  target: ResearchWindowTarget,
  hostId: string | null,
  chats: readonly Pick<Tab, 'id'>[],
  agent: TuiAgent
): void {
  useResearchWindowChatSelection.setState({
    launchBaseline: new Set(chats.map((tab) => tab.id)),
    awaitingNewChat: false
  })
  // The window's own resolution of its host, for a project opened before its host was stamped.
  void window.api.researchWindow
    .launchChat({ ...target, hostId: hostId ?? target.hostId }, agent)
    .then((result) => {
      if ('error' in result) {
        useResearchWindowChatSelection.setState({ launchBaseline: null })
        toast.error(result.error)
      } else {
        useResearchWindowChatSelection.setState({ awaitingNewChat: true })
      }
    })
}
