import { beforeEach, describe, expect, it, vi } from 'vitest'

const SCENE = '{"type":"excalidraw","elements":[]}'
const owner = { hostId: 'local', workspaceId: 'w1', workspacePath: '/p' }
const target = { owner, folder: '.aster/figures', slug: 'method-overview' }
const scope = { hostId: 'local', workspaceId: 'w1' }
const open = vi.hoisted((): { handle: unknown } => ({ handle: null }))

vi.mock('sonner', () => ({ toast: { message: vi.fn(), error: vi.fn(), success: vi.fn() } }))
vi.mock('./research-figure-history', () => ({
  snapshotFigure: vi.fn(async () => null),
  restoreFigureText: vi.fn(async () => null)
}))
vi.mock('./research-figure-editor-handle', () => ({
  useFigureEditorHandle: { getState: () => ({ handle: open.handle }) }
}))
vi.mock('./research-figures-agent-session', () => ({ sendFigurePrompt: vi.fn(async () => null) }))

import { noteTypedFigureMessage } from './research-figure-agent-actions'
import { figureTurnEntry, useFigureTurn } from './research-figure-turn'
import { noteFigureAgentStatus } from './research-figure-turn-status'

describe('a message typed in a figure chat', () => {
  beforeEach(() => {
    useFigureTurn.setState({ figures: {}, workingSessions: {} })
    open.handle = { target, sceneText: () => SCENE }
  })

  it('starts its turn before the message goes out, so a quick agent cannot outrun it', () => {
    noteTypedFigureMessage(scope, 'chat-a', 'Relabel the renewal step')
    // A busy machine: the agent's whole turn lands before any later tick of the renderer.
    noteFigureAgentStatus('chat-a', { status: 'working', toolName: 'Edit', toolInput: 'x' })
    noteFigureAgentStatus('chat-a', { status: 'idle', turnOutcome: 'success' })
    const turn = figureTurnEntry(target)?.turn
    expect(turn?.phase).toBe('done')
    expect(turn?.beforeText).toBe(SCENE)
    expect(turn?.request).toBe('Relabel the renewal step')
  })

  it('leaves commands and empty messages untracked', () => {
    noteTypedFigureMessage(scope, 'chat-a', '/compact')
    noteTypedFigureMessage(scope, 'chat-a', '   ')
    expect(useFigureTurn.getState().figures).toEqual({})
  })
})
