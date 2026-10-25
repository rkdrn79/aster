// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Tab } from '../../../../shared/tab-types'

const mocks = vi.hoisted(() => {
  const chat = (sessionId: string) => ({
    id: `agent-session:${sessionId}`,
    entityId: sessionId,
    groupId: 'group-a',
    worktreeId: 'wt-a',
    executionHostId: 'local' as const,
    contentType: 'agent-session' as const,
    agentSessionAgent: 'claude' as const,
    label: 'Claude Chat',
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 0
  })
  const tabs = [chat('reading'), chat('general')]
  const state = {
    activeWorktreeId: 'wt-a',
    rightSidebarOpen: true,
    sidebarOpen: true,
    settings: { researchUiEnabled: true },
    unifiedTabsByWorktree: { 'wt-a': tabs },
    groupsByWorktree: {
      'wt-a': [
        {
          id: 'group-a',
          worktreeId: 'wt-a',
          activeTabId: tabs[1].id,
          tabOrder: tabs.map((tab) => tab.id)
        }
      ]
    }
  }
  const useAppStore = (selector: (current: typeof state) => unknown): unknown => selector(state)
  useAppStore.getState = () => state
  return { useAppStore, state, tabs, stripChatIds: new Array<string>() }
})
vi.mock('@/store', () => ({ useAppStore: mocks.useAppStore }))
vi.mock('../../store', () => ({ useAppStore: mocks.useAppStore }))
vi.mock('../tab-bar/TabBar', () => ({
  default: ({ agentSessionTabs }: { agentSessionTabs: Tab[] }) => {
    mocks.stripChatIds = agentSessionTabs.map((tab) => tab.id)
    return null
  }
}))
vi.mock('../tab-bar/TabBarQuickCommandsButton', () => ({
  TabBarQuickCommandsButton: () => null
}))
vi.mock('@/lib/pane-manager/client-hosted-browser-row-state', () => ({
  useClientHostedBrowserRows: () => []
}))
vi.mock('./useTabGroupWorkspaceModel', () => ({
  useTabGroupWorkspaceModel: () => ({
    activeTab: mocks.tabs[1],
    agentSessionItems: mocks.tabs,
    browserItems: [],
    commands: { focusGroup: () => undefined },
    editorItems: [],
    tabBarOrder: mocks.tabs.map((tab) => tab.id),
    terminalTabs: [],
    groupTabs: mocks.tabs,
    expandedPaneByTabId: {}
  })
}))

import { emptyResearchDocument } from '../../../../shared/research/research-records'
import {
  emptyResearchLibraryDocument,
  libraryScopeKey
} from '../../../../shared/research/research-library'
import { useResearchRecords } from '@/features/research/research-records-store'
import { useResearchLibrary } from '@/features/research/research-library-store'
import TabGroupPanel from './TabGroupPanel'

function renderPanel(): void {
  render(
    <TabGroupPanel
      groupId="group-a"
      worktreeId="wt-a"
      isVisible
      isFocused
      hasSplitGroups={false}
      touchesLeftEdge
      touchesRightEdge
      reserveClosedExplorerToggleSpace={false}
      reserveCollapsedSidebarHeaderSpace={false}
    />
  )
}

afterEach(cleanup)

describe('TabGroupPanel Library chats', () => {
  it('leaves a Library chat out of the Research tab strip but keeps it in Code', () => {
    useResearchRecords.setState({ document: emptyResearchDocument() })
    useResearchLibrary.setState({
      document: {
        ...emptyResearchLibraryDocument(),
        readingAgentSessionByScope: {
          [libraryScopeKey({ hostId: 'local', workspaceId: 'wt-a' })]: 'reading'
        }
      }
    })

    renderPanel()
    expect(mocks.stripChatIds).toEqual(['agent-session:general'])

    cleanup()
    mocks.state.settings.researchUiEnabled = false
    renderPanel()
    expect(mocks.stripChatIds).toEqual(['agent-session:reading', 'agent-session:general'])
  })
})
