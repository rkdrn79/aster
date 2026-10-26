import { describe, expect, it } from 'vitest'
import type { Tab } from '../../../../shared/tab-types'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { emptyResearchDocument } from '../../../../shared/research/research-records'
import {
  emptyResearchLibraryDocument,
  libraryScopeKey
} from '../../../../shared/research/research-library'
import {
  researchHiddenTabIds,
  researchWorkbenchFallbackTabId
} from './research-workbench-hidden-tabs'

function tab(
  entityId: string,
  contentType: Tab['contentType'] = 'agent-session',
  executionHostId: ExecutionHostId = 'local'
): Tab {
  return {
    id: `${contentType}:${entityId}`,
    entityId,
    groupId: 'group-a',
    worktreeId: 'workspace-a',
    executionHostId,
    contentType,
    label: entityId,
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 0
  }
}

describe('Research Workbench hidden tabs', () => {
  it('hides only chats whose home is Library or Writing on their own host', () => {
    const records = {
      ...emptyResearchDocument(),
      experiments: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Ablation',
          projectId: null,
          workspaceId: 'workspace-a',
          workspacePath: '/project-a',
          hostId: 'local',
          archived: false,
          writingAgentSessionId: 'writing',
          createdAt: '2026-10-24T00:00:00Z',
          updatedAt: '2026-10-24T00:00:00Z'
        }
      ]
    }
    const library = {
      ...emptyResearchLibraryDocument(),
      readingAgentSessionByScope: {
        [libraryScopeKey({ hostId: 'local', workspaceId: 'workspace-a' })]: 'reading'
      }
    }
    const tabs = [
      tab('reading'),
      tab('writing'),
      tab('general'),
      tab('reading', 'terminal'),
      { ...tab('reading', 'agent-session', 'ssh:other'), id: 'remote-reading' }
    ]
    expect(
      researchHiddenTabIds(tabs, records, library, (entry) => entry.executionHostId ?? null)
    ).toEqual(['agent-session:reading', 'agent-session:writing'])
  })

  it('keeps delegated chats and agent terminals in Background tasks until explicitly shown', () => {
    const records = {
      ...emptyResearchDocument(),
      delegations: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          sourceWorkspaceId: 'workspace-a',
          sourceHostId: 'local',
          sourceExperimentId: null,
          targetWorkspaceId: 'workspace-a',
          targetHostId: 'local',
          targetLabel: 'Local Mac',
          agent: 'claude',
          task: 'Organize project folders',
          tabId: 'agent-session:background-chat',
          sessionId: 'background-chat',
          state: 'ready' as const,
          createdAt: '2026-10-24T00:00:00Z',
          updatedAt: '2026-10-24T00:00:00Z'
        },
        {
          id: '33333333-3333-4333-8333-333333333333',
          sourceWorkspaceId: 'workspace-a',
          sourceHostId: 'local',
          sourceExperimentId: null,
          targetWorkspaceId: 'workspace-a',
          targetHostId: 'local',
          targetLabel: 'Local Mac',
          agent: 'codex',
          task: 'Run research loop',
          tabId: 'terminal:background-terminal',
          sessionId: null,
          state: 'ready' as const,
          createdAt: '2026-10-24T00:00:00Z',
          updatedAt: '2026-10-24T00:00:00Z'
        }
      ]
    }
    const tabs = [
      tab('background-chat'),
      tab('background-terminal', 'terminal'),
      tab('manual-terminal', 'terminal'),
      { ...tab('background-chat', 'agent-session', 'ssh:other'), id: 'remote-copy' }
    ]
    const owner = (entry: Tab) => entry.executionHostId ?? null
    expect(researchHiddenTabIds(tabs, records, null, owner)).toEqual([
      'agent-session:background-chat',
      'terminal:background-terminal'
    ])
    const promoted = {
      ...records,
      delegations: records.delegations.map((entry) => ({ ...entry, workbenchVisible: true }))
    }
    expect(researchHiddenTabIds(tabs, promoted, null, owner)).toEqual([])
  })

  it('hides a server Slack coordinator without saving it in local research records', () => {
    const coordinator = {
      id: '44444444-4444-4444-8444-444444444444',
      sourceWorkspaceId: 'workspace-a',
      sourceHostId: 'local',
      sourceExperimentId: null,
      targetWorkspaceId: 'workspace-a',
      targetHostId: 'local',
      targetLabel: 'My paper',
      agent: 'codex',
      task: 'Slack · C123',
      tabId: null,
      sessionId: 'slack-session',
      state: 'ready' as const,
      createdAt: '2026-10-24T00:00:00Z',
      updatedAt: '2026-10-24T00:00:00Z'
    }
    const tabs = [tab('slack-session'), tab('manual')]
    const owner = (entry: Tab): string | null => entry.executionHostId ?? null
    expect(researchHiddenTabIds(tabs, null, null, owner, [coordinator])).toEqual([
      'agent-session:slack-session'
    ])
    expect(
      researchHiddenTabIds(tabs, null, null, owner, [{ ...coordinator, workbenchVisible: true }])
    ).toEqual([])
  })

  it('falls back from a hidden active tab to the most recent visible one', () => {
    const hidden = new Set(['chat'])
    const group = {
      activeTabId: 'chat',
      tabOrder: ['older', 'chat', 'newer'],
      recentTabIds: ['newer', 'older', 'chat']
    }
    expect(researchWorkbenchFallbackTabId(group, hidden)).toBe('older')
    expect(researchWorkbenchFallbackTabId({ ...group, activeTabId: 'newer' }, hidden)).toBeNull()
    expect(
      researchWorkbenchFallbackTabId({ activeTabId: 'chat', tabOrder: ['chat'] }, hidden)
    ).toBeNull()
  })
})
