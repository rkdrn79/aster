import { describe, expect, it } from 'vitest'
import { orchestrationWorkersOf } from '@/components/native-chat/native-chat-orchestration-workers'
import { mirrorHostOrchestrationLineage } from '@/runtime/web-session-tabs-sync/mirrored-orchestration-lineage'
import {
  structuredAgentSessionPaneKey,
  structuredAgentSessionTabId
} from '../../../shared/structured-agent-session-projection'
import type { Tab } from '../../../shared/tab-types'
import { toWebTerminalSurfaceTabId } from '../../../shared/terminal-surface-id'
import type { PhoneSession } from './phone-sessions'
import { nestPhoneSessions } from './phone-session-families'

const LEAF = '33333333-3333-4333-8333-333333333333'
const HOST = 'runtime:env-1' as const

function session(tabId: string, overrides: Partial<PhoneSession> = {}): PhoneSession {
  return {
    worktreeId: 'repo::/work/proj',
    executionHostId: HOST,
    tabId,
    leafId: LEAF,
    contentType: 'terminal',
    title: tabId,
    state: 'working',
    agentType: 'claude',
    detail: '',
    activityAt: 0,
    stateSince: 0,
    running: true,
    idleShell: false,
    ...overrides
  }
}

function link(child: string, parent: string, state: 'working' | 'waiting' | 'completed') {
  return { paneKey: `${child}:${LEAF}`, parentPaneKey: `${parent}:${LEAF}`, state }
}

describe('nestPhoneSessions', () => {
  it('folds workers, and workers of workers, under the session that launched them', () => {
    const families = nestPhoneSessions(
      [session('coordinator'), session('worker-a'), session('worker-b'), session('helper')],
      [
        link('worker-a', 'coordinator', 'working'),
        link('worker-b', 'coordinator', 'waiting'),
        link('helper', 'worker-a', 'completed')
      ]
    )

    expect(families).toHaveLength(1)
    expect(families[0].session.tabId).toBe('coordinator')
    expect(families[0].subagents.map((entry) => entry.tabId)).toEqual([
      'worker-a',
      'worker-b',
      'helper'
    ])
    expect(families[0].subagentSummary).toEqual({ running: 1, waiting: 1, failed: 0, done: 1 })
  })

  it('keeps a worker on its own when its parent is not listed or runs on another host', () => {
    const families = nestPhoneSessions(
      [
        session('orphan'),
        session('coordinator'),
        session('remote-worker', { executionHostId: 'runtime:env-2' })
      ],
      [link('orphan', 'closed-tab', 'working'), link('remote-worker', 'coordinator', 'working')]
    )

    expect(families.map((family) => [family.session.tabId, family.subagents.length])).toEqual([
      ['orphan', 0],
      ['coordinator', 0],
      ['remote-worker', 0]
    ])
  })

  it('lifts a family by its most urgent member and keeps it live while a subagent runs', () => {
    const families = nestPhoneSessions(
      [
        session('busy'),
        session('coordinator', { state: 'idle', running: false }),
        session('asking', { state: 'waiting' })
      ],
      [link('asking', 'coordinator', 'waiting')]
    )

    expect(families.map((family) => family.session.tabId)).toEqual(['coordinator', 'busy'])
    expect(families[0].running).toBe(true)
  })

  it("nests a host chat's terminal and chat workers under the chat's mirrored tab", () => {
    const hostChatPane = structuredAgentSessionPaneKey('host-chat-tab', 'chat-session')
    const underChat = { parentPaneKey: hostChatPane, parentAgentSessionId: 'chat-session' }
    const lineage = mirrorHostOrchestrationLineage({
      [`host-terminal-tab:${LEAF}`]: { taskId: 't1', dispatchId: 'd1', ...underChat },
      [structuredAgentSessionPaneKey('host-worker-tab', 'worker-session')]: {
        taskId: 't2',
        dispatchId: 'd2',
        agentSessionId: 'worker-session',
        ...underChat
      }
    })
    const chatTab = structuredAgentSessionTabId('chat-session')
    const workerTab = structuredAgentSessionTabId('worker-session')
    const terminalTab = toWebTerminalSurfaceTabId('host-terminal-tab')
    const tab = (id: string, entityId: string, contentType: Tab['contentType']): Tab => ({
      id,
      entityId,
      groupId: 'group',
      worktreeId: 'repo::/work/proj',
      executionHostId: HOST,
      contentType,
      label: id,
      customLabel: null,
      color: null,
      sortOrder: 0,
      createdAt: 0
    })
    const workers = orchestrationWorkersOf(
      {
        runtimeAgentOrchestrationByPaneKey: lineage,
        agentStatusByPaneKey: {},
        retainedAgentsByPaneKey: {},
        unifiedTabsByWorktree: {
          'repo::/work/proj': [
            tab(chatTab, 'chat-session', 'agent-session'),
            tab(workerTab, 'worker-session', 'agent-session'),
            tab(terminalTab, terminalTab, 'terminal')
          ]
        }
      },
      () => true
    )

    const families = nestPhoneSessions(
      [
        session(chatTab, { contentType: 'agent-session' }),
        session(terminalTab),
        session(workerTab, { contentType: 'agent-session' })
      ],
      workers
    )
    expect(families).toHaveLength(1)
    expect(families[0].session.tabId).toBe(chatTab)
    expect(families[0].subagents.map((entry) => entry.tabId)).toEqual([terminalTab, workerTab])
  })
})
