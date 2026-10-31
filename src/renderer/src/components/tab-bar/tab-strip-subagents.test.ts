import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import { structuredAgentSessionPaneKey } from '../../../../shared/structured-agent-session-projection'
import type { Tab } from '../../../../shared/tab-types'
import { tabStripSubagents } from './tab-strip-subagents'

const LEAF = '11111111-1111-4111-8111-111111111111'

function terminal(id: string, createdAt: number): Tab {
  return {
    id,
    entityId: id,
    groupId: 'group',
    worktreeId: 'workspace',
    executionHostId: 'local',
    contentType: 'terminal',
    label: id,
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt
  }
}

function chat(id: string, sessionId: string, createdAt: number): Tab {
  return { ...terminal(id, createdAt), entityId: sessionId, contentType: 'agent-session' }
}

function context(id: string, parent: string) {
  return { taskId: id, dispatchId: id, displayName: id, parentPaneKey: `${parent}:${LEAF}` }
}

describe('tab strip subagents', () => {
  it('lists workers and their nested workers for the strip parents in launch order', () => {
    const working: AgentStatusEntry = {
      state: 'working',
      prompt: '',
      updatedAt: 5_000,
      stateStartedAt: 4_000,
      paneKey: `nested:${LEAF}`,
      stateHistory: [],
      toolName: 'Bash',
      toolInput: 'pytest'
    }
    const sources = {
      runtimeAgentOrchestrationByPaneKey: {
        [`nested:${LEAF}`]: context('nested', 'worker'),
        [`worker:${LEAF}`]: context('worker', 'parent'),
        [`stranger:${LEAF}`]: context('stranger', 'elsewhere')
      },
      agentStatusByPaneKey: { [`nested:${LEAF}`]: working },
      retainedAgentsByPaneKey: {},
      unifiedTabsByWorktree: {
        workspace: [
          terminal('parent', 1),
          terminal('nested', 3),
          terminal('worker', 2),
          terminal('stranger', 4)
        ]
      }
    }

    const workers = tabStripSubagents(sources, ['parent'])
    expect(workers.map((worker) => worker.name)).toEqual(['worker', 'nested'])
    expect(workers[1]).toMatchObject({
      state: 'working',
      activity: 'Bash pytest',
      updatedAt: 5_000
    })
    expect(tabStripSubagents(sources, [])).toEqual([])
  })

  it("lists a chat's terminal and chat workers by session, whatever ids the host gave the tabs", () => {
    const parent = chat('chat-tab', 'chat-session', 1)
    const chatWorker = chat('chat-worker-tab', 'worker-session', 3)
    const hostChatPane = structuredAgentSessionPaneKey('host-chat-tab', 'chat-session')
    const hostWorkerPane = structuredAgentSessionPaneKey('host-worker-tab', 'worker-session')
    const waiting: AgentStatusEntry = {
      state: 'waiting',
      prompt: '',
      updatedAt: 2_000,
      stateStartedAt: 2_000,
      paneKey: structuredAgentSessionPaneKey(chatWorker.id, 'worker-session'),
      stateHistory: []
    }
    const sources = {
      runtimeAgentOrchestrationByPaneKey: {
        [`terminal-worker:${LEAF}`]: {
          ...context('terminal-worker', 'unused'),
          parentPaneKey: hostChatPane,
          parentAgentSessionId: 'chat-session'
        },
        [hostWorkerPane]: {
          ...context('chat-worker', 'unused'),
          agentSessionId: 'worker-session',
          parentPaneKey: hostChatPane,
          parentAgentSessionId: 'chat-session'
        },
        [`nested:${LEAF}`]: {
          ...context('nested', 'unused'),
          parentPaneKey: hostWorkerPane,
          parentAgentSessionId: 'worker-session'
        }
      },
      agentStatusByPaneKey: { [waiting.paneKey]: waiting },
      retainedAgentsByPaneKey: {},
      unifiedTabsByWorktree: {
        workspace: [parent, terminal('terminal-worker', 2), chatWorker, terminal('nested', 4)]
      }
    }

    const workers = tabStripSubagents(sources, [parent.id])
    expect(workers.map((worker) => [worker.name, worker.tab?.id, worker.state])).toEqual([
      ['terminal-worker', 'terminal-worker', 'pending'],
      ['chat-worker', chatWorker.id, 'waiting'],
      ['nested', 'nested', 'pending']
    ])
  })
})
