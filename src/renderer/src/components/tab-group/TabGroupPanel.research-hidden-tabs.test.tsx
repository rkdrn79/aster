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
  const terminal = (id: string) => ({
    ...chat(id),
    id,
    entityId: id,
    contentType: 'terminal' as const,
    unifiedTabId: id
  })
  const tabs = [chat('reading'), chat('general')]
  const terminals = [terminal('parent'), terminal('worker')]
  const stripTabs: (ReturnType<typeof chat> | ReturnType<typeof terminal>)[] = tabs
  const state = {
    activeWorktreeId: 'wt-a',
    rightSidebarOpen: true,
    sidebarOpen: true,
    settings: { researchUiEnabled: true },
    runtimeAgentOrchestrationByPaneKey: {},
    agentStatusByPaneKey: {},
    retainedAgentsByPaneKey: {},
    unifiedTabsByWorktree: { 'wt-a': stripTabs },
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
  return {
    useAppStore,
    state,
    tabs,
    terminals,
    stripChatIds: new Array<string>(),
    stripTerminalIds: new Array<string>()
  }
})
vi.mock('@/store', () => ({ useAppStore: mocks.useAppStore }))
vi.mock('../../store', () => ({ useAppStore: mocks.useAppStore }))
vi.mock('../tab-bar/TabBar', () => ({
  default: ({
    agentSessionTabs,
    tabs
  }: {
    agentSessionTabs: Tab[]
    tabs: { unifiedTabId?: string }[]
  }) => {
    mocks.stripChatIds = agentSessionTabs.map((tab) => tab.id)
    mocks.stripTerminalIds = tabs.map((tab) => tab.unifiedTabId ?? '')
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
    terminalTabs: mocks.terminals,
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

  it('folds a worker terminal under its parent in Code until it is the open tab', () => {
    const leaf = '11111111-1111-4111-8111-111111111111'
    mocks.state.settings.researchUiEnabled = false
    mocks.state.unifiedTabsByWorktree['wt-a'] = [...mocks.tabs, ...mocks.terminals]
    mocks.state.runtimeAgentOrchestrationByPaneKey = {
      [`worker:${leaf}`]: { taskId: 't', dispatchId: 'd', parentPaneKey: `parent:${leaf}` }
    }
    renderPanel()
    expect(mocks.stripTerminalIds).toEqual(['parent'])

    cleanup()
    mocks.state.groupsByWorktree['wt-a'][0].activeTabId = 'worker'
    renderPanel()
    expect(mocks.stripTerminalIds).toEqual(['parent', 'worker'])
  })
})
