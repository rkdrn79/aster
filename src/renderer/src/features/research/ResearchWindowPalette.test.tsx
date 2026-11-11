// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/store', async () => {
  const { create } = await import('zustand')
  const useAppStore = create<{
    activeModal: string
    keybindings: undefined
    closeModal: () => void
  }>((set) => ({
    activeModal: 'none',
    keybindings: undefined,
    closeModal: () => set({ activeModal: 'none' })
  }))
  return { useAppStore }
})

vi.mock('./research-records-store', async () => {
  const { create } = await import('zustand')
  const experiment = (id: string, name: string, workspaceId: string, archived = false) => ({
    id,
    name,
    workspaceId,
    hostId: 'local',
    archived
  })
  return {
    useResearchRecords: create(() => ({
      document: {
        experiments: [
          experiment('e-1', 'Ablation study', 'wt-1'),
          experiment('e-2', 'Other project study', 'wt-2'),
          experiment('e-3', 'Archived study', 'wt-1', true)
        ]
      }
    }))
  }
})

const selectResearchExperimentRecord = vi.fn(async (_id: string) => undefined)
vi.mock('./research-experiment-select', () => ({
  selectResearchExperimentRecord: (id: string) => selectResearchExperimentRecord(id)
}))
vi.mock('@/lib/shortcut-platform', () => ({ getShortcutPlatform: () => 'darwin' }))

import { useAppStore } from '@/store'
import { ResearchWindowPalette } from './ResearchWindowPalette'

const onShowSection = vi.fn()
const onOpenInMain = vi.fn()

function renderPalette(): void {
  render(
    <ResearchWindowPalette
      workspaceId="wt-1"
      hostId="local"
      onShowSection={onShowSection}
      onOpenInMain={onOpenInMain}
    />
  )
}

function pressCmdK(target: EventTarget = window): void {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: true, bubbles: true })
    )
  })
}

beforeEach(() => {
  onShowSection.mockReset()
  onOpenInMain.mockReset()
  selectResearchExperimentRecord.mockClear()
  useAppStore.setState({ activeModal: 'none' })
  // cmdk measures with ResizeObserver and scrolls the active item into view.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  )
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ResearchWindowPalette', () => {
  it("opens on Cmd+K with this window's sections and its project's Experiments", () => {
    renderPalette()
    expect(screen.queryByText('Writing')).toBeNull()

    pressCmdK()

    expect(screen.getByText('Writing')).toBeTruthy()
    expect(screen.getByText('Ablation study')).toBeTruthy()
    expect(screen.queryByText('Other project study')).toBeNull()
    expect(screen.queryByText('Archived study')).toBeNull()
    fireEvent.click(screen.getByText('Figures'))
    expect(onShowSection).toHaveBeenCalledWith('research-figures')
  })

  it('opens an Experiment in the Experiments section', async () => {
    renderPalette()
    pressCmdK()

    await act(async () => {
      fireEvent.click(screen.getByText('Ablation study'))
    })

    expect(selectResearchExperimentRecord).toHaveBeenCalledWith('e-1')
    expect(onShowSection).toHaveBeenCalledWith('research-experiments')
  })

  it('leaves Cmd+K to a code editor that has focus', () => {
    renderPalette()
    const editor = document.createElement('div')
    editor.className = 'monaco-editor'
    document.body.append(editor)

    pressCmdK(editor)

    expect(screen.queryByText('Writing')).toBeNull()
    editor.remove()
  })

  it('opens when a page asks for the jump palette, and clears the request', () => {
    renderPalette()

    act(() => useAppStore.setState({ activeModal: 'worktree-palette' }))

    expect(screen.getByText('Open in main window')).toBeTruthy()
    expect(useAppStore.getState().activeModal).toBe('none')
    fireEvent.click(screen.getByText('Open in main window'))
    expect(onOpenInMain).toHaveBeenCalledOnce()
  })
})
