import { describe, expect, it } from 'vitest'
import type { Tab } from '../../../../shared/tab-types'
import { nativeChatOrchestrationWorkers } from './native-chat-orchestration-workers'

const LEAF = '11111111-1111-4111-8111-111111111111'
const PARENT = `parent:${LEAF}`
const CHILD = `child:${LEAF}`

const childTab: Tab = {
  id: 'child',
  entityId: 'session-child',
  groupId: 'group',
  worktreeId: 'workspace',
  executionHostId: 'local',
  contentType: 'agent-session',
  label: 'Worker chat',
  customLabel: null,
  color: null,
  sortOrder: 0,
  createdAt: 0
}

describe('native chat orchestration workers', () => {
  it('shows a linked worker before its tab arrives and keeps its task status', () => {
    const sources = {
      runtimeAgentOrchestrationByPaneKey: {
        [CHILD]: {
          taskId: 'task',
          dispatchId: 'dispatch',
          parentPaneKey: PARENT,
          displayName: 'Analyze data',
          dispatchStatus: 'dispatched' as const
        }
      },
      agentStatusByPaneKey: {},
      retainedAgentsByPaneKey: {},
      unifiedTabsByWorktree: {}
    }
    expect(nativeChatOrchestrationWorkers(sources, PARENT)).toEqual([
      { paneKey: CHILD, name: 'Analyze data', state: 'dispatched', tab: null }
    ])
    expect(
      nativeChatOrchestrationWorkers(
        { ...sources, unifiedTabsByWorktree: { workspace: [childTab] } },
        PARENT
      )[0]?.tab
    ).toEqual(childTab)
    expect(nativeChatOrchestrationWorkers(sources, `other:${LEAF}`)).toEqual([])
  })
})
