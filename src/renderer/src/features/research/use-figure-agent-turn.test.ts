// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { afterEach, describe, expect, it, vi } from 'vitest'

const settlers = vi.hoisted(
  (): { current: ((turn: unknown) => Promise<string | null>) | null } => ({
    current: null
  })
)
const sceneText = vi.hoisted(() => ({ current: '{"changed":true}' }))

vi.mock('./research-figure-turn', () => ({ noteFigureOpenedDuringTurn: vi.fn() }))
vi.mock('./research-figure-turn-settle', () => ({
  registerFigureTurnSettler: vi.fn(
    (_target: unknown, settle: (turn: unknown) => Promise<string | null>) => {
      settlers.current = settle
      return () => undefined
    }
  )
}))
vi.mock('./research-figures-export', () => ({ figureSceneText: () => sceneText.current }))
vi.mock('./research-figure-file-load', () => ({
  figureTextsDiffer: (a: string, b: string) => a !== b
}))

import { useFigureAgentTurn } from './use-figure-agent-turn'

const target = {
  owner: { hostId: 'local', workspaceId: 'w1', workspacePath: '/p' },
  folder: 'paper/figures',
  slug: 'overview'
}

function fakeApi(): ExcalidrawImperativeAPI {
  // Why empty: the settler only hands the canvas to figureSceneText, which is mocked above.
  return Object.create(null)
}

function setup() {
  const sync = {
    apiRef: { current: fakeApi() },
    check: vi.fn(async () => undefined),
    exportNow: vi.fn(async () => undefined),
    foldAgentTurn: vi.fn(() => true),
    initialText: null
  }
  renderHook(() => useFigureAgentTurn(target, sync))
  return sync
}

afterEach(() => {
  vi.clearAllMocks()
  settlers.current = null
  sceneText.current = '{"changed":true}'
})

describe('the end of a figure turn', () => {
  it('refreshes the exports when the turn changed the figure', async () => {
    const sync = setup()
    await expect(settlers.current?.({ beforeText: '{"before":true}' })).resolves.toBe(
      '{"changed":true}'
    )
    expect(sync.check).toHaveBeenCalledWith(true)
    expect(sync.foldAgentTurn).toHaveBeenCalledTimes(1)
    expect(sync.exportNow).toHaveBeenCalledTimes(1)
  })

  it('does not export when the turn changed nothing', async () => {
    sceneText.current = '{"before":true}'
    const sync = setup()
    await settlers.current?.({ beforeText: '{"before":true}' })
    expect(sync.exportNow).not.toHaveBeenCalled()
  })

  it('does not export for a turn with no "before send" version (a plot)', async () => {
    const sync = setup()
    await settlers.current?.({ beforeText: null })
    expect(sync.exportNow).not.toHaveBeenCalled()
  })
})
