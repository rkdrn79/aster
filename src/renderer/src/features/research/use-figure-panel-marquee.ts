import { useCallback, useEffect, useRef, useState } from 'react'
import { CaptureUpdateAction } from '@excalidraw/excalidraw'
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import {
  marqueeSelection,
  panelUnderPress,
  selectWhole,
  type MarqueeSelection
} from './research-figure-panel-marquee'
import type { SceneBox } from './ResearchFigureCanvasOverlays'

/** A press that moves less than this (screen px) is a click: it selects the panel. */
const CLICK_PX = 3

function toScene(clientX: number, clientY: number, state: AppState) {
  return {
    x: (clientX - state.offsetLeft) / state.zoom.value - state.scrollX,
    y: (clientY - state.offsetTop) / state.zoom.value - state.scrollY
  }
}

function current(state: AppState): MarqueeSelection {
  const pick = (ids: Readonly<Record<string, boolean>>) =>
    Object.fromEntries(Object.keys(ids).flatMap((id) => (ids[id] ? [[id, true] as const] : [])))
  return {
    selectedElementIds: pick(state.selectedElementIds),
    selectedGroupIds: pick(state.selectedGroupIds)
  }
}

/**
 * Background panels behave like Figma's frames: a drag that starts on a panel's empty middle
 * draws a selection box (Shift adds to the selection) instead of moving the panel; a click there
 * still selects it, and its outline or title still drags it. Excalidraw's own press never starts,
 * so the box is drawn here and the selection set through `updateScene`.
 */
export function useFigurePanelMarquee(
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>,
  focusCanvas: () => void
) {
  /** The selection box in the canvas's pixels while one is drawn. */
  const [box, setBox] = useState<SceneBox | null>(null)
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])

  const onPointerDownCapture = useCallback(
    (event: React.PointerEvent): boolean => {
      const api = apiRef.current
      if (
        !api ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        !(event.target instanceof HTMLCanvasElement)
      ) {
        return false
      }
      const state = api.getAppState()
      if (
        state.activeTool.type !== 'selection' ||
        state.editingTextElement ||
        state.editingLinearElement ||
        state.croppingElementId
      ) {
        return false
      }
      const elements = api.getSceneElements()
      const origin = toScene(event.clientX, event.clientY, state)
      const panel = panelUnderPress(elements, origin, {
        zoom: state.zoom.value,
        selectedElementIds: state.selectedElementIds,
        editingGroupId: state.editingGroupId
      })
      if (!panel) {
        return false
      }
      event.preventDefault()
      event.stopPropagation()
      const base = event.shiftKey ? current(state) : undefined
      const start = { x: event.clientX, y: event.clientY }
      let dragged = false
      let frame = 0
      const select = (selection: MarqueeSelection): void => {
        api.updateScene({
          appState: {
            ...selection,
            editingGroupId: state.editingGroupId,
            selectedLinearElement: null
          },
          captureUpdate: CaptureUpdateAction.NEVER
        })
      }
      const update = (clientX: number, clientY: number): void => {
        const live = api.getAppState()
        const a = toScene(start.x, start.y, live)
        const b = toScene(clientX, clientY, live)
        const scene = {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.abs(a.x - b.x),
          height: Math.abs(a.y - b.y)
        }
        setBox({
          x: Math.min(start.x, clientX) - live.offsetLeft,
          y: Math.min(start.y, clientY) - live.offsetTop,
          width: Math.abs(clientX - start.x),
          height: Math.abs(clientY - start.y)
        })
        select(marqueeSelection(api.getSceneElements(), scene, state.editingGroupId, base))
      }
      const onMove = (move: PointerEvent): void => {
        if (!dragged && Math.hypot(move.clientX - start.x, move.clientY - start.y) < CLICK_PX) {
          return
        }
        dragged = true
        window.cancelAnimationFrame(frame)
        frame = window.requestAnimationFrame(() => update(move.clientX, move.clientY))
      }
      const stop = (): void => {
        window.cancelAnimationFrame(frame)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
        cleanup.current = null
        setBox(null)
      }
      const onUp = (up: PointerEvent): void => {
        stop()
        if (dragged) {
          update(up.clientX, up.clientY)
          setBox(null)
        } else {
          select(selectWhole(api.getSceneElements(), [panel], state.editingGroupId, base))
        }
        focusCanvas()
      }
      const onCancel = (): void => stop()
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
      cleanup.current = stop
      return true
    },
    [apiRef, focusCanvas]
  )

  return { box, onPointerDownCapture }
}
