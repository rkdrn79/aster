import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./research-figure-history', () => ({
  snapshotFigure: vi.fn(async () => ({ id: 'before-1' }))
}))

import { snapshotFigure } from './research-figure-history'
import {
  beginFigureTurn,
  figureAgentWriting,
  figureTurnPhaseText,
  noteFigureAgentStatus,
  useFigureAgentEditing,
  useFigureTurn
} from './research-figure-turn'

const owner = { hostId: 'local', workspaceId: 'w1', workspacePath: '/p' }
const target = { owner, folder: 'paper/figures', slug: 'method-overview' }
const scope = { hostId: 'local', workspaceId: 'w1' }

function start(): void {
  beginFigureTurn({
    target,
    request: 'Draw from the method section',
    prompt: 'full prompt',
    scope,
    beforeText: '{"elements":[]}'
  })
}

function tool(name: string, input: string): void {
  noteFigureAgentStatus({ status: 'working', toolName: name, toolInput: input })
}

describe('the tracked agent turn', () => {
  beforeEach(() => {
    useFigureTurn.setState({ turn: null, barDismissed: false, showChanges: false, flash: null })
  })

  it('keeps the figure before sending and starts as Sending…', () => {
    start()
    const turn = useFigureTurn.getState().turn
    expect(turn && figureTurnPhaseText(turn)).toBe('Sending…')
    expect(snapshotFigure).toHaveBeenCalledWith(target, {
      kind: 'before-send',
      what: 'Draw from the method section',
      text: '{"elements":[]}'
    })
    expect(figureAgentWriting(target)).toBe(true)
    expect(useFigureAgentEditing).toBeTypeOf('function')
  })

  it('reads tool calls as reading, drawing rounds and preview checks', () => {
    start()
    const phase = (): string => {
      const turn = useFigureTurn.getState().turn
      return turn ? figureTurnPhaseText(turn) : ''
    }
    noteFigureAgentStatus({ status: 'working' })
    expect(phase()).toBe('Reading…')
    tool('Read', '/p/paper/main.tex')
    expect(phase()).toBe('Reading…')
    tool('Bash', 'node paper/figures/src/method-overview.figure.mjs')
    expect(phase()).toBe('Drawing · round 1')
    tool('Bash', 'node "$H/cli.mjs" figures preview --figure method-overview')
    expect(phase()).toBe('Checking the preview · round 1/3')
    tool('Read', '/p/.aster/cache/figures/method-overview.png')
    expect(phase()).toBe('Checking the preview · round 1/3')
    tool('Bash', 'node paper/figures/src/method-overview.figure.mjs --round 2')
    expect(phase()).toBe('Drawing · round 2')
    tool('Bash', 'node "$H/cli.mjs" figures check --figure method-overview')
    expect(phase()).toBe('Checking the preview · round 2/3')
    noteFigureAgentStatus({ status: 'idle', turnOutcome: 'success' })
    expect(useFigureTurn.getState().turn?.phase).toBe('done')
    // Ended but not settled yet: the canvas still treats file changes as the agent's.
    expect(figureAgentWriting(target)).toBe(true)
  })

  it('ignores an idle status before the agent started working, and reads a stop', () => {
    start()
    noteFigureAgentStatus({ status: 'idle', turnOutcome: 'success' })
    expect(useFigureTurn.getState().turn?.phase).toBe('sending')
    noteFigureAgentStatus({ status: 'working' })
    noteFigureAgentStatus({ status: 'idle', turnOutcome: 'cancellation' })
    expect(useFigureTurn.getState().turn?.phase).toBe('stopped')
  })
})
