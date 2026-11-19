import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock('./research-plot-history', () => ({
  snapshotPlot: vi.fn(async (_target: unknown, input: { kind: string }) => ({
    id: `plot-${input.kind}`
  }))
}))
vi.mock('./research-figure-history', () => ({
  snapshotFigure: vi.fn(async () => ({ id: 'scene' })),
  restoreFigureText: vi.fn()
}))
vi.mock('./research-project-files', () => ({
  projectOwnerKey: (owner: { hostId: string; workspaceId: string }) =>
    JSON.stringify([owner.hostId, owner.workspaceId]),
  readProjectText: vi.fn(async () => '')
}))
vi.mock('./research-figures-agent-session', () => ({ sendFigurePrompt: vi.fn() }))
vi.mock('./research-figures-store', () => ({ openPlotTarget: vi.fn(() => null) }))

import { snapshotFigure } from './research-figure-history'
import { noteTypedFigureMessage } from './research-figure-agent-actions'
import { settleFigureTurn } from './research-figure-turn-settle'
import { beginFigureTurn, figureTurnEntry, useFigureTurn } from './research-figure-turn'
import { openPlotTarget } from './research-figures-store'
import { readProjectText } from './research-project-files'
import { snapshotPlot } from './research-plot-history'

const owner = { hostId: 'local', workspaceId: 'w1', workspacePath: '/p' }
const plot = { owner, folder: '.aster/figures', slug: 'flow' }
const scope = { hostId: 'local', workspaceId: 'w1' }
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('an agent turn on a plot', () => {
  beforeEach(() => {
    useFigureTurn.setState({ figures: {}, workingSessions: {} })
    vi.clearAllMocks()
  })

  it('keeps the plot before the send and after the turn, without reading a scene', async () => {
    const id = beginFigureTurn({
      target: plot,
      plot: true,
      request: 'Make the bars thinner',
      prompt: 'p',
      scope,
      beforeText: null
    })
    await settle()
    expect(snapshotPlot).toHaveBeenCalledWith(plot, {
      kind: 'before-send',
      what: 'Make the bars thinner'
    })
    expect(snapshotFigure).not.toHaveBeenCalled()
    const turn = figureTurnEntry(plot)?.turn
    expect(turn?.id).toBe(id)
    expect(turn?.plot).toBe(true)
    expect(turn?.beforeId).toBe('plot-before-send')
    if (!turn) {
      return
    }
    await settleFigureTurn({ ...turn, phase: 'done' })
    expect(snapshotPlot).toHaveBeenLastCalledWith(plot, {
      kind: 'agent-result',
      what: 'Make the bars thinner'
    })
    expect(readProjectText).not.toHaveBeenCalled()
    expect(figureTurnEntry(plot)?.turn.diff).toEqual({ added: [], changed: [], removed: [] })
  })

  it('tracks a message typed while a plot is open on that plot', async () => {
    vi.mocked(openPlotTarget).mockReturnValue(plot)
    noteTypedFigureMessage(scope, 'chat-flow', 'Use a log scale')
    await settle()
    const turn = figureTurnEntry(plot)?.turn
    expect(turn?.sessionId).toBe('chat-flow')
    expect(turn?.plot).toBe(true)
    expect(snapshotPlot).toHaveBeenCalledWith(plot, {
      kind: 'before-send',
      what: 'Use a log scale'
    })
  })
})
