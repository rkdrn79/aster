import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/agent-message-send', () => ({ sendMessageToAgent: vi.fn() }))
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))
vi.mock('./research-records-store', () => ({ useResearchRecords: { getState: () => ({}) } }))

import { splitAsterContext } from '../../../../shared/aster-context-block'
import { withFigureMessageContext } from './research-figures-agent-session'

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
