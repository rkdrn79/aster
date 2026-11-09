import { Eye, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { undoFigureTurn } from './research-figure-agent-actions'
import { figureDiffCount, figureDiffText } from './research-figure-diff'
import {
  dismissFigureTurnBar,
  sameFigureTarget,
  setFigureTurnChangesShown,
  useFigureTurn
} from './research-figure-turn'
import type { FigureTarget } from './research-figures-export'

/**
 * Under the toolbar after an agent turn on this figure:
 * "Agent · <request> — N added · M changed · K removed [Show changes] [Undo turn] [×]".
 */
export function ResearchFigureTurnBar({
  target
}: {
  target: FigureTarget
}): React.JSX.Element | null {
  const turn = useFigureTurn((state) =>
    sameFigureTarget(state.turn?.target ?? null, target) ? state.turn : null
  )
  const dismissed = useFigureTurn((state) => state.barDismissed)
  const showChanges = useFigureTurn((state) => state.showChanges)
  if (!turn?.diff || dismissed || (turn.phase !== 'done' && turn.phase !== 'stopped')) {
    return null
  }
  const changed = figureDiffCount(turn.diff) > 0
  return (
    <div
      role="region"
      aria-label="Last agent turn"
      className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3 py-1 text-xs"
    >
      <span className="shrink-0 font-medium">
        Agent{turn.phase === 'stopped' ? ' (stopped)' : ''}
      </span>
      <span className="min-w-0 truncate text-muted-foreground" title={turn.request}>
        · {turn.request}
      </span>
      <span className="shrink-0 tabular-nums text-muted-foreground">
        — {figureDiffText(turn.diff)}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {changed ? (
          <>
            <Button
              size="xs"
              variant={showChanges ? 'secondary' : 'ghost'}
              aria-pressed={showChanges}
              onClick={() => setFigureTurnChangesShown(!showChanges)}
            >
              <Eye aria-hidden /> Show changes
            </Button>
            <Button
              size="xs"
              variant="ghost"
              disabled={turn.beforeText === null}
              title="Put the figure back as it was before this request"
              onClick={() => void undoFigureTurn()}
            >
              <Undo2 aria-hidden /> Undo turn
            </Button>
          </>
        ) : null}
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Close the turn summary"
          onClick={dismissFigureTurnBar}
        >
          <X aria-hidden />
        </Button>
      </span>
    </div>
  )
}
