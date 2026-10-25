import { useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useConferenceDeadlines } from './conference-deadlines-store'
import { deadlineTone, formatCountdown, formatDayCount } from './research-deadline-format'
import { buildDeadlineEntries, nextUpcomingDeadline } from './research-deadline-timeline'
import { useDeadlineClock } from './use-deadline-clock'

/** D-day of the next tracked submission, shown beside the Deadlines navigation item. */
export function ResearchDeadlineNavBadge(): React.JSX.Element | null {
  const tracking = useConferenceDeadlines((state) => state.tracking)
  const catalog = useConferenceDeadlines((state) => state.catalog)
  const now = useDeadlineClock(60_000)

  useEffect(() => {
    void useConferenceDeadlines.getState().load()
  }, [])

  const entries = useMemo(
    () => (tracking ? buildDeadlineEntries(catalog, tracking) : []),
    [catalog, tracking]
  )
  const next = nextUpcomingDeadline(entries, now)
  if (!next) {
    return null
  }
  const tone = deadlineTone(next.epochMs, now)
  return (
    <span
      title={`${next.title} ${next.label} · ${formatCountdown(next.epochMs, now)}`}
      className={cn(
        'ml-auto text-2xs tabular-nums text-muted-foreground',
        tone === 'urgent' && 'font-semibold text-destructive',
        tone === 'soon' && 'font-semibold text-foreground'
      )}
    >
      {formatDayCount(next.epochMs, now)}
    </span>
  )
}
