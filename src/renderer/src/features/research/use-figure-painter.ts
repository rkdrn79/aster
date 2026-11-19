import { useCallback } from 'react'
import { CaptureUpdateAction } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { create } from 'zustand'
import { PAGE_FRAME_ID } from '../../../../research-harness/research-figures-model.mjs'
import { selectionUnits } from './research-figure-geometry-edit'
import {
  copyFigureStyle,
  describeStyleCopy,
  pasteFigureStyle,
  type FigureStyleCopy
} from './research-figure-paint-style'
import type { SettleScene } from './use-figure-inspector'

/** The copied style, and whether the painter is on: once (one click) or sticky (until Esc). */
export const useFigurePainter = create<{
  copy: FigureStyleCopy | null
  armed: 'once' | 'sticky' | null
  /** The selection the style came from, which a click does not paint onto itself. */
  sourceKey: string
}>(() => ({ copy: null, armed: null, sourceKey: '' }))

function selection(api: ExcalidrawImperativeAPI): {
  elements: readonly ExcalidrawElement[]
  selected: ExcalidrawElement[]
  key: string
} {
  const elements = api.getSceneElementsIncludingDeleted()
  const ids = api.getAppState().selectedElementIds
  const selected = elements.filter(
    (element) => ids[element.id] && !element.isDeleted && element.id !== PAGE_FRAME_ID
  )
  return { elements, selected, key: selected.map((element) => element.id).join(',') }
}

function toast(api: ExcalidrawImperativeAPI, message: string): void {
  api.setToast({ message, duration: 1600, closable: false })
}

/** ⌥⌘C: copies the selection's style by role and says what it holds. */
export function copySelectionStyle(api: ExcalidrawImperativeAPI): FigureStyleCopy | null {
  const { elements, selected, key } = selection(api)
  const copy = copyFigureStyle(selected, elements)
  if (!copy) {
    return null
  }
  useFigurePainter.setState({ copy, sourceKey: key })
  toast(api, `Style copied: ${describeStyleCopy(copy) || 'nothing to paint'}`)
  return copy
}

/** Applies an edited scene, settled, as one undo step (the Inspector's `commit` is one too). */
export type ApplyScene = (next: readonly ExcalidrawElement[]) => void

export function settledApply(api: ExcalidrawImperativeAPI, settleEdit: SettleScene): ApplyScene {
  return (next) => {
    const ids = api.getAppState().selectedElementIds
    api.updateScene({
      elements: settleEdit(next, new Set(Object.keys(ids).filter((id) => ids[id]))),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY
    })
  }
}

/** ⌥⌘V: pastes the copied style onto the selection by role, as one undo step. */
export function pasteSelectionStyle(api: ExcalidrawImperativeAPI, apply: ApplyScene): number {
  const { copy } = useFigurePainter.getState()
  const { elements, selected } = selection(api)
  if (!selected.length) {
    return 0
  }
  if (!copy) {
    toast(api, 'Copy a style first (⌥⌘C or the painter)')
    return 0
  }
  apply(pasteFigureStyle(elements, selected, copy))
  const count = selectionUnits(selected, elements).length
  toast(api, `Style pasted to ${count} ${count === 1 ? 'thing' : 'things'}`)
  return count
}

/**
 * PowerPoint's Format Painter: copies the selection's style, then paints whatever is clicked next
 * (`once`), or everything clicked until Esc (`sticky`, a double-click on the painter).
 */
export function armPainter(api: ExcalidrawImperativeAPI, mode: 'once' | 'sticky'): void {
  if (copySelectionStyle(api)) {
    useFigurePainter.setState({ armed: mode })
  }
}

export function disarmPainter(): boolean {
  const on = useFigurePainter.getState().armed !== null
  if (on) {
    useFigurePainter.setState({ armed: null })
  }
  return on
}

/** On pointer up over the canvas: paints the thing just clicked while the painter is on. */
export function useFigurePainterPointer(
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>,
  settleEdit: SettleScene
): () => void {
  return useCallback(() => {
    if (!useFigurePainter.getState().armed) {
      return
    }
    // Why a frame later: Excalidraw settles the clicked selection after its own pointer up.
    window.requestAnimationFrame(() => {
      const api = apiRef.current
      const { armed, sourceKey } = useFigurePainter.getState()
      if (!api || !armed) {
        return
      }
      const { key, selected } = selection(api)
      if (!selected.length || key === sourceKey) {
        return
      }
      pasteSelectionStyle(api, settledApply(api, settleEdit))
      useFigurePainter.setState(armed === 'once' ? { armed: null } : { sourceKey: key })
    })
  }, [apiRef, settleEdit])
}
