import { describe, expect, it, vi, type Mock } from 'vitest'

type Records = { document: ResearchDocument | null; update: Mock }
const records = vi.hoisted((): { state: Records } => ({
  state: { document: null, update: vi.fn() }
}))

vi.mock('@/lib/agent-message-send', () => ({ sendMessageToAgent: vi.fn() }))
vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ unifiedTabsByWorktree: { w1: [] } }) }
}))
vi.mock('./research-records-store', () => ({
  useResearchRecords: { getState: () => records.state }
}))
vi.mock('./ResearchAgentChatPane', () => ({
  researchChatSessionTabs: () => [{ entityId: 'legacy' }]
}))

import type { ResearchDocument } from '../../../../shared/research/research-records'
import { emptyResearchDocument } from '../../../../shared/research/research-records'
import { splitAsterContext } from '../../../../shared/aster-context-block'
import { adoptLegacyFigureChat, withFigureMessageContext } from './research-figures-agent-session'

const context = (key: string) => ({ key, label: 'Figure method', body: `figure ${key}` })

describe('typed Figure chat messages', () => {
  it('carry the figure context first, then only when the figure changes', () => {
    const first = withFigureMessageContext('chat-1', 'make the encoder wider', context('a'))
    expect(splitAsterContext(first)).toEqual({
      request: 'make the encoder wider',
      contexts: [{ label: 'Figure method', body: 'figure a' }]
    })
    expect(withFigureMessageContext('chat-1', 'and taller', context('a'))).toBe('and taller')
    expect(
      splitAsterContext(withFigureMessageContext('chat-1', 'now this one', context('b')))?.contexts
    ).toHaveLength(1)
    expect(
      splitAsterContext(withFigureMessageContext('chat-2', 'hi', context('b')))?.contexts
    ).toHaveLength(1)
    expect(withFigureMessageContext('chat-3', '/compact', context('b'))).toBe('/compact')
  })
})

describe('adopting the chat of an older version', () => {
  const scope = { hostId: 'local', workspaceId: 'w1' }
  it('asks History once per project and moves the chat onto the figure it found', async () => {
    records.state.document = {
      ...emptyResearchDocument(),
      figuresAgentSessionByScope: { '["local","w1"]': 'legacy' }
    }
    records.state.update.mockImplementation(
      async (change: (document: ResearchDocument) => ResearchDocument) => {
        if (records.state.document) {
          records.state.document = change(records.state.document)
        }
      }
    )
    const lastTurn = vi.fn().mockResolvedValue('method')
    await adoptLegacyFigureChat(scope, ['method', 'plot'], lastTurn)
    expect(lastTurn).toHaveBeenCalledWith(['method', 'plot'])
    expect(records.state.document?.figureAgentSessionsByScope?.['["local","w1"]']).toEqual({
      method: 'legacy'
    })
    await adoptLegacyFigureChat(scope, ['method', 'plot'], lastTurn)
    expect(lastTurn).toHaveBeenCalledTimes(1)
  })

  it('keeps the chat as the project chat without a signal, once', async () => {
    const other = { hostId: 'local', workspaceId: 'w1b' }
    records.state.document = {
      ...emptyResearchDocument(),
      figuresAgentSessionByScope: { '["local","w1b"]': 'legacy' }
    }
    await adoptLegacyFigureChat(other, ['a'], vi.fn().mockResolvedValue(null))
    expect(records.state.document?.figureAgentSessionsByScope?.['["local","w1b"]']).toEqual({})
    expect(records.state.document?.figuresAgentSessionByScope?.['["local","w1b"]']).toBe('legacy')
  })
})
