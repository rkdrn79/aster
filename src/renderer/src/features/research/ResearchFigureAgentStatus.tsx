import { Check, Loader2, RotateCcw, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { retryFigureTurn, stopFigureAgent, undoFigureTurn } from './research-figure-agent-actions'
import { figureDiffCount } from './research-figure-diff'
import {
  FIGURE_TURN_ACTIVE,
  dismissFigureTurnBar,
  figureTurnPhaseText,
  setFigureTurnChangesShown,
  useFigureTurnEntry
} from './research-figure-turn'
import type { FigureTarget } from './research-figures-export'

/**
 * The agent's progress on this figure, in the canvas's hint slot: Sending… → Reading… → Drawing ·
 * round 1 → Checking the preview · round 2/3 → Done · N changes [Show] [Undo], or Stopped [Retry].
 */
export function ResearchFigureAgentStatus({
  target
}: {
  target: FigureTarget
}): React.JSX.Element | null {
  const entry = useFigureTurnEntry(target)
  const turn = entry?.turn
  if (!turn) {
    return null
  }
  const { showChanges } = entry
  const active = FIGURE_TURN_ACTIVE.has(turn.phase)
  if (!active && entry.barDismissed) {
    return null
  }
  const changes = turn.diff ? figureDiffCount(turn.diff) : null
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Figure agent status"
      className={cn(
        'surface-floating absolute top-16 left-1/2 z-20 flex h-8 max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-lg pr-1 pl-3 text-xs',
        turn.phase === 'failed' && 'ring-1 ring-destructive/40'
      )}
    >
      {active ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
      ) : turn.phase === 'done' ? (
        <Check className="size-4 shrink-0 text-status-success" aria-hidden />
      ) : null}
      <span className={cn('min-w-0 truncate', active && 'text-shimmer')}>
        {figureTurnPhaseText(turn)}
        {turn.phase === 'done'
          ? changes === null
            ? ' · …'
            : ` · ${changes} change${changes === 1 ? '' : 's'}`
          : ''}
      </span>
      {active ? (
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Stop the agent"
          title="Stop the agent"
          onClick={() => stopFigureAgent()}
        >
          <Square className="fill-current" aria-hidden />
        </Button>
      ) : null}
      {turn.phase === 'done' && changes ? (
        <>
          <Button
            size="xs"
            variant={showChanges ? 'secondary' : 'ghost'}
            aria-pressed={showChanges}
            onClick={() => setFigureTurnChangesShown(target, !showChanges)}
          >
            Show
          </Button>
          <Button size="xs" variant="ghost" onClick={() => void undoFigureTurn(target)}>
            Undo
          </Button>
        </>
      ) : null}
      {turn.phase === 'stopped' || turn.phase === 'failed' ? (
        <Button size="xs" variant="ghost" onClick={() => void retryFigureTurn(target)}>
          <RotateCcw aria-hidden /> Retry
        </Button>
      ) : null}
      {active ? null : (
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Dismiss agent status"
          onClick={() => dismissFigureTurnBar(target)}
        >
          <X aria-hidden />
        </Button>
      )}
    </div>
  )
}
