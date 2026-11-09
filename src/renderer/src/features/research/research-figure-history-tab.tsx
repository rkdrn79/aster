import { useEffect } from 'react'
import { addAppKeyListener, removeAppKeyListener } from '@/lib/app-keyboard-router'
import { ResearchFigureHistoryPanel } from './ResearchFigureHistoryPanel'
import { onFigureCommand } from './research-figure-commands'
import { openFigureSidePanelTab, registerFigureSidePanelTab } from './research-figure-side-panel'
import {
  FIGURE_MOD_KEY,
  figurePageKeyEvent,
  isFigureChord,
  registerFigureCanvasShortcut
} from './research-figure-shortcuts'
import { openFiguresSidePanel } from './research-figures-layout-mode'

const HISTORY_TAB_ID = 'history'

// Why at import: the Figures page imports this module once to add the History tab.
registerFigureSidePanelTab({
  id: HISTORY_TAB_ID,
  label: 'History',
  order: 20,
  render: () => <ResearchFigureHistoryPanel />
})
registerFigureCanvasShortcut({ label: 'History', keys: [FIGURE_MOD_KEY, 'Shift', 'H'] })

/** Shows the History tab, opening the side panel if it is closed. */
export function showFigureHistory(): void {
  openFigureSidePanelTab(HISTORY_TAB_ID)
  openFiguresSidePanel()
}

/**
 * ⌘⇧H (Ctrl+Shift+H) and the canvas's figure menu show History; the only owner of that chord on
 * the Figures page.
 */
export function useFigureHistoryShortcut(): void {
  useEffect(() => onFigureCommand((command) => command === 'history' && showFigureHistory()), [])
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => {
      if (!isFigureChord(event, 'KeyH', true) || !figurePageKeyEvent(event)) {
        return
      }
      // Why stop here: Excalidraw reads Shift+H as "flip horizontal" whatever the modifier.
      event.preventDefault()
      event.stopPropagation()
      showFigureHistory()
    }
    addAppKeyListener('keydown', listener)
    return () => removeAppKeyListener('keydown', listener)
  }, [])
}
