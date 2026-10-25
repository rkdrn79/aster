import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  deadlineTone,
  formatDeadlineDateTime,
  formatShortMonth,
  monthStarts
} from './research-deadline-format'
import { deadlineCategory, type DeadlineEntry } from './research-deadline-timeline'

const MONTHS_SHOWN = 12

const TONE_MARKER: Record<ReturnType<typeof deadlineTone>, string> = {
  past: 'bg-muted-foreground/40',
  urgent: 'bg-destructive',
  soon: 'bg-status-warning',
  later: 'bg-foreground'
}

const TONE_RING: Record<ReturnType<typeof deadlineTone>, string> = {
  past: 'border-muted-foreground/40',
  urgent: 'border-destructive',
  soon: 'border-status-warning',
  later: 'border-foreground'
}

// Why: shape, not colour, tells the two apart, because colour already carries urgency.
const DEADLINE_MARKER = 'h-5 w-1 rounded-full hover:scale-y-125'
const AFTER_SUBMISSION_MARKER = 'size-2.5 rounded-full border-2 bg-background hover:scale-125'

type Props = {
  entries: DeadlineEntry[]
  now: number
  timeZone: string
  locale: string
  onSelect: (entry: DeadlineEntry) => void
}

/** Twelve-month overview; each tracked deadline is a marker placed at its local date. */
export function ResearchDeadlineStrip({
  entries,
  now,
  timeZone,
  locale,
  onSelect
}: Props): React.JSX.Element {
  const starts = monthStarts(now, timeZone, MONTHS_SHOWN + 1)
  const rangeStart = starts[0]
  const rangeEnd = starts[MONTHS_SHOWN]
  const span = rangeEnd - rangeStart
  const position = (epochMs: number): number => ((epochMs - rangeStart) / span) * 100
  const visible = entries.filter((entry) => entry.epochMs >= rangeStart && entry.epochMs < rangeEnd)

  return (
    <div className="px-6 pt-4" aria-label="Twelve-month deadline overview" role="group">
      <div className="relative h-9 rounded-md border border-border bg-muted/40">
        {starts.slice(1, MONTHS_SHOWN).map((start) => (
          <span
            key={start}
            aria-hidden
            className="absolute inset-y-0 w-px bg-border"
            style={{ left: `${position(start)}%` }}
          />
        ))}
        <span
          aria-hidden
          className="absolute inset-y-0 w-0.5 bg-primary"
          style={{ left: `${position(now)}%` }}
        />
        {visible.map((entry) => {
          const tone = deadlineTone(entry.epochMs, now)
          const isDeadline = deadlineCategory(entry) === 'deadline'
          return (
            <Tooltip key={entry.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`${entry.title} ${entry.label}`}
                  className={cn(
                    'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isDeadline
                      ? [DEADLINE_MARKER, TONE_MARKER[tone]]
                      : [AFTER_SUBMISSION_MARKER, TONE_RING[tone]]
                  )}
                  style={{ left: `${position(entry.epochMs)}%` }}
                  onClick={() => onSelect(entry)}
                />
              </TooltipTrigger>
              <TooltipContent side="top">
                {entry.title} · {entry.label}
                <br />
                {formatDeadlineDateTime(entry.epochMs, timeZone, locale)}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
      <div className="relative mt-1 h-4 text-2xs text-muted-foreground" aria-hidden>
        {starts.slice(0, MONTHS_SHOWN).map((start, index) => (
          <span
            key={start}
            className="absolute truncate pl-1"
            style={{
              left: `${position(start)}%`,
              width: `${position(starts[index + 1]) - position(start)}%`
            }}
          >
            {formatShortMonth(start, timeZone, locale)}
          </span>
        ))}
      </div>
      <div className="mt-1 flex justify-end gap-3 text-2xs text-muted-foreground" aria-hidden>
        <span className="flex items-center gap-1">
          <span className="h-3 w-1 rounded-full bg-foreground" />
          Deadline
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-full border-2 border-foreground" />
          After submission
        </span>
      </div>
    </div>
  )
}
