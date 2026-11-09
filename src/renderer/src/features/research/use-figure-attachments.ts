import { useCallback, useEffect, useRef } from 'react'
import { CaptureUpdateAction, newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import {
  FIGURE_UNITS_PER_POINT,
  PAGE_FRAME_ID
} from '../../../../research-harness/research-figures-model.mjs'
import { settleFigure, type SettleOptions } from './research-figure-settle'
import {
  baselineSettled,
  commitSettled,
  createSettleMemory,
  rebaselineSettled,
  type SettleMemory
} from './research-figure-settle-state'
import { figureSceneReplacing, onFigureSceneReplaced } from './research-figure-scene-replace'
import { withSettleUpdates } from './research-figure-scene-updates'

const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1]
}

/**
 * True while a gesture or an edit is under way (a drag, a resize, typing, drawing): what settling
 * changes then belongs to that edit's undo step, which Excalidraw records when it ends.
 */
function editUnderWay(appState: AppState): boolean {
  return Boolean(
    appState.selectedElementsAreBeingDragged ||
    appState.isResizing ||
    appState.isRotating ||
    appState.editingTextElement ||
    appState.newElement ||
    appState.multiElement ||
    appState.selectionElement
  )
}

function optionsOf(appState: AppState): SettleOptions {
  const selected = new Set(
    Object.keys(appState.selectedElementIds).filter((id) => appState.selectedElementIds[id])
  )
  return { resizing: appState.isResizing, selected }
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')
  )
}

/**
 * Keeps an agent's figure whole while a person edits it (see `settleFigure`): runs after every
 * canvas change and once more on pointer up, so a drag and what follows it are one undo step.
 */
export function useFigureAttachments(apiRef: React.RefObject<ExcalidrawImperativeAPI | null>) {
  const memoryRef = useRef<SettleMemory>(createSettleMemory())
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const pointerDownRef = useRef(false)
  useEffect(() => () => unsubscribeRef.current?.(), [])

  const settle = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, recordsNext = false) => {
      const api = apiRef.current
      const memory = memoryRef.current
      // Why: an agent's write (or a restore) is taken as it is; `rebaseline` follows it.
      if (!api || figureSceneReplacing(api)) {
        return
      }
      if (!memory.seen.size) {
        baselineSettled(memory, elements)
        return
      }
      const updates = settleFigure(elements, memory, optionsOf(appState))
      if (!updates.size) {
        commitSettled(memory, elements)
        return
      }
      const next = withSettleUpdates(elements, updates)
      commitSettled(memory, next)
      // Why EVENTUALLY during an edit: it is not recorded yet (a drag records on pointer up), so
      // both land in one undo step. Why NEVER after one (an undo, a key, an Inspector edit):
      // Excalidraw leaves an EVENTUALLY change pending until its own next record, and until then
      // drops these elements from every undo step `updateScene` records (a style, a role).
      const during = recordsNext || pointerDownRef.current || editUnderWay(appState)
      api.updateScene({
        elements: next,
        captureUpdate: during ? CaptureUpdateAction.EVENTUALLY : CaptureUpdateAction.NEVER
      })
    },
    [apiRef]
  )

  /** The scene was replaced from disk: what is there now is where everything belongs. */
  const rebaseline = useCallback((api: ExcalidrawImperativeAPI) => {
    rebaselineSettled(memoryRef.current, api.getSceneElementsIncludingDeleted())
  }, [])

  const attachSettling = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      unsubscribeRef.current?.()
      const offPointerDown = api.onPointerDown(() => {
        pointerDownRef.current = true
      })
      // Why pointer up: Excalidraw fires it before it records the gesture for undo.
      const offPointerUp = api.onPointerUp(() => {
        pointerDownRef.current = false
        settle(api.getSceneElementsIncludingDeleted(), api.getAppState(), true)
      })
      // Why: an agent turn folded into one undo step, or a restored version, is not re-settled.
      const offReplaced = onFigureSceneReplaced(api, () => rebaseline(api))
      unsubscribeRef.current = () => {
        offPointerDown()
        offPointerUp()
        offReplaced()
      }
    },
    [settle, rebaseline]
  )

  /** Settles a scene an edit proposes, before it is applied, so both are one undo step. */
  const settleEdit = useCallback(
    (elements: readonly ExcalidrawElement[], selected: ReadonlySet<string> = new Set()) => {
      const memory = memoryRef.current
      const next = withSettleUpdates(elements, settleFigure(elements, memory, { selected }))
      commitSettled(memory, next)
      return next
    },
    []
  )

  /** Arrow keys move the selection 1 pt (Shift: 8 pt), followers and connectors in one step. */
  const nudge = useCallback(
    (event: React.KeyboardEvent): boolean => {
      const api = apiRef.current
      const step = NUDGE[event.key]
      if (!api || !step || event.metaKey || event.ctrlKey || event.altKey) {
        return false
      }
      const appState = api.getAppState()
      if (
        isTypingTarget(event.target) ||
        appState.editingTextElement ||
        appState.editingLinearElement ||
        appState.croppingElementId
      ) {
        return false
      }
      const elements = api.getSceneElementsIncludingDeleted()
      const selected = elements.filter(
        (element) =>
          appState.selectedElementIds[element.id] &&
          !element.isDeleted &&
          !element.locked &&
          element.id !== PAGE_FRAME_ID
      )
      if (!selected.length || selected.some((element) => element.type === 'frame')) {
        return false
      }
      const unit = (event.shiftKey ? 8 : 1) * FIGURE_UNITS_PER_POINT
      const ids = new Set(selected.map((element) => element.id))
      const moved = elements.map((element) =>
        ids.has(element.id)
          ? newElementWith(element, {
              x: element.x + step[0] * unit,
              y: element.y + step[1] * unit
            })
          : element
      )
      api.updateScene({
        elements: settleEdit(moved, ids),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY
      })
      event.preventDefault()
      event.stopPropagation()
      return true
    },
    [apiRef, settleEdit]
  )

  return { settle, settleEdit, attachSettling, rebaseline, nudge }
}
