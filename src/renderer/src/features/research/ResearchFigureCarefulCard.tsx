import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ResearchChip } from './research-chip'
import { carefulPhase, type CarefulReview } from './research-figure-careful'
import type { FigureSketchPick } from './research-figure-modes'
import type { CarefulState } from './use-figure-careful'

function Fixes({ review }: { review: CarefulReview }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
        <span>Round {review.round} · the art director&rsquo;s fixes</span>
        <span
          className={cn(
            'rounded-md px-1.5 py-px font-medium',
            review.verdict === 'ship' ? 'bg-raised text-foreground' : 'bg-background'
          )}
        >
          {review.verdict === 'ship' ? 'Ship' : 'Revise'}
        </span>
      </div>
      {review.fixes.length ? (
        <ol className="flex list-decimal flex-col gap-0.5 pl-4 text-xs leading-snug text-foreground">
          {review.fixes.map((fix, index) => (
            <li key={`${String(index)}-${fix}`}>{fix}</li>
          ))}
        </ol>
      ) : (
        <p className="text-2xs text-muted-foreground">No fixes listed.</p>
      )}
    </div>
  )
}

/** Round k of N as N short bars: done rounds filled, the current one outlined. */
function RoundBars({ done, rounds }: { done: number; rounds: number }): React.JSX.Element {
  return (
    <div className="flex gap-1" aria-hidden>
      {Array.from({ length: rounds }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-1 flex-1 rounded-sm',
            index < done
              ? 'bg-foreground/70'
              : index === done
                ? 'bg-foreground/25'
                : 'bg-foreground/10'
          )}
        />
      ))}
    </div>
  )
}

/**
 * Careful drawing as it goes, above the Figure chat: the sketches with thumbnails (the person picks
 * one here when they chose to), the chosen one, round k of N and the art director's fixes.
 */
export function ResearchFigureCarefulCard({
  state,
  pick,
  onPick
}: {
  state: CarefulState
  pick: FigureSketchPick
  /** Tells the Figure agent which sketch the person picked; resolves to an error or null. */
  onPick: ((name: string) => Promise<string | null>) | null
}): React.JSX.Element | null {
  const [picking, setPicking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { record, critic, sketches } = state
  if (!record) {
    return null
  }
  const notes = new Map(record.sketches.map((sketch) => [sketch.name, sketch.note]))
  const latest = record.reviews.at(-1) ?? null
  const earlier = record.reviews.slice(0, -1).toReversed()
  const canPick = pick === 'person' && !record.chose && onPick !== null && sketches.length > 1

  return (
    <section
      aria-label="Careful drawing progress"
      data-figure-careful-card=""
      className="mx-3 mt-2 flex flex-col gap-2.5 rounded-lg bg-muted/50 p-2.5 text-xs"
    >
      <header className="flex items-baseline justify-between gap-2">
        <span role="status" className="font-medium text-foreground">
          {carefulPhase(record, pick)}
        </span>
        <span className="truncate text-2xs text-muted-foreground">
          {critic
            ? `Art director: ${critic.agent || 'agent'} chat`
            : 'Art director starts at the first review'}
        </span>
      </header>
      {record.chose ? <RoundBars done={record.reviews.length} rounds={record.rounds} /> : null}
      {sketches.length ? (
        <ul aria-label="Sketches" className="grid grid-cols-4 gap-1.5">
          {sketches.map((sketch) => {
            const chosen = record.chose?.name === sketch.name
            return (
              <li key={sketch.name} className="flex min-w-0 flex-col gap-1">
                <div
                  title={notes.get(sketch.name) ?? sketch.name}
                  className={cn(
                    'flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-background',
                    chosen && 'ring-2 ring-foreground/60',
                    record.chose && !chosen && 'opacity-55'
                  )}
                >
                  {sketch.url ? (
                    <img
                      src={sketch.url}
                      alt={`Sketch ${sketch.name}`}
                      className="max-h-full max-w-full"
                    />
                  ) : null}
                </div>
                <span className="truncate text-2xs text-muted-foreground">
                  {sketch.name}
                  {notes.get(sketch.name) ? ` · ${notes.get(sketch.name) ?? ''}` : ''}
                </span>
                {canPick ? (
                  <ResearchChip
                    className="h-6 px-2"
                    disabled={picking !== null}
                    aria-label={`Use sketch ${sketch.name}`}
                    onClick={() => {
                      setPicking(sketch.name)
                      setError(null)
                      void onPick(sketch.name).then((failure) => {
                        setPicking(null)
                        setError(failure)
                      })
                    }}
                  >
                    {picking === sketch.name ? 'Sending…' : 'Use'}
                  </ResearchChip>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      {record.chose ? (
        <p className="text-2xs leading-snug text-muted-foreground">
          Chose {record.chose.name}
          {record.chose.by === 'person' ? ' (you picked it)' : ''}
          {record.chose.why ? `: ${record.chose.why}` : ''}
        </p>
      ) : null}
      {latest ? <Fixes review={latest} /> : null}
      {earlier.length ? (
        <details className="text-2xs text-muted-foreground">
          <summary className="cursor-pointer select-none">
            Earlier rounds ({earlier.length})
          </summary>
          <div className="mt-1.5 flex flex-col gap-2">
            {earlier.map((review) => (
              <Fixes key={review.round} review={review} />
            ))}
          </div>
        </details>
      ) : null}
      {record.done?.note ? (
        <p className="text-2xs leading-snug text-muted-foreground">{record.done.note}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-2xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}
