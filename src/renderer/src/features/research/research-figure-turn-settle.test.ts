import { beforeEach, describe, expect, it, vi } from 'vitest'

const scene = (ids: string[]): string =>
  JSON.stringify({
    type: 'excalidraw',
    version: 2,
    source: 'aster',
    appState: {},
    files: {},
    elements: ids.map((id) => ({ id, type: 'rectangle', x: 0, y: 0, width: 10, height: 10 }))
  })

vi.mock('./research-figure-history', () => ({
  snapshotFigure: vi.fn(async () => ({ id: 'version-1' }))
}))
vi.mock('./research-project-files', () => ({
  projectOwnerKey: (owner: { hostId: string; workspaceId: string }) =>
    JSON.stringify([owner.hostId, owner.workspaceId]),
  readProjectText: vi.fn(async () => scene(['a', 'new']))
}))

import { snapshotFigure } from './research-figure-history'
import { registerFigureTurnSettler, settleFigureTurn } from './research-figure-turn-settle'
import { beginFigureTurn, figureTurnEntry, useFigureTurn } from './research-figure-turn'
import { noteFigureAgentStatus } from './research-figure-turn-status'
import { readProjectText } from './research-project-files'

const owner = { hostId: 'local', workspaceId: 'w1', workspacePath: '/p' }
const figureA = { owner, folder: 'paper/figures', slug: 'a' }
const figureB = { owner, folder: 'paper/figures', slug: 'b' }
const scope = { hostId: 'local', workspaceId: 'w1' }

describe('settling a figure turn', () => {
  beforeEach(() => {
    useFigureTurn.setState({ figures: {}, workingSessions: {} })
    vi.clearAllMocks()
  })

  it('reads the file of a figure that is not on screen, and leaves the open canvas alone', async () => {
    const settleB = vi.fn(async () => scene([]))
    const stop = registerFigureTurnSettler(figureB, settleB)
    beginFigureTurn({
      target: figureA,
      request: 'draw',
      prompt: 'p',
      scope,
      beforeText: scene(['a']),
      sessionId: 'chat-a'
    })
    noteFigureAgentStatus('chat-a', { status: 'working' })
    noteFigureAgentStatus('chat-a', { status: 'idle', turnOutcome: 'success' })
    const turn = figureTurnEntry(figureA)?.turn
    expect(turn?.phase).toBe('done')
    await settleFigureTurn(turn!)
    expect(settleB).not.toHaveBeenCalled()
    expect(readProjectText).toHaveBeenCalledWith(owner, 'paper/figures/a.excalidraw')
    expect(figureTurnEntry(figureA)?.turn.diff).toEqual({
      added: ['new'],
      changed: [],
      removed: []
    })
    expect(snapshotFigure).toHaveBeenCalledWith(
      figureA,
      expect.objectContaining({ kind: 'agent-result', what: 'draw' })
    )
    stop()
  })

  it('uses the open canvas when the turn ended on the figure on screen', async () => {
    const settle = vi.fn(async () => scene(['a']))
    const stop = registerFigureTurnSettler(figureA, settle)
    beginFigureTurn({
      target: figureA,
      request: 'draw',
      prompt: 'p',
      scope,
      beforeText: scene(['a']),
      sessionId: 'chat-a'
    })
    await settleFigureTurn(figureTurnEntry(figureA)!.turn)
    expect(settle).toHaveBeenCalledTimes(1)
    expect(readProjectText).not.toHaveBeenCalled()
    stop()
  })
})
