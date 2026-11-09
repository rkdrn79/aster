import { useEffect } from 'react'
import { registerFigureTurnSettler } from './research-figure-turn-settle'
import { figureSceneText, type FigureTarget } from './research-figures-export'
import type { FigureSync } from './use-figure-file-sync'

/**
 * Lets the open canvas end an agent turn on its figure: it catches up with the agent's last write,
 * folds the turn into one ⌘Z step, and hands back the scene the turn produced.
 */
export function useFigureAgentTurn(
  target: FigureTarget,
  sync: Pick<FigureSync, 'apiRef' | 'check' | 'foldAgentTurn'>
): void {
  const { apiRef, check, foldAgentTurn } = sync
  useEffect(
    () =>
      registerFigureTurnSettler(target, async () => {
        await check(true).catch(() => undefined)
        foldAgentTurn()
        const api = apiRef.current
        return api ? figureSceneText(api) : null
      }),
    [target, apiRef, check, foldAgentTurn]
  )
}
