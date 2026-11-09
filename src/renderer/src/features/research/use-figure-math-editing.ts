import { useCallback, useState } from 'react'
import { getCommonBounds } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { PAGE_FRAME_ID, figurePage } from '../../../../research-harness/research-figures-model.mjs'
import { LOSS_COLOR, figureStyle } from '../../../../research-harness/research-figures-style.mjs'
import { isAsterMathImage } from './research-figure-element-meta'
import { DEFAULT_MATH_SIZE, texFromDollars, typesetFigureMath } from './research-figure-math'
import {
  applyFigureMath,
  insertFigureMath,
  readMathOf,
  typesetTextAsMath,
  type FigureMath,
  type SettleEdit
} from './research-figure-math-scene'
import type { MathInk, MathPreview } from './ResearchFigureMathPopover'
import type { SceneBox } from './ResearchFigureCanvasOverlays'
import { isTypingTarget } from './use-figure-attachments'

type MathTarget = { kind: 'edit'; imageId: string } | { kind: 'new'; x: number; baseline: number }
export type OpenMath = {
  key: string
  target: MathTarget
  initial: FigureMath
  preview: MathPreview | string
  /** Scene box the popover opens under. */
  near: SceneBox
  inks: MathInk[]
}

/** The paper inks a math label may take: ink, line, muted, the accent and loss red. */
export function figureInks(elements: readonly ExcalidrawElement[]): MathInk[] {
  const page = figurePage(elements)
  const style = figureStyle(page?.style, page?.accent)
  return [
    { name: 'Ink', color: style.ink },
    { name: 'Line', color: style.line },
    { name: 'Muted', color: style.muted },
    { name: `Accent (${style.accentName})`, color: style.accentColor.stroke },
    { name: 'Loss', color: LOSS_COLOR.stroke }
  ]
}

function selectedElements(api: ExcalidrawImperativeAPI): ExcalidrawElement[] {
  const ids = api.getAppState().selectedElementIds
  return api.getSceneElements().filter((element) => ids[element.id] && element.id !== PAGE_FRAME_ID)
}

/** The topmost element under a point, if it is a math image. */
function mathImageAt(api: ExcalidrawImperativeAPI, x: number, y: number): string | null {
  const hit = api
    .getSceneElements()
    .toReversed()
    .find(
      (element) =>
        element.type !== 'frame' &&
        x >= element.x &&
        x <= element.x + element.width &&
        y >= element.y &&
        y <= element.y + element.height
    )
  return hit && isAsterMathImage(hit) ? hit.id : null
}

/**
 * Editing math by hand: double-click or Enter on a math label opens its TeX; Σ or M starts a new
 * one; text with `$…$` can be typeset in place. Each apply is one undo step.
 */
export function useFigureMathEditing(
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>,
  settleEdit: SettleEdit,
  focusCanvas: () => void
) {
  const [open, setOpen] = useState<OpenMath | null>(null)
  // Why focus: Excalidraw hears keys (⌘Z, Delete) only while its container has focus.
  const close = useCallback(() => {
    setOpen(null)
    window.requestAnimationFrame(focusCanvas)
  }, [focusCanvas])

  const show = useCallback(
    async (target: MathTarget, initial: FigureMath, near: SceneBox) => {
      const inks = figureInks(apiRef.current?.getSceneElements() ?? [])
      const preview = initial.tex.trim()
        ? await typesetFigureMath(initial.tex, initial.size, initial.color).catch(
            (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))
          )
        : ''
      const key = target.kind === 'edit' ? target.imageId : `new-${Date.now()}`
      setOpen({ key, target, initial, preview, near, inks })
    },
    [apiRef]
  )

  const editMath = useCallback(
    async (imageId: string) => {
      const api = apiRef.current
      const image = api?.getSceneElements().find((element) => element.id === imageId)
      const math = api && image?.type === 'image' ? await readMathOf(api, image) : null
      if (image && math) {
        await show({ kind: 'edit', imageId }, math, image)
      }
    },
    [apiRef, show]
  )

  const newMath = useCallback(async () => {
    const api = apiRef.current
    if (!api) {
      return
    }
    const elements = api.getSceneElements()
    const selected = selectedElements(api)
    const page = figurePage(elements)
    let at = page
      ? { x: page.x + page.width / 2 - 8, baseline: page.y + page.height / 2 }
      : { x: 0, baseline: 0 }
    if (selected.length) {
      const [, minY, maxX, maxY] = getCommonBounds(selected)
      at = { x: maxX + 12, baseline: (minY + maxY) / 2 + 4 }
    }
    const ink = figureInks(elements)[0].color
    await show(
      { kind: 'new', ...at },
      { tex: '', size: DEFAULT_MATH_SIZE, color: ink },
      { x: at.x, y: at.baseline - 12, width: 16, height: 16 }
    )
  }, [apiRef, show])

  const apply = useCallback(
    async (math: FigureMath) => {
      const api = apiRef.current
      if (!api || !open) {
        return
      }
      await (open.target.kind === 'edit'
        ? applyFigureMath(api, open.target.imageId, math, settleEdit)
        : insertFigureMath(api, open.target, math, settleEdit))
      close()
    },
    [apiRef, open, settleEdit, close]
  )

  const typesetSelectedText = useCallback(async () => {
    const api = apiRef.current
    const [text] = api ? selectedElements(api) : []
    const tex = text?.type === 'text' ? texFromDollars(text.text) : null
    if (api && text?.type === 'text' && tex) {
      await typesetTextAsMath(api, text, tex, settleEdit)
      focusCanvas()
    }
  }, [apiRef, settleEdit, focusCanvas])

  /** Enter on a lone math label edits it; M (or Σ) starts new math. */
  const onKey = useCallback(
    (event: React.KeyboardEvent): boolean => {
      const api = apiRef.current
      if (!api || isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
        return false
      }
      const state = api.getAppState()
      if (state.editingTextElement || state.activeTool.type !== 'selection') {
        return false
      }
      const selected = selectedElements(api)
      if (event.key === 'Enter' && selected.length === 1 && isAsterMathImage(selected[0])) {
        event.preventDefault()
        event.stopPropagation()
        void editMath(selected[0].id)
        return true
      }
      if ((event.key === 'm' || event.key === 'M') && !event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        void newMath()
        return true
      }
      return false
    },
    [apiRef, editMath, newMath]
  )

  /** Double-click on a math label opens its TeX instead of entering its group. */
  const onDoubleClick = useCallback(
    (event: React.MouseEvent): boolean => {
      const api = apiRef.current
      if (!api) {
        return false
      }
      const state = api.getAppState()
      const x = (event.clientX - state.offsetLeft) / state.zoom.value - state.scrollX
      const y = (event.clientY - state.offsetTop) / state.zoom.value - state.scrollY
      const imageId = mathImageAt(api, x, y)
      if (!imageId) {
        return false
      }
      event.preventDefault()
      event.stopPropagation()
      void editMath(imageId)
      return true
    },
    [apiRef, editMath]
  )

  return {
    open,
    apply,
    cancel: close,
    newMath,
    typesetSelectedText,
    onKey,
    onDoubleClick
  }
}
