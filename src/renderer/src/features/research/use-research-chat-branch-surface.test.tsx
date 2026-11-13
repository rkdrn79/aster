// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import type { AgentType } from '../../../../shared/agent-status-types'

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  supports: vi.fn(async () => true),
  state: {
    unifiedTabsByWorktree: {
      'ws-1': [{ id: 'tab-1', entityId: 'chat-1', customLabel: 'Reviewer 2', label: 'Claude' }]
    }
  }
}))
vi.mock('./research-chat-branch-actions', () => ({
  runResearchChatBranch: mocks.run,
  researchChatTabLabel: (tab: { customLabel: string }) => tab.customLabel
}))
vi.mock('@/runtime/structured-agent-session-branch-client', () => ({
  supportsStructuredAgentSessionBranch: mocks.supports
}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (select: (state: typeof mocks.state) => unknown) => select(mocks.state),
    { getState: () => mocks.state }
  )
}))

const { useResearchChatBranchSurface } = await import('./use-research-chat-branch-surface')

function item(
  itemId: string,
  body: AgentJournalRenderItem['body'],
  turnItemId?: string
): AgentJournalRenderItem {
  return {
    itemId,
    revision: 1,
    sequence: 1,
    observedAt: 0,
    body,
    ...(turnItemId ? { turnScope: { kind: 'turn', turnItemId } } : {})
  }
}
const text = (role: 'user' | 'assistant', value: string): AgentJournalRenderItem['body'] => ({
  kind: 'message',
  role,
  blocks: [{ type: 'text', text: value }]
})
const ITEMS = [
  item('t1', { kind: 'turn', turnId: 't1', state: 'completed', userItemId: 'u1' }),
  item('u1', text('user', 'first?'), 't1'),
  item('a1', text('assistant', 'first.'), 't1'),
  item('t2', { kind: 'turn', turnId: 't2', state: 'completed', userItemId: 'u2' }),
  item('u2', text('user', 'second?'), 't2'),
  item('a2', text('assistant', 'second.'), 't2')
]
const MESSAGES = ['u1', 'a1', 'u2', 'a2'].map((id): NativeChatMessage => ({
  id,
  role: id.startsWith('u') ? 'user' : 'assistant',
  blocks: [],
  timestamp: null,
  source: 'transcript'
}))

function render(agent: AgentType = 'claude', status = 'ready') {
  return renderHook(() =>
    useResearchChatBranchSurface(
      { tabId: 'tab-1', sessionId: 'chat-1', agent, target: { kind: 'local' } },
      'ws-1',
      { status, isWorking: false, journalItems: ITEMS },
      MESSAGES
    )
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.supports.mockResolvedValue(true)
})

describe('useResearchChatBranchSurface', () => {
  it("branches through an agent's reply up to the next prompt, or the whole chat after the last", async () => {
    const { result } = render()
    await waitFor(() => expect(mocks.supports).toHaveBeenCalled())
    expect(result.current.disabledReason).toBeNull()
    expect([...result.current.openerIds]).toEqual(['u1', 'u2'])
    result.current.branchFrom('a1')
    result.current.branchFrom('a2')
    result.current.branchChat()
    expect(mocks.run.mock.calls.map((call) => call[1])).toEqual([
      { at: 'through', beforeItemId: 'u2' },
      { at: 'through', beforeItemId: null },
      { at: 'through', beforeItemId: null }
    ])
    expect(mocks.run.mock.calls[0]![0]).toMatchObject({
      hostId: 'local',
      workspaceId: 'ws-1',
      sessionId: 'chat-1',
      label: 'Reviewer 2'
    })
  })

  it("asks the person's message again, or puts it back in the composer to edit", () => {
    const { result } = render()
    result.current.branchFrom('u2')
    result.current.editAndBranch('u2')
    expect(mocks.run.mock.calls.map((call) => call[1])).toEqual([
      { at: 'message', beforeItemId: 'u2', resend: 'second?' },
      {
        at: 'message',
        beforeItemId: 'u2',
        edit: { itemId: 'u2', blocks: [{ type: 'text', text: 'second?' }] }
      }
    ])
  })

  it('lets an agent that copies only whole chats branch from its latest reply alone', () => {
    const { result } = render('opencode')
    expect(result.current.earlierDisabledReason).toBe(
      'OpenCode chats can branch only from the latest message.'
    )
    expect(result.current.isLatest('a2')).toBe(true)
    expect(result.current.isLatest('a1')).toBe(false)
    expect(result.current.isLatest('u2')).toBe(false)
  })

  it('says why it cannot branch, and runs nothing', async () => {
    expect(render('gemini').result.current.disabledReason).toBe("Gemini chats can't branch yet.")
    expect(render('claude', 'loading').result.current.disabledReason).toBe(
      'Wait for the chat to finish connecting.'
    )
    mocks.supports.mockResolvedValue(false)
    const old = render()
    await waitFor(() =>
      expect(old.result.current.disabledReason).toBe(
        'Update Aster on this server to branch its chats.'
      )
    )
    old.result.current.branchChat()
    expect(mocks.run).not.toHaveBeenCalled()
  })
})
