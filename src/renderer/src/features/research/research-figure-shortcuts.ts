import { useEffect } from 'react'
import { create } from 'zustand'
import { addAppKeyListener, removeAppKeyListener } from '@/lib/app-keyboard-router'
import { useAppStore } from '@/store'

/** Commands the page sends to the open figure's toolbar, which owns those controls. */
export type FigureToolbarCommand = 'ask' | 'generate' | 'export' | 'paper'
// Why no 'history': ⌘⇧H belongs to the History tab (research-figure-history-tab.tsx).
export type FigureShortcut = FigureToolbarCommand | 'side' | 'focus'

export const useFigureToolbarCommand = create<{
  seq: number
  command: FigureToolbarCommand | null
}>(() => ({ seq: 0, command: null }))

export function sendFigureToolbarCommand(command: FigureToolbarCommand): void {
  useFigureToolbarCommand.setState((state) => ({ seq: state.seq + 1, command }))
}

type KeyLike = Pick<KeyboardEvent, 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>

const SHIFTED: Record<string, FigureShortcut> = {
  KeyG: 'generate',
  KeyE: 'export',
  KeyL: 'paper'
}
const PLAIN: Record<string, FigureShortcut> = {
  KeyK: 'ask',
  Backslash: 'side',
  Period: 'focus'
}

/** ⌘ on a Mac, Ctrl elsewhere, without the other one or Alt. */
function figureModifierHeld(event: KeyLike, isMac: boolean): boolean {
  const mod = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  return mod && !event.altKey
}

/** The Figures page's own chords: ⌘K, ⌘⇧G, ⌘⇧E, ⌘⇧L, ⌘\ and ⌘. (Ctrl elsewhere). */
export function figureShortcutFor(event: KeyLike, isMac: boolean): FigureShortcut | null {
  if (!figureModifierHeld(event, isMac)) {
    return null
  }
  return (event.shiftKey ? SHIFTED[event.code] : PLAIN[event.code]) ?? null
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
export const FIGURE_MOD_KEY = IS_MAC ? 'Cmd' : 'Ctrl'
const MOD = FIGURE_MOD_KEY

/** Whether the event is ⌘(+⇧)+`code` on a Mac, Ctrl(+Shift)+`code` elsewhere. */
export function isFigureChord(event: KeyLike, code: string, shift: boolean): boolean {
  return figureModifierHeld(event, IS_MAC) && event.shiftKey === shift && event.code === code
}

export type FigureHelpShortcut = { label: string; keys: readonly string[] }

/** The page's shortcuts as the help dialog lists them. */
export const FIGURE_PAGE_SHORTCUTS: readonly FigureHelpShortcut[] = [
  { label: 'Ask about the selection', keys: [MOD, 'K'] },
  { label: 'Generate in an area', keys: [MOD, 'Shift', 'G'] },
  { label: 'Export', keys: [MOD, 'Shift', 'E'] },
  { label: 'Use in paper', keys: [MOD, 'Shift', 'L'] },
  { label: 'Show or hide the side panel', keys: [MOD, '\\'] },
  { label: 'Focus mode', keys: [MOD, '.'] }
]

/** Canvas keys Aster adds on top of Excalidraw's; the canvas track registers its own here. */
export const useFigureCanvasHelp = create<{ entries: readonly FigureHelpShortcut[] }>(() => ({
  entries: [
    { label: 'Fit the page in view', keys: ['Shift', '1'] },
    { label: 'Fit the selection in view', keys: ['Shift', '2'] },
    { label: 'Save and export', keys: [MOD, 'S'] }
  ]
}))

export function registerFigureCanvasShortcut(entry: FigureHelpShortcut): void {
  useFigureCanvasHelp.setState((state) => ({
    entries: [...state.entries.filter((known) => known.label !== entry.label), entry]
  }))
}

function dialogOpen(): boolean {
  return Boolean(document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"]'))
}

/** A real key press on the Figures page with no dialog over it: page chords may act on it. */
export function figurePageKeyEvent(event: KeyboardEvent): boolean {
  if (!event.isTrusted || event.repeat || event.isComposing || event.defaultPrevented) {
    return false
  }
  return useAppStore.getState().activeView === 'research-figures' && !dialogOpen()
}

/**
 * Runs the page's chords while the Figures page is on screen. ⌘K asks about the canvas
 * selection when the canvas has focus and something is selected; otherwise it stays the jump
 * palette's. Synthetic key events (the Arrange menu replays Excalidraw's own) pass through.
 */
export function useFigureShortcuts(handlers: {
  run: (shortcut: FigureShortcut) => void
  canvasSelection: () => number
}): void {
  const { run, canvasSelection } = handlers
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!figurePageKeyEvent(event)) {
        return
      }
      const shortcut = figureShortcutFor(event, IS_MAC)
      if (!shortcut) {
        return
      }
      const target = event.target instanceof Element ? event.target : null
      if (shortcut === 'ask') {
        if (!target?.closest('[data-research-figure-canvas]')) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        if (canvasSelection() > 0) {
          run('ask')
        } else {
          useAppStore.getState().openModal('worktree-palette')
        }
        return
      }
      event.preventDefault()
      event.stopPropagation()
      run(shortcut)
    }
    addAppKeyListener('keydown', onKeyDown)
    return () => removeAppKeyListener('keydown', onKeyDown)
  }, [run, canvasSelection])
}
