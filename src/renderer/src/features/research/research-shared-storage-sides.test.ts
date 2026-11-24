// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  claimEditorForWriting,
  releaseEditorToWorkbench,
  useResearchWritingEditors
} from './research-writing-editor-ownership'
import { ensureChatRecord, useChatPapers } from './research-chat-papers-store'

// A project side is a renderer of its own on the main window's storage: what it saves for its
// project must not wipe what the main window saved for the main project, nor the other way round.
describe('storage the main window and its sides share', () => {
  beforeEach(() => {
    localStorage.clear()
    useResearchWritingEditors.setState({ keys: [] })
    useChatPapers.setState({ v: 1, chats: {}, requests: {}, notices: {} })
  })

  it('keeps Writing editors another window claimed when this one claims or releases its own', () => {
    claimEditorForWriting('wt-main', 'main.tex')
    // The side saved its own project's editor since; this window's copy never saw it.
    const stored: unknown = JSON.parse(
      localStorage.getItem('aster.research.writingEditors') ?? '[]'
    )
    const sideKey = JSON.stringify(['wt-side', 'paper.tex'])
    localStorage.setItem(
      'aster.research.writingEditors',
      JSON.stringify([...(Array.isArray(stored) ? stored : []), sideKey])
    )

    claimEditorForWriting('wt-main', 'intro.tex')
    releaseEditorToWorkbench('wt-main', 'main.tex')

    expect(useResearchWritingEditors.getState().keys).toEqual([
      sideKey,
      JSON.stringify(['wt-main', 'intro.tex'])
    ])
  })

  it('keeps the chats another window watches when this one starts watching a chat', () => {
    ensureChatRecord('main-chat', 1_000)
    const saved = z
      .object({ chats: z.record(z.string(), z.unknown()) })
      .passthrough()
      .parse(JSON.parse(localStorage.getItem('aster.library.chatPapers.v1') ?? '{}'))
    const withSide = {
      ...saved,
      chats: { ...saved.chats, 'side-chat': { since: 0, touchedAt: 2_000, papers: {} } }
    }
    localStorage.setItem('aster.library.chatPapers.v1', JSON.stringify(withSide))

    ensureChatRecord('main-chat-2', 3_000)

    expect(Object.keys(useChatPapers.getState().chats).sort()).toEqual([
      'main-chat',
      'main-chat-2',
      'side-chat'
    ])
  })
})
