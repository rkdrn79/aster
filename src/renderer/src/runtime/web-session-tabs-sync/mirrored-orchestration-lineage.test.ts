import { describe, expect, it } from 'vitest'
import { structuredAgentSessionPaneKey } from '../../../../shared/structured-agent-session-projection'
import { toWebTerminalSurfaceTabId } from '../../../../shared/terminal-surface-id'
import {
  mirrorHostOrchestrationContext,
  mirrorHostOrchestrationLineage,
  toMirroredHostPaneKey
} from './mirrored-orchestration-lineage'

const COORDINATOR_LEAF = '11111111-1111-4111-8111-111111111111'
const WORKER_LEAF = '22222222-2222-4222-8222-222222222222'

describe('mirrorHostOrchestrationLineage', () => {
  it('rekeys host panes and their parents to the web client mirror tab ids', () => {
    const mirrored = mirrorHostOrchestrationLineage({
      [`worker-tab:${WORKER_LEAF}`]: {
        taskId: 'task-1',
        dispatchId: 'dispatch-1',
        dispatchStatus: 'dispatched',
        parentPaneKey: `coordinator-tab:${COORDINATOR_LEAF}`,
        parentTerminalHandle: 'term_parent'
      }
    })

    expect(mirrored).toEqual({
      [`web-terminal-worker-tab:${WORKER_LEAF}`]: {
        taskId: 'task-1',
        dispatchId: 'dispatch-1',
        dispatchStatus: 'dispatched',
        parentPaneKey: `web-terminal-coordinator-tab:${COORDINATOR_LEAF}`,
        parentTerminalHandle: 'term_parent'
      }
    })
  })

  it('leaves chat panes to be found by session, since chat tabs are not mirrored by tab id', () => {
    const chatPane = structuredAgentSessionPaneKey('host-chat-tab', 'chat-session')
    const workerChatPane = structuredAgentSessionPaneKey('host-worker-tab', 'worker-session')
    const underChat = { parentPaneKey: chatPane, parentAgentSessionId: 'chat-session' }
    const mirrored = mirrorHostOrchestrationLineage({
      [`worker-tab:${WORKER_LEAF}`]: { taskId: 't1', dispatchId: 'd1', ...underChat },
      [workerChatPane]: {
        taskId: 't2',
        dispatchId: 'd2',
        agentSessionId: 'worker-session',
        ...underChat
      }
    })

    expect(mirrored).toEqual({
      [`web-terminal-worker-tab:${WORKER_LEAF}`]: { taskId: 't1', dispatchId: 'd1', ...underChat },
      [workerChatPane]: {
        taskId: 't2',
        dispatchId: 'd2',
        agentSessionId: 'worker-session',
        ...underChat
      }
    })
  })

  it('matches the encoding the mirror gives host tab ids', () => {
    const hostTabId = 'tab with spaces&more'
    expect(toMirroredHostPaneKey(`${hostTabId}:${WORKER_LEAF}`)).toBe(
      `${toWebTerminalSurfaceTabId(hostTabId)}:${WORKER_LEAF}`
    )
  })

  it('drops rows keyed by legacy numeric panes and parents it cannot name', () => {
    expect(
      mirrorHostOrchestrationLineage({
        'worker-tab:1': { taskId: 't', dispatchId: 'd' }
      })
    ).toEqual({})
    expect(
      mirrorHostOrchestrationContext({ taskId: 't', dispatchId: 'd', parentPaneKey: 'tab:1' })
    ).toEqual({ taskId: 't', dispatchId: 'd' })
  })
})
