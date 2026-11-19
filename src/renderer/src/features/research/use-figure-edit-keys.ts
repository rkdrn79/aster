import { useCallback } from 'react'
import { CaptureUpdateAction } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { FigureStyle } from '../../../../research-harness/research-figures-style.mjs'
import { isTypingTarget } from './use-figure-attachments'
import type { SettleScene } from './use-figure-inspector'
import { FIGURE_MOD_KEY, registerFigureCanvasShortcut } from './research-figure-shortcuts'
import { enterGroup, exitGroup } from './research-figure-depth'
import { toggleSelectionLock } from './research-figure-lock'
import { runSelectSame } from './research-figure-select-same'
import {
  FIGURE_TEXT_STEP_PT,
  figureTextTargets,
  withFigureTextStep
} from './research-figure-text-size'
import {
  copySelectionStyle,
  disarmPainter,
  pasteSelectionStyle,
  settledApply
} from './use-figure-painter'

const IS_MAC = FIGURE_MOD_KEY === 'Cmd'
const ALT = IS_MAC ? 'Option' : 'Alt'

// Why at import: the `?` help lists these beside the stage's other canvas keys.
for (const entry of [
  { label: 'Select same look (boxes, arrows or labels)', keys: [ALT, FIGURE_MOD_KEY, 'A'] },
  {
    label: `Text ${FIGURE_TEXT_STEP_PT} pt bigger / smaller`,
    keys: [FIGURE_MOD_KEY, 'Shift', '> / <']
  },
  { label: 'Copy style (box, line and label apart)', keys: [ALT, FIGURE_MOD_KEY, 'C'] },
  { label: 'Paste style onto the selection', keys: [ALT, FIGURE_MOD_KEY, 'V'] },
  { label: 'Lock or unlock (clicks pass through)', keys: [ALT, FIGURE_MOD_KEY, 'L'] },
  { label: 'Duplicate; again repeats the last move', keys: [FIGURE_MOD_KEY, 'D'] },
  { label: 'Select inside a group (deepest)', keys: [FIGURE_MOD_KEY, 'Click'] },
  { label: 'Into the selected group / out of it', keys: ['Enter', 'Shift+Enter'] },
  { label: 'Double-click: one level into a group', keys: ['Double-click'] }
]) {
  registerFigureCanvasShortcut(entry)
}

type KeyLike = Pick<KeyboardEvent, 'code' | 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>
export type FigureEditKey =
  | 'select-same'
  | 'bigger'
  | 'smaller'
  | 'copy-style'
  | 'paste-style'
  | 'lock'
  | 'duplicate'
  | 'enter-group'
  | 'exit-group'
  | 'escape'

function modHeld(event: KeyLike): boolean {
  return IS_MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
}

const ALT_CHORDS: Record<string, FigureEditKey> = {
  KeyA: 'select-same',
  KeyC: 'copy-style',
  KeyV: 'paste-style',
  KeyL: 'lock'
}

/**
 * The figure's editing keys: ⌥⌘A select same, ⌥⌘C / ⌥⌘V copy and paste style, ⌥⌘L lock,
 * ⌘⇧> / ⌘⇧< text by half a point, ⌘D duplicate, Enter / ⇧Enter into and out of a group.
 */
export function figureEditKey(event: KeyLike): FigureEditKey | null {
  if (!modHeld(event)) {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return null
    }
    if (event.key === 'Enter') {
      return event.shiftKey ? 'exit-group' : 'enter-group'
    }
    return event.key === 'Escape' ? 'escape' : null
  }
  if (event.altKey && !event.shiftKey) {
    return ALT_CHORDS[event.code] ?? null
  }
  if (event.shiftKey && !event.altKey) {
    return event.code === 'Period' ? 'bigger' : event.code === 'Comma' ? 'smaller' : null
  }
  return !event.altKey && !event.shiftKey && event.code === 'KeyD' ? 'duplicate' : null
}

/**
 * Canvas keys borrowed from Figma and PowerPoint. ⌘⇧> / ⌘⇧< replace Excalidraw's 10% steps,
 * which skip bound math and leave odd sizes (8.8 pt), with half-point steps over every label;
 * ⌥⌘C / ⌥⌘V replace its paste style, which takes the first element of a group (a label line).
 * `onDuplicate` hears ⌘D first and lets Excalidraw's own duplicate run.
 */
export function useFigureEditKeys(
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>,
  settleEdit: SettleScene,
  style: FigureStyle,
  onDuplicate: () => void
) {
  return useCallback(
    (event: React.KeyboardEvent): boolean => {
      const api = apiRef.current
      const key = figureEditKey(event)
      if (!api || !key || isTypingTarget(event.target)) {
        return false
      }
      const state = api.getAppState()
      if (key === 'escape') {
        // Why not stopped: Esc still clears the selection after the painter goes off.
        disarmPainter()
        return false
      }
      if (state.editingTextElement || state.activeTool.type !== 'selection') {
        return false
      }
      const elements = api.getSceneElementsIncludingDeleted()
      const selected = elements.filter(
        (element) => state.selectedElementIds[element.id] && !element.isDeleted
      )
      const stop = (): true => {
        event.preventDefault()
        event.stopPropagation()
        return true
      }
      if (key === 'exit-group') {
        const next = exitGroup(elements, state.editingGroupId)
        if (!next) {
          return false
        }
        api.updateScene({ appState: next, captureUpdate: CaptureUpdateAction.NEVER })
        return stop()
      }
      if (!selected.length) {
        return false
      }
      switch (key) {
        case 'duplicate':
          onDuplicate()
          return false
        case 'enter-group': {
          const next = enterGroup(selected, elements, state.editingGroupId)
          if (!next) {
            return false
          }
          api.updateScene({ appState: next, captureUpdate: CaptureUpdateAction.NEVER })
          return stop()
        }
        case 'select-same':
          runSelectSame(api, 'look', style)
          return stop()
        case 'copy-style':
          copySelectionStyle(api)
          return stop()
        case 'paste-style':
          pasteSelectionStyle(api, settledApply(api, settleEdit))
          return stop()
        case 'lock':
          toggleSelectionLock(api)
          return stop()
        case 'bigger':
        case 'smaller': {
          const targets = figureTextTargets(selected, elements)
          if (targets.length) {
            const step = key === 'bigger' ? FIGURE_TEXT_STEP_PT : -FIGURE_TEXT_STEP_PT
            api.updateScene({
              elements: settleEdit(
                withFigureTextStep(elements, targets, step),
                new Set(selected.map((element) => element.id))
              ),
              captureUpdate: CaptureUpdateAction.IMMEDIATELY
            })
          }
          return stop()
        }
      }
    },
    [apiRef, settleEdit, style, onDuplicate]
  )
}
