import { Check, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { formatConferenceRank } from '../../../../shared/research/conference-topics'
import { formatCountdown, formatDeadlineDateTime } from './research-deadline-format'
import type { ConferenceGroup } from './research-deadline-filters'
import type { ConferenceSeriesSummary } from './research-deadline-progress'

type RowProps = {
  summary: ConferenceSeriesSummary
  isTracked: boolean
  now: number
  timeZone: string
  locale: string
  saving: boolean
  onToggle: (series: string) => void
}

function ConferenceRow({
  summary,
  isTracked,
  now,
  timeZone,
  locale,
  saving,
  onToggle
}: RowProps): React.JSX.Element {
  const rank = formatConferenceRank(summary.rank)
  return (
    <li>
      <button
        type="button"
        aria-pressed={isTracked}
        disabled={saving}
        title={summary.fullName ?? undefined}
        className={cn(
          'mb-1 flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
          isTracked && 'bg-accent'
        )}
        onClick={() => onToggle(summary.series)}
      >
        <span
          className={cn(
            'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border border-border',
            isTracked && 'border-primary bg-primary text-primary-foreground'
          )}
          aria-hidden
        >
          {isTracked ? <Check className="size-3" /> : <Plus className="size-3 opacity-50" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="truncate text-sm font-medium">{summary.title}</span>
            <span className="text-xs text-muted-foreground">{summary.latestYear}</span>
            {rank ? (
              <span className="ml-auto shrink-0 text-2xs text-muted-foreground">{rank}</span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {summary.next
              ? `${summary.next.label} · ${formatDeadlineDateTime(summary.next.epochMs, timeZone, locale)}`
              : 'Next deadline not announced yet'}
          </span>
          {summary.next || summary.latestDates ? (
            <span className="block truncate text-2xs text-muted-foreground">
              {summary.next
                ? formatCountdown(summary.next.epochMs, now)
                : `Held ${summary.latestDates}`}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  )
}

type GroupProps = Omit<RowProps, 'summary' | 'isTracked'> & {
  group: ConferenceGroup
  tracked: ReadonlySet<string>
  open: boolean
  onOpenChange: () => void
  onTrackMany: (series: string[]) => void
  onClearTracked: () => void
}

/** A topic (or the tracked set) that opens and closes like a folder. */
export function ResearchDeadlineCatalogGroup({
  group,
  tracked,
  open,
  onOpenChange,
  onTrackMany,
  onClearTracked,
  ...rowProps
}: GroupProps): React.JSX.Element {
  const untracked = group.summaries.filter((summary) => !tracked.has(summary.series))
  // Why: summaries arrive sorted by next deadline, so the first one is the group's soonest.
  const soonest = group.summaries.find((summary) => summary.next)?.next ?? null
  return (
    <section aria-label={group.label} className="mb-1">
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <div className="sticky top-0 z-10 flex items-center gap-1 bg-background py-0.5">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight
                className={cn(
                  'size-3.5 shrink-0 text-muted-foreground transition-transform',
                  open && 'rotate-90'
                )}
                aria-hidden
              />
              <span className="truncate text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </span>
              <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                {group.summaries.length}
              </span>
              {!open && soonest ? (
                <span className="ml-auto shrink-0 pl-2 text-2xs tabular-nums text-muted-foreground">
                  {formatCountdown(soonest.epochMs, rowProps.now)}
                </span>
              ) : null}
            </button>
          </CollapsibleTrigger>
          {group.key === 'tracked' ? (
            <Button
              variant="ghost"
              size="xs"
              disabled={rowProps.saving}
              aria-label={`Untrack all ${tracked.size} conferences`}
              onClick={onClearTracked}
            >
              Clear
            </Button>
          ) : untracked.length > 1 ? (
            <Button
              variant="ghost"
              size="xs"
              disabled={rowProps.saving}
              aria-label={`Track all ${untracked.length} ${group.label} conferences`}
              onClick={() => onTrackMany(untracked.map((summary) => summary.series))}
            >
              Track all
            </Button>
          ) : null}
        </div>
        <CollapsibleContent>
          <ul className="pl-1">
            {group.summaries.map((summary) => (
              <ConferenceRow
                key={summary.series}
                summary={summary}
                isTracked={tracked.has(summary.series)}
                {...rowProps}
              />
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}
