/**
 * Commands the canvas's figure menu raises for features other parts of the page own (page size
 * and style, export, history). They listen with `onFigureCommand`; nothing listening is fine.
 */
export type FigureCommand = 'page-size' | 'style' | 'export' | 'history' | 'insert-parts'

const EVENT = 'aster:figure-command'

export function figureCommand(command: FigureCommand): void {
  window.dispatchEvent(new CustomEvent<FigureCommand>(EVENT, { detail: command }))
}

export function onFigureCommand(handler: (command: FigureCommand) => void): () => void {
  const listener = (event: Event): void => {
    if (event instanceof CustomEvent && typeof event.detail === 'string') {
      const command = COMMANDS.find((entry) => entry === event.detail)
      if (command) {
        handler(command)
      }
    }
  }
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}

const COMMANDS: readonly FigureCommand[] = [
  'page-size',
  'style',
  'export',
  'history',
  'insert-parts'
]
