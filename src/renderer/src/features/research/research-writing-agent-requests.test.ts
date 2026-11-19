import { describe, expect, it, vi } from 'vitest'

const sent = vi.hoisted((): { calls: unknown[] } => ({ calls: [] }))
const launched = vi.hoisted((): { calls: unknown[] } => ({ calls: [] }))

vi.mock('@/lib/agent-message-send', () => ({
  sendMessageToAgent: vi.fn(async (args: unknown) => {
    sent.calls.push(args)
    return { status: 'sent' }
  })
}))
vi.mock('@/runtime/structured-agent-session-owner', () => ({
  structuredAgentSessionOwnerForTab: () => 'local'
}))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      unifiedTabsByWorktree: {
        w1: [{ id: 'tab-1', entityId: 'chat-1', worktreeId: 'w1', contentType: 'agent-session' }]
      }
    })
  }
}))
vi.mock('./research-records-store', () => ({
  useResearchRecords: {
    getState: () => ({ document: { writingAgentSessionByScope: { 'local:w1': 'chat-1' } } })
  }
}))
vi.mock('./research-conversation-home', () => ({
  writingAgentScopeKey: (scope: { hostId: string; workspaceId: string }) =>
    `${scope.hostId}:${scope.workspaceId}`
}))
vi.mock('./research-agent-review-launch', () => ({ reviewChatAgent: () => 'claude' }))
vi.mock('./research-writing-agent-session', () => ({
  launchWritingAgent: vi.fn(async (...args: unknown[]) => {
    launched.calls.push(args)
    return null
  })
}))
vi.mock('../../../../shared/structured-agent-session-tab', () => ({ isStructuredTab: () => true }))

import { splitAsterContext } from '../../../../shared/aster-context-block'
import {
  sendWritingPrompt,
  withWritingMessageContext,
  writingPromptContext
} from './research-writing-agent-requests'

const record = {
  hostId: 'local',
  workspaceId: 'w1',
  workspacePath: '/work/proj',
  manuscript: { sourcePath: 'paper/main.tex', pdfPath: null },
  writingAgentSessionId: undefined
}

describe('Writing agent requests', () => {
  it('name the manuscript by its absolute path', () => {
    expect(writingPromptContext(record)).toEqual({
      projectPath: '/work/proj',
      manuscriptPath: '/work/proj/paper/main.tex'
    })
    expect(writingPromptContext({ ...record, manuscript: undefined }).manuscriptPath).toBe(null)
  })

  it('attach the Writing context to the first typed message and again when it changes', () => {
    const context = (key: string) => ({ key, label: 'Writing', body: `guide ${key}` })
    const first = withWritingMessageContext('chat-x', 'tighten paragraph 2', context('a'))
    expect(splitAsterContext(first)?.contexts[0]?.body).toBe('guide a')
    expect(withWritingMessageContext('chat-x', 'and paragraph 3', context('a'))).toBe(
      'and paragraph 3'
    )
    expect(splitAsterContext(withWritingMessageContext('chat-x', 'now', context('b')))).not.toBe(
      null
    )
    expect(withWritingMessageContext('chat-x', '/compact', context('c'))).toBe('/compact')
  })

  it('send to the bound chat, and mark its context as delivered', async () => {
    await expect(sendWritingPrompt(record, 'Draft the intro.', 'key-1')).resolves.toBe(null)
    expect(sent.calls.at(-1)).toEqual({
      worktreeId: 'w1',
      target: { kind: 'structured-session', sessionId: 'chat-1' },
      prompt: 'Draft the intro.'
    })
    expect(
      withWritingMessageContext('chat-1', 'thanks', { key: 'key-1', label: 'W', body: 'b' })
    ).toBe('thanks')
    expect(launched.calls).toHaveLength(0)
  })

  it('start a Writing chat with the prompt when none is open', async () => {
    await sendWritingPrompt({ ...record, workspaceId: 'w2' }, 'Draft the method.')
    expect(launched.calls.at(-1)).toEqual([
      expect.objectContaining({ workspaceId: 'w2' }),
      'claude',
      'Draft the method.'
    ])
  })
})
