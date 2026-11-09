import { useEffect } from 'react'
import { figureTextsDiffer } from './research-figure-file-load'
import { noteFigureOpenedDuringTurn } from './research-figure-turn'
import { registerFigureTurnSettler } from './research-figure-turn-settle'
import { figureSceneText, type FigureTarget } from './research-figures-export'
import type { FigureSync } from './use-figure-file-sync'

/**
 * Lets the open canvas end an agent turn on its figure: it catches up with the agent's last write,
 * folds the turn into one ⌘Z step, and hands back the scene the turn produced.
 */
export function useFigureAgentTurn(
  target: FigureTarget,
  sync: Pick<FigureSync, 'apiRef' | 'check' | 'exportNow' | 'foldAgentTurn' | 'initialText'>
): void {
  const { apiRef, check, exportNow, foldAgentTurn, initialText } = sync
  useEffect(() => {
    if (initialText !== null) {
      noteFigureOpenedDuringTurn(target, initialText)
    }
  }, [target, initialText])
  useEffect(
    () =>
      registerFigureTurnSettler(target, async (turn) => {
        await check(true).catch(() => undefined)
        foldAgentTurn()
        const api = apiRef.current
        if (!api) {
          return null
        }
        const scene = figureSceneText(api)
        // Why: when the turn's only write was merged, the canvas equals the file, so no autosave
        // would write the exports that write made stale.
        if (turn.beforeText !== null && figureTextsDiffer(turn.beforeText, scene)) {
          void exportNow()
        }
        return scene
      }),
    [target, apiRef, check, exportNow, foldAgentTurn]
  )
}
