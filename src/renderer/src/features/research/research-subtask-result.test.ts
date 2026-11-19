import { describe, expect, it } from 'vitest'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import { splitAsterContext } from '../../../../shared/aster-context-block'
import {
  researchSubtaskDeliveryMessage,
  researchSubtaskPreview,
  researchSubtaskResultFromItems
} from './research-subtask-result'
import { pendingResearchSubtasks } from './ResearchSubtaskDelivery'
import { researchSubtaskPrompt } from './research-chat-branch-run'

function message(
  itemId: string,
  role: 'user' | 'assistant',
  text: string,
  agentId?: string
): AgentJournalRenderItem {
  return {
    itemId,
    revision: 1,
    sequence: 1,
    observedAt: 0,
    body: { kind: 'message', role, blocks: [{ type: 'text', text }] },
    ...(agentId ? { agentId } : {})
  }
}

describe('subtask results', () => {
  const copied = [message('u1', 'user', 'alpha?'), message('a1', 'assistant', 'alpha.')]

  it("is what the agent answered the subtask's prompt, and nothing of the copied chat", () => {
    expect(researchSubtaskResultFromItems(copied)).toBeNull()
    const asked = [...copied, message('u2', 'user', researchSubtaskPrompt('Check the table'))]
    expect(researchSubtaskResultFromItems(asked)).toBeNull()
    expect(
      researchSubtaskResultFromItems([
        ...asked,
        message('a2', 'assistant', 'Row 3 is wrong.'),
        message('s1', 'assistant', 'a helper wrote this', 'helper'),
        message('a3', 'assistant', 'Fixed value: 41.8.')
      ])
    ).toBe('Row 3 is wrong.\n\nFixed value: 41.8.')
  })

  it('hands the result back as a short line with the result folded beneath', () => {
    const delivered = researchSubtaskDeliveryMessage('Check the table', 'Row 3 is wrong.')
    expect(splitAsterContext(delivered)).toEqual({
      request: 'Subtask finished: Check the table',
      contexts: [{ label: 'Subtask result', body: 'Row 3 is wrong.' }]
    })
    expect(researchSubtaskPreview('a\n\n b')).toBe('a b')
    expect(researchSubtaskPreview('x'.repeat(700))).toHaveLength(600)
  })

  it('watches only subtasks whose result has not reached their chat', () => {
    const key = (id: string) => JSON.stringify(['local', 'ws-1', id])
    const base = { parentSessionId: 'chat-1', messageNumber: 2, createdAt: 't' }
    expect(
      pendingResearchSubtasks({
        [key('s1')]: { ...base, kind: 'subtask', task: 'a' },
        [key('s2')]: { ...base, kind: 'subtask', task: 'b', deliveredAt: 't2' },
        [key('f1')]: { ...base, kind: 'fork' },
        [key('b1')]: base
      }).map(({ sessionId, hostId, workspaceId }) => [hostId, workspaceId, sessionId])
    ).toEqual([['local', 'ws-1', 's1']])
  })
})
