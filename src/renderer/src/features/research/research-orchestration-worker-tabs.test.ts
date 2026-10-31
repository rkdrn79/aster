import { describe, expect, it } from 'vitest'
import { structuredAgentSessionPaneKey } from '../../../../shared/structured-agent-session-projection'
import type { Tab } from '../../../../shared/tab-types'
import {
  collapsedOrchestrationWorkerTabIds,
  researchOrchestrationWorkerContexts,
  researchOrchestrationWorkerTabIds
} from './research-orchestration-worker-tabs'

const LEAF = '11111111-1111-4111-8111-111111111111'

function tab(
  id: string,
  host: Tab['executionHostId'] = 'local',
  contentType: Tab['contentType'] = 'agent-session'
): Tab {
  return {
    id,
    entityId: id,
    groupId: 'group',
    worktreeId: 'workspace',
    executionHostId: host,
    contentType,
    label: id,
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 0
  }
}

describe('research orchestration worker tabs', () => {
  it('places a hosted child under its existing parent chat on the same host', () => {
    const parent = tab('parent')
    const child = tab('child')
    const contexts = {
      [`child:${LEAF}`]: {
        taskId: 'task',
        dispatchId: 'dispatch',
        parentPaneKey: `parent:${LEAF}`
      }
    }
    expect(
      researchOrchestrationWorkerTabIds(
        [child],
        [parent, child],
        contexts,
        (item) => item.executionHostId ?? null
      )
    ).toEqual(new Set(['child']))
    expect(
      researchOrchestrationWorkerTabIds(
        [child],
        [child],
        contexts,
        (item) => item.executionHostId ?? null
      )
    ).toEqual(new Set())
  })

  it('keeps unrelated, malformed, and cross-host sessions in Workbench', () => {
    const parent = tab('parent')
    const child = tab('child', 'ssh:other')
    const contexts = {
      [`child:${LEAF}`]: {
        taskId: 'task',
        dispatchId: 'dispatch',
        parentPaneKey: `parent:${LEAF}`
      },
      [`manual:${LEAF}`]: { taskId: 'manual', dispatchId: 'manual' },
      invalid: { taskId: 'bad', dispatchId: 'bad', parentPaneKey: `parent:${LEAF}` }
    }
    expect(
      researchOrchestrationWorkerTabIds(
        [child],
        [parent, child],
        contexts,
        (item) => item.executionHostId ?? null
      )
    ).toEqual(new Set())
  })

  it('keeps a dispatched terminal worker with its parent conversation', () => {
    const parent = tab('parent')
    const child = tab('child-terminal', 'local', 'terminal')
    const contexts = {
      [`child-terminal:${LEAF}`]: {
        taskId: 'task',
        dispatchId: 'dispatch',
        parentPaneKey: `parent:${LEAF}`
      }
    }
    expect(
      researchOrchestrationWorkerTabIds(
        [child],
        [parent, child],
        contexts,
        (item) => item.executionHostId ?? null
      )
    ).toEqual(new Set([child.id]))
  })

  it('folds a worker under a parent that only has a terminal surface', () => {
    const parent = tab('parent', 'local', 'terminal')
    const child = tab('child', 'local', 'terminal')
    const contexts = {
      [`child:${LEAF}`]: {
        taskId: 'task',
        dispatchId: 'dispatch',
        parentPaneKey: `parent:${LEAF}`
      }
    }
    const owner = (item: Tab): string | null => item.executionHostId ?? null
    expect(researchOrchestrationWorkerTabIds([child], [parent, child], contexts, owner)).toEqual(
      new Set([child.id])
    )
  })

  it('folds terminal and chat workers under a chat whose tab id is not the host one', () => {
    // A `/clear`ed chat keeps its tab id while showing its successor session.
    const chat = { ...tab('structured-agent-session-chat-root'), entityId: 'chat-now' }
    const chatWorker = { ...tab('structured-agent-session-worker'), entityId: 'worker' }
    const terminalWorker = tab('terminal-worker', 'local', 'terminal')
    const nested = tab('nested', 'local', 'terminal')
    const underChat = {
      parentPaneKey: structuredAgentSessionPaneKey('host-chat-tab', 'chat-now'),
      parentAgentSessionId: 'chat-now'
    }
    const lineage = researchOrchestrationWorkerContexts({
      runtimeAgentOrchestrationByPaneKey: {
        [`terminal-worker:${LEAF}`]: { taskId: 't1', dispatchId: 'd1', ...underChat },
        [structuredAgentSessionPaneKey('host-worker-tab', 'worker')]: {
          taskId: 't2',
          dispatchId: 'd2',
          agentSessionId: 'worker',
          ...underChat
        },
        [`nested:${LEAF}`]: {
          taskId: 't3',
          dispatchId: 'd3',
          parentPaneKey: structuredAgentSessionPaneKey('host-worker-tab', 'worker'),
          parentAgentSessionId: 'worker'
        }
      },
      unifiedTabsByWorktree: { workspace: [chat, chatWorker, terminalWorker, nested] }
    })
    const tabs = [chat, chatWorker, terminalWorker, nested]

    expect(lineage[structuredAgentSessionPaneKey(chatWorker.id, 'worker')]).toMatchObject({
      parentPaneKey: structuredAgentSessionPaneKey(chat.id, 'chat-now')
    })
    expect(
      researchOrchestrationWorkerTabIds(tabs, tabs, lineage, (item) => item.executionHostId ?? null)
    ).toEqual(new Set([chatWorker.id, terminalWorker.id, nested.id]))
  })

  it('keeps a pinned or open worker in the strip', () => {
    const child = tab('child', 'local', 'terminal')
    const pinned = { ...tab('pinned', 'local', 'terminal'), isPinned: true }
    const open = tab('open', 'local', 'terminal')
    const workers = new Set([child.id, pinned.id, open.id])
    expect(
      collapsedOrchestrationWorkerTabIds(workers, [child, pinned, open], [{ activeTabId: open.id }])
    ).toEqual(new Set([child.id]))
    expect(
      collapsedOrchestrationWorkerTabIds(workers, [child], [{ activeTabId: child.id }])
    ).toEqual(new Set())
  })
})
