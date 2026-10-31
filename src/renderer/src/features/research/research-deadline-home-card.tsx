import { useEffect, useMemo } from 'react'
import { ArrowRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { openResearchHome } from './research-navigation'
import { useConferenceDeadlines } from './conference-deadlines-store'
import { buildDeadlineEntries, isActionableDeadline } from './research-deadline-timeline'
import {
  summarizeConferenceSeries,
  type ConferenceSeriesSummary
} from './research-deadline-progress'
import { deadlineTone, formatDayCount } from './research-deadline-format'
import { useConferenceTrackingActions } from './use-conference-tracking-actions'
import { useDeadlineClock } from './use-deadline-clock'

const UPCOMING_SHOWN = 4
const SUGGESTIONS_SHOWN = 3

/** The next untracked conferences with an open deadline, top tier first. */
export function suggestedConferences(
  summaries: readonly ConferenceSeriesSummary[],
  tracked: ReadonlySet<string>,
  count = SUGGESTIONS_SHOWN
): ConferenceSeriesSummary[] {
  return summaries
    .filter((summary) => summary.next && !tracked.has(summary.series))
    .toSorted(
      (left, right) =>
        Number(right.topTier) - Number(left.topTier) ||
        (left.next?.epochMs ?? 0) - (right.next?.epochMs ?? 0)
    )
    .slice(0, count)
}

function DayCount({ epochMs, now }: { epochMs: number; now: number }): React.JSX.Element {
  const tone = deadlineTone(epochMs, now)
  return (
    <span
      className={cn(
        'shrink-0 tabular-nums text-muted-foreground',
        tone === 'urgent' && 'font-semibold text-destructive',
        tone === 'soon' && 'font-semibold text-foreground'
      )}
    >
      {formatDayCount(epochMs, now)}
    </span>
  )
}

export function ResearchHomeDeadlines(): React.JSX.Element {
  const tracking = useConferenceDeadlines((state) => state.tracking)
  const catalog = useConferenceDeadlines((state) => state.catalog)
  const loading = useConferenceDeadlines((state) => state.loading)
  const refreshing = useConferenceDeadlines((state) => state.refreshing)
  const error = useConferenceDeadlines((state) => state.error)
  const needsRestart = useConferenceDeadlines((state) => state.needsRestart)
  const desktopOnly = useConferenceDeadlines((state) => state.desktopOnly)
  const actions = useConferenceTrackingActions()
  const now = useDeadlineClock(60_000)

  useEffect(() => {
    // Why: fetching here, in the background, means Deadlines opens on a list instead of a download.
    void useConferenceDeadlines.getState().refreshIfStale()
  }, [])

  const upcoming = useMemo(
    () =>
      (tracking ? buildDeadlineEntries(catalog, tracking) : [])
        .filter((entry) => entry.epochMs >= now && isActionableDeadline(entry))
        .slice(0, UPCOMING_SHOWN),
    [catalog, now, tracking]
  )
  const suggestions = useMemo(
    () =>
      upcoming.length || !tracking
        ? []
        : suggestedConferences(
            summarizeConferenceSeries(catalog, now),
            new Set(tracking.trackedSeries)
          ),
    [catalog, now, tracking, upcoming.length]
  )
  const status = desktopOnly
    ? 'Available in the desktop app.'
    : needsRestart
      ? 'Restart Aster to load deadlines.'
      : !tracking
        ? loading || !error
          ? 'Loading deadlines…'
          : error
        : !catalog
          ? refreshing
            ? 'Loading the conference list…'
            : 'Conference dates are unavailable. Open Deadlines to refresh.'
          : null

  return (
    <section
      aria-label="Deadlines"
      className="min-w-0 overflow-hidden rounded-lg border border-border bg-card"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-t-lg px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => openResearchHome('research-deadlines')}
      >
        <span className="flex-1 text-sm font-medium">Deadlines</span>
        <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
      </button>
      {upcoming.length > 0 ? (
        <ul className="space-y-2 border-t border-border px-4 py-3">
          {upcoming.map((entry) => (
            <li key={entry.key} className="flex items-baseline gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate" title={`${entry.title} ${entry.label}`}>
                {entry.title}
                <span className="text-muted-foreground"> · {entry.label}</span>
              </span>
              <DayCount epochMs={entry.epochMs} now={now} />
            </li>
          ))}
        </ul>
      ) : status ? (
        <p className="border-t border-border px-4 py-4 text-xs text-muted-foreground">{status}</p>
      ) : (
        <div className="space-y-2 border-t border-border px-4 py-3 text-xs">
          <p className="text-muted-foreground">
            {tracking?.trackedSeries.length
              ? 'No upcoming tracked deadlines.'
              : 'Nothing tracked yet.'}
            {suggestions.length ? ' Coming up:' : ''}
          </p>
          {suggestions.length ? (
            <ul className="space-y-1">
              {suggestions.map((summary) => (
                <li key={summary.series} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate" title={summary.fullName ?? undefined}>
                    {summary.title}
                    <span className="text-muted-foreground"> · {summary.next?.label}</span>
                  </span>
                  {summary.next ? <DayCount epochMs={summary.next.epochMs} now={now} /> : null}
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={actions.saving}
                    aria-label={`Track ${summary.title}`}
                    onClick={() => actions.toggleSeries(summary.series)}
                  >
                    <Plus aria-hidden />
                    Track
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <Button
            size="xs"
            variant="outline"
            onClick={() => openResearchHome('research-deadlines')}
          >
            Track conferences
          </Button>
        </div>
      )}
    </section>
  )
}
