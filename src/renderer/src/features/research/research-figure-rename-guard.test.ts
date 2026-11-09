import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./research-figure-history', () => ({
  snapshotFigure: vi.fn(async () => ({ id: 'before-1' }))
}))
vi.mock('./research-figure-editor-handle', () => ({
  useFigureEditorHandle: { getState: () => ({ handle: null }) }
}))

import { emptyResearchDocument } from '../../../../shared/research/research-records'
import { withFigureAgentSession } from './research-figure-chat-slots'
import { figureRenameBlocked } from './research-figure-rename-guard'
import { beginFigureTurn, updateFigureTurn, useFigureTurn } from './research-figure-turn'
import { noteFigureAgentStatus } from './research-figure-turn-status'
import { useResearchRecords } from './research-records-store'

const owner = { hostId: 'local', workspaceId: 'w1', workspacePath: '/p' }
const scope = { hostId: 'local', workspaceId: 'w1' }
const figure = { owner, folder: 'paper/figures', slug: 'overview' }

function begin(slug = figure.slug, sessionId: string | null = 'chat-a'): number {
  return beginFigureTurn({
    target: { ...figure, slug },
    request: 'Draw',
    prompt: 'Draw',
    scope,
    beforeText: null,
    sessionId
  })
}

function bindChat(slug: string, sessionId: string): void {
  useResearchRecords.setState({
    document: withFigureAgentSession(emptyResearchDocument(), scope, slug, sessionId)
  })
}

describe('renaming a figure while its agent works', () => {
  beforeEach(() => {
    useFigureTurn.setState({ figures: {}, workingSessions: {} })
    useResearchRecords.setState({ document: null })
  })

  it('allows it when the figure has no running turn', () => {
    expect(figureRenameBlocked(owner, figure.slug)).toBe(false)
  })

  it('blocks it from the send on, before the chat is even known', () => {
    begin(figure.slug, null)
    expect(figureRenameBlocked(owner, figure.slug)).toBe(true)
  })

  it('stays blocked while the agent waits for an answer, and frees it when the turn ends', () => {
    const id = begin()
    updateFigureTurn(id, { phase: 'waiting' })
    expect(figureRenameBlocked(owner, figure.slug)).toBe(true)
    updateFigureTurn(id, { phase: 'done' })
    expect(figureRenameBlocked(owner, figure.slug)).toBe(false)
    updateFigureTurn(id, { phase: 'stopped' })
    expect(figureRenameBlocked(owner, figure.slug)).toBe(false)
    updateFigureTurn(id, { phase: 'failed' })
    expect(figureRenameBlocked(owner, figure.slug)).toBe(false)
  })

  it('leaves other figures free', () => {
    begin('another')
    expect(figureRenameBlocked(owner, 'another')).toBe(true)
    expect(figureRenameBlocked(owner, figure.slug)).toBe(false)
    expect(figureRenameBlocked({ hostId: 'local', workspaceId: 'w2' }, 'another')).toBe(false)
  })

  it('blocks it while the figure’s chat works with no turn in this window', () => {
    bindChat(figure.slug, 'chat-a')
    expect(figureRenameBlocked(owner, figure.slug)).toBe(false)
    noteFigureAgentStatus('chat-a', { status: 'working' })
    expect(figureRenameBlocked(owner, figure.slug)).toBe(true)
    expect(figureRenameBlocked(owner, 'another')).toBe(false)
    noteFigureAgentStatus('chat-a', { status: 'idle' })
    expect(figureRenameBlocked(owner, figure.slug)).toBe(false)
  })
})
