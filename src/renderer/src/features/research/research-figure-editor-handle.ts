import { create } from 'zustand'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { FigureTarget } from './research-figures-export'

/** The open figure's canvas, for the agent pane beside it; the editor chunk registers it. */
export type FigureEditorHandle = {
  api: ExcalidrawImperativeAPI
  target: FigureTarget
  save: () => Promise<boolean>
  /** Writes the exports again from the file as last saved. */
  exportNow: () => Promise<void>
  /** A person is editing from outside the canvas (a side panel tab): their changes autosave. */
  noteUserInput: () => void
}

export const useFigureEditorHandle = create<{ handle: FigureEditorHandle | null }>(() => ({
  handle: null
}))
