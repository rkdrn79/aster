import { beforeEach, describe, expect, it, vi } from 'vitest'

const openHandle = vi.hoisted((): { value: { target: unknown } | null } => ({ value: null }))

vi.mock('./research-figure-history', () => ({
  snapshotFigure: vi.fn(async () => ({ id: 'before-1' }))
}))
vi.mock('./research-figure-editor-handle', () => ({
  useFigureEditorHandle: { getState: () => ({ handle: openHandle.value }) }
}))

import { snapshotFigure } from './research-figure-history'
import {
  attachFigureTurnSession,
  beginFigureTurn,
  dismissFigureTurnBar,
  figureAgentWriting,
  figureTurnBeforeText,
  figureTurnEntry,
  figureTurnPhaseText,
  forgetFigureTurn,
  moveFigureTurn,
  noteFigureAgentWrite,
  noteFigureOpenedDuringTurn,
  useFigureAgentEditing,
  useFigureTurn,
  type FigureTurn
} from './research-figure-turn'
import {
  activeFigureTurnSessions,
  figureSessionWorking,
  noteFigureAgentStatus
} from './research-figure-turn-status'
import type { FigureTarget } from './research-figures-export'

const owner = { hostId: 'local', workspaceId: 'w1', workspacePath: '/p' }
const target = { owner, folder: 'paper/figures', slug: 'method-overview' }
const other = { owner, folder: 'paper/figures', slug: 'results-plot' }
const scope = { hostId: 'local', workspaceId: 'w1' }

function start(figure: FigureTarget = target, sessionId: string | null = 'chat-a'): number {
  return beginFigureTurn({
    target: figure,
    request: 'Draw from the method section',
    prompt: 'full prompt',
    scope,
    beforeText: '{"elements":[]}',
    sessionId
  })
}

function turnOf(figure: FigureTarget = target): FigureTurn | null {
  return figureTurnEntry(figure)?.turn ?? null
}

function tool(name: string, input: string): void {
  noteFigureAgentStatus('chat-a', { status: 'working', toolName: name, toolInput: input })
}

describe('the tracked agent turn', () => {
  beforeEach(() => {
    useFigureTurn.setState({ figures: {}, workingSessions: {} })
  })

  it('keeps the figure before sending and starts as Sending…', () => {
    start()
    const turn = turnOf()
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
      const turn = turnOf()
      return turn ? figureTurnPhaseText(turn) : ''
    }
    noteFigureAgentStatus('chat-a', { status: 'working' })
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
    noteFigureAgentStatus('chat-a', { status: 'idle', turnOutcome: 'success' })
    expect(turnOf()?.phase).toBe('done')
    // Ended but not settled yet: the canvas still treats file changes as the agent's.
    expect(figureAgentWriting(target)).toBe(true)
  })

  it('ignores an idle status before the agent started working, and reads a stop', () => {
    start()
    noteFigureAgentStatus('chat-a', { status: 'idle', turnOutcome: 'success' })
    expect(turnOf()?.phase).toBe('sending')
    noteFigureAgentStatus('chat-a', { status: 'working' })
    noteFigureAgentStatus('chat-a', { status: 'idle', turnOutcome: 'cancellation' })
    expect(turnOf()?.phase).toBe('stopped')
  })

  it('ends a turn whose chat was already working when the turn began', () => {
    noteFigureAgentStatus('chat-a', { status: 'working' })
    start()
    expect(turnOf()?.phase).toBe('sending')
    noteFigureAgentStatus('chat-a', { status: 'idle', turnOutcome: 'success' })
    expect(turnOf()?.phase).toBe('done')
  })

  it('ends a turn whose chat reported working before the send named it', () => {
    const id = start(target, null)
    noteFigureAgentStatus('chat-a', { status: 'working' })
    attachFigureTurnSession(id, 'chat-a')
    noteFigureAgentStatus('chat-a', { status: 'idle', turnOutcome: 'success' })
    expect(turnOf()?.phase).toBe('done')
  })

  it('tracks each figure on its own: one finishing does not touch the other', () => {
    start(target, 'chat-a')
    start(other, 'chat-b')
    noteFigureAgentStatus('chat-a', {
      status: 'working',
      toolName: 'Bash',
      toolInput: 'node x.mjs'
    })
    noteFigureAgentStatus('chat-b', { status: 'working' })
    expect(turnOf(target)?.phase).toBe('drawing')
    expect(turnOf(other)?.phase).toBe('reading')
    noteFigureAgentStatus('chat-a', { status: 'idle', turnOutcome: 'success' })
    expect(turnOf(target)?.phase).toBe('done')
    expect(turnOf(other)?.phase).toBe('reading')
    expect(figureAgentWriting(other)).toBe(true)
    expect(figureSessionWorking('chat-a')).toBe(false)
    expect(figureSessionWorking('chat-b')).toBe(true)
    expect(activeFigureTurnSessions(useFigureTurn.getState(), scope)).toEqual(['chat-b'])
  })

  it('keeps bar, flash and dismissal per figure', () => {
    start(target, 'chat-a')
    start(other, 'chat-b')
    openHandle.value = { target }
    noteFigureAgentWrite(['a1'])
    dismissFigureTurnBar(other)
    expect(figureTurnEntry(target)?.flash?.ids).toEqual(['a1'])
    expect(figureTurnEntry(other)?.flash).toBeNull()
    expect(figureTurnEntry(target)?.barDismissed).toBe(false)
    expect(figureTurnEntry(other)?.barDismissed).toBe(true)
  })

  it('names the chat of a turn once a new chat exists, and only then follows it', () => {
    const id = start(target, null)
    noteFigureAgentStatus('chat-a', { status: 'working' })
    expect(turnOf()?.phase).toBe('sending')
    attachFigureTurnSession(id, 'chat-a')
    noteFigureAgentStatus('chat-a', { status: 'working' })
    expect(turnOf()?.phase).toBe('reading')
  })

  it('builds the next write on the file when the figure opened during the turn', () => {
    start(target, 'chat-a')
    expect(figureTurnBeforeText(target)).toBe('{"elements":[]}')
    noteFigureOpenedDuringTurn(target, '{"elements":[1]}')
    expect(figureTurnBeforeText(target)).toBe('{"elements":[1]}')
    expect(figureTurnEntry(target)?.turn.beforeText).toBe('{"elements":[]}')
    const other2 = { ...other, slug: 'not-in-a-turn' }
    noteFigureOpenedDuringTurn(other2, '{}')
    expect(figureTurnBeforeText(other2)).toBeNull()
  })

  it('does not track a request with no figure', () => {
    beginFigureTurn({ target: null, request: 'Plot', prompt: 'p', scope, beforeText: null })
    expect(useFigureTurn.getState().figures).toEqual({})
  })

  it('moves a turn with a renamed figure and forgets a deleted one', () => {
    start(target, 'chat-a')
    moveFigureTurn(target, 'overview')
    expect(turnOf(target)).toBeNull()
    expect(turnOf({ ...target, slug: 'overview' })?.sessionId).toBe('chat-a')
    expect(figureAgentWriting({ ...target, slug: 'overview' })).toBe(true)
    forgetFigureTurn({ ...target, slug: 'overview' })
    expect(useFigureTurn.getState().figures).toEqual({})
  })
})
