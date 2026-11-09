import { CircleCheck, Loader2, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  REBUTTAL_TURN_ACTIVE,
  rebuttalTurnPhaseText,
  useRebuttalTurns,
  type RebuttalActor
} from './research-rebuttal-turns'

/** One agent's current request and how far it is, next to the page's actions. */
export function ResearchRebuttalTurnChips({
  actor
}: {
  actor: RebuttalActor
}): React.JSX.Element | null {
  const turn = useRebuttalTurns((state) => state.turns[actor])
  if (!turn || (!REBUTTAL_TURN_ACTIVE.has(turn.phase) && turn.phase !== 'failed')) {
    return null
  }
  const name = actor === 'author' ? 'Rebuttal agent' : `Simulated ${actor.slice(9)}`
  const failed = turn.phase === 'failed'
  return (
    <span
      role="status"
      title={`${name}: ${turn.request}`}
      className={cn(
        'inline-flex max-w-52 items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground',
        failed && 'text-destructive'
      )}
    >
      {turn.phase === 'waiting' ? (
        <TriangleAlert className="size-3 shrink-0 text-status-warning" aria-hidden />
      ) : failed ? (
        <TriangleAlert className="size-3 shrink-0" aria-hidden />
      ) : turn.phase === 'done' ? (
        <CircleCheck className="size-3 shrink-0" aria-hidden />
      ) : (
        <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
      )}
      <span className="truncate">
        {name}: {rebuttalTurnPhaseText(turn)}
      </span>
    </span>
  )
}
