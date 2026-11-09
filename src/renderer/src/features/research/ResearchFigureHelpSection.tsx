import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useFigureEditorHandle } from './research-figure-editor-handle'
import {
  FIGURE_PAGE_SHORTCUTS,
  useFigureCanvasHelp,
  type FigureHelpShortcut
} from './research-figure-shortcuts'

const NO_SUBSCRIPTION = (): (() => void) => () => undefined

function Island({
  title,
  entries
}: {
  title: string
  entries: readonly FigureHelpShortcut[]
}): React.JSX.Element {
  return (
    <div className="HelpDialog__island">
      <h4 className="HelpDialog__island-title">{title}</h4>
      <div className="HelpDialog__island-content">
        {entries.map((entry) => (
          <div key={entry.label} className="HelpDialog__shortcut">
            <div>{entry.label}</div>
            <div className="HelpDialog__key-container">
              {entry.keys.map((key) => (
                <kbd key={key} className="HelpDialog__key">
                  {key}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Excalidraw's rows for keys the figure canvas turns off (⌘Delete would also wipe the page). */
const BLOCKED_ROWS = new Set(['Reset the canvas'])

function hideBlockedExcalidrawRows(): void {
  for (const row of document.querySelectorAll<HTMLElement>(
    '.excalidraw-modal-container .HelpDialog__shortcut'
  )) {
    if (BLOCKED_ROWS.has(row.firstElementChild?.textContent?.trim() ?? '')) {
      row.hidden = true
    }
  }
}

/**
 * Adds an "Aster" section to Excalidraw's `?` help: the page's shortcuts and the canvas keys
 * Aster adds, in the dialog's own markup so it reads as one list.
 */
export function ResearchFigureHelpSection(): React.JSX.Element | null {
  const api = useFigureEditorHandle((state) => state.handle?.api ?? null)
  const canvas = useFigureCanvasHelp((state) => state.entries)
  const subscribe = useCallback(
    (onChange: () => void) => (api ? api.onChange(onChange) : NO_SUBSCRIPTION()),
    [api]
  )
  const helpOpen = useSyncExternalStore(
    subscribe,
    () => api?.getAppState().openDialog?.name === 'help'
  )
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!helpOpen) {
      return
    }
    let frame = 0
    let made: HTMLElement | null = null
    const attach = (): void => {
      const header = document.querySelector('.excalidraw-modal-container .HelpDialog__header')
      if (!header) {
        frame = window.requestAnimationFrame(attach)
        return
      }
      made = document.createElement('div')
      made.dataset.asterHelp = ''
      header.after(made)
      setHost(made)
      hideBlockedExcalidrawRows()
    }
    frame = window.requestAnimationFrame(attach)
    return () => {
      window.cancelAnimationFrame(frame)
      made?.remove()
      setHost(null)
    }
  }, [helpOpen])
  if (!host || !helpOpen) {
    return null
  }
  return createPortal(
    <>
      <h3>Aster</h3>
      <div className="HelpDialog__islands-container">
        <Island title="Figures page" entries={FIGURE_PAGE_SHORTCUTS} />
        <Island title="Canvas" entries={canvas} />
      </div>
    </>,
    host
  )
}
