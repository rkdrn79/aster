import { memo, useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { Tab, TabGroup } from '../../../../shared/tab-types'
import { useAppStore } from '@/store'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from '@/runtime/structured-agent-session-owner'
import { RetainedPaneHost } from '../tab-group/RetainedPaneHost'
import NativeChatView from './NativeChatView'
import { isStructuredTab } from '../../../../shared/structured-agent-session-tab'
import { useResearchRecords } from '@/features/research/research-records-store'
import { selectWritingOwner } from '@/features/research/research-writing-project'
import { useResearchHiddenTabIds } from '@/features/research/research-workbench-hidden-tabs'

type StructuredAgentSessionTab = Tab & {
  contentType: 'agent-session'
  agentSessionAgent: NonNullable<Tab['agentSessionAgent']>
}

const EMPTY_UNIFIED_TABS: readonly Tab[] = []
const EMPTY_GROUPS: readonly TabGroup[] = []

const StructuredAgentSessionOverlaySlot = memo(function StructuredAgentSessionOverlaySlot({
  tab,
  groupId,
  isActive,
  isFocusedGroup,
  hasSplitGroups,
  onFocusOwningGroup
}: {
  tab: StructuredAgentSessionTab
  groupId: string | undefined
  isActive: boolean
  isFocusedGroup: boolean
  hasSplitGroups: boolean
  onFocusOwningGroup: ((groupId: string) => void) | undefined
}): React.JSX.Element | null {
  // Each chat is read from the host recorded on its tab, never from its workspace id, which two
  // hosts can share.
  const owner = useAppStore((state) => structuredAgentSessionOwnerForTab(state, tab))
  const target = useMemo(() => structuredAgentSessionTargetForHost(owner), [owner])
  if (!target) {
    return null
  }
  return (
    <RetainedPaneHost
      groupId={groupId}
      isVisible={isActive}
      dimmed={hasSplitGroups && !isFocusedGroup}
      data-structured-agent-session-overlay-tab-id={tab.id}
      onFocusOwningGroup={onFocusOwningGroup}
    >
      <NativeChatView
        mode="structured"
        tabId={tab.id}
        groupId={groupId}
        sessionId={tab.entityId}
        agent={tab.agentSessionAgent}
        isVisible={isActive}
        isFocusedGroup={isFocusedGroup}
        target={target}
      />
    </RetainedPaneHost>
  )
})

const StructuredAgentSessionPaneOverlayLayer = memo(
  function StructuredAgentSessionPaneOverlayLayer({
    worktreeId,
    isWorktreeActive
  }: {
    worktreeId: string
    isWorktreeActive: boolean
  }): React.JSX.Element {
    const { unifiedTabs, groups, activeGroupId } = useAppStore(
      useShallow((state) => ({
        unifiedTabs: state.unifiedTabsByWorktree[worktreeId] ?? EMPTY_UNIFIED_TABS,
        groups: state.groupsByWorktree[worktreeId] ?? EMPTY_GROUPS,
        activeGroupId: state.activeGroupIdByWorktree[worktreeId]
      }))
    )
    const focusGroup = useAppStore((state) => state.focusGroup)
    const activeView = useAppStore((state) => state.activeView)
    // Why: Library and Writing chats stay mounted here but never show in the Workbench.
    const hiddenTabIds = useResearchHiddenTabIds(worktreeId)
    // Why the owner: Writing shows the project's chat whichever Experiment is selected.
    const writingExperiment = useResearchRecords((state) =>
      selectWritingOwner(state.document, { workspaceId: worktreeId })
    )
    const focusOwningGroup = useCallback(
      (groupId: string) => focusGroup(worktreeId, groupId),
      [focusGroup, worktreeId]
    )
    const groupActiveTabById = useMemo(
      () => new Map(groups.map((group) => [group.id, group.activeTabId] as const)),
      [groups]
    )
    const structuredTabs = useMemo(
      () => unifiedTabs.filter((tab): tab is StructuredAgentSessionTab => isStructuredTab(tab)),
      [unifiedTabs]
    )

    return (
      <>
        {structuredTabs
          .filter(
            (tab) =>
              !(
                activeView === 'research-writing' &&
                writingExperiment !== null &&
                tab.entityId === writingExperiment.writingAgentSessionId &&
                structuredAgentSessionOwnerForTab(useAppStore.getState(), tab) ===
                  writingExperiment.hostId
              )
          )
          .map((tab) => (
            <StructuredAgentSessionOverlaySlot
              key={tab.id}
              tab={tab}
              groupId={tab.groupId}
              isActive={Boolean(
                isWorktreeActive &&
                !hiddenTabIds.has(tab.id) &&
                groupActiveTabById.get(tab.groupId) === tab.id
              )}
              isFocusedGroup={Boolean(
                isWorktreeActive &&
                !hiddenTabIds.has(tab.id) &&
                groupActiveTabById.get(tab.groupId) === tab.id &&
                tab.groupId === activeGroupId
              )}
              hasSplitGroups={groups.length > 1}
              onFocusOwningGroup={focusOwningGroup}
            />
          ))}
      </>
    )
  }
)

export default StructuredAgentSessionPaneOverlayLayer
