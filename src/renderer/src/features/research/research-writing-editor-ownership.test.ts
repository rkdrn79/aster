import { beforeEach, describe, expect, it } from 'vitest'
import { createEditorTabsStore } from '@/store/slices/editor-slice-test-harness'
import {
  openEditorForWriting,
  researchWritingEditorTabIds,
  useResearchWritingEditors
} from './research-writing-editor-ownership'

const MAIN_TEX = {
  filePath: '/repo/paper/main.tex',
  relativePath: 'paper/main.tex',
  worktreeId: 'wt-1',
  language: 'latex',
  mode: 'edit' as const
}

describe('Writing editor ownership', () => {
  beforeEach(() => useResearchWritingEditors.setState({ keys: [] }))

  it('keeps Writing files out of the Workbench until another surface opens them', () => {
    const store = createEditorTabsStore()
    const tabs = () => store.getState().unifiedTabsByWorktree['wt-1'] ?? []
    const writingTabIds = () =>
      researchWritingEditorTabIds(tabs(), useResearchWritingEditors.getState().keys)
    const openForWriting = () =>
      openEditorForWriting(tabs(), 'wt-1', () =>
        store.getState().openFile(MAIN_TEX, { preview: false, selection: 'none' })
      )

    openForWriting()
    const [tab] = tabs()
    expect(writingTabIds()).toEqual([tab.id])
    openForWriting()
    expect(writingTabIds()).toEqual([tab.id])

    store.getState().openFile(MAIN_TEX)
    expect(tabs().map((entry) => entry.id)).toEqual([tab.id])
    expect(writingTabIds()).toEqual([])

    // A file the Workbench already shows stays a Workbench tab when Writing opens it.
    openForWriting()
    expect(writingTabIds()).toEqual([])
  })
})
