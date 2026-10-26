import { describe, expect, it } from 'vitest'
import type { Tab } from '../../../../shared/tab-types'
import { researchOrchestrationWorkerTabIds } from './research-orchestration-worker-tabs'

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

  it('leaves a worker visible if its parent only has a terminal surface', () => {
    const parent = tab('parent', 'local', 'terminal')
    const child = tab('child')
    const contexts = {
      [`child:${LEAF}`]: {
        taskId: 'task',
        dispatchId: 'dispatch',
        parentPaneKey: `parent:${LEAF}`
      }
    }
    const owner = (item: Tab): string | null => item.executionHostId ?? null
    expect(researchOrchestrationWorkerTabIds([child], [parent, child], contexts, owner)).toEqual(
      new Set()
    )
    expect(
      researchOrchestrationWorkerTabIds(
        [child],
        [{ ...parent, viewMode: 'chat' }, child],
        contexts,
        owner
      )
    ).toEqual(new Set([child.id]))
  })
})
