import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { getIntlLocale } from '@/i18n/i18n'
import type { SubmissionStatus } from '../../../../shared/research/conference-deadlines'
import { useConferenceDeadlines } from './conference-deadlines-store'
import { deadlineRowId } from './research-deadline-agenda'
import { ResearchDeadlineCatalog } from './research-deadline-catalog'
import {
  ResearchDeadlineCustomDialog,
  type CustomDeadlinePrefill
} from './research-deadline-custom-dialog'
import {
  DEFAULT_CONFERENCE_FILTERS,
  matchesConferenceFilters,
  type ConferenceFilters
} from './research-deadline-filters'
import { formatCountdown, systemTimeZone } from './research-deadline-format'
import {
  missingMilestones,
  submissionPrompts,
  summarizeConferenceSeries
} from './research-deadline-progress'
import { ResearchDeadlineSchedule } from './research-deadline-schedule'
import { ResearchDeadlineStrip } from './research-deadline-strip'
import {
  buildCatalogDeadlineEntries,
  buildDeadlineEntries,
  deadlineCategory,
  isActionableDeadline,
  nextUpcomingDeadline,
  splitSchedule,
  submissionStatusOf,
  type DeadlineCategory,
  type DeadlineEntry
} from './research-deadline-timeline'
import { ResearchDeadlineZonePicker } from './research-deadline-zone-picker'
import { useConferenceTrackingActions } from './use-conference-tracking-actions'
import { useDeadlineClock } from './use-deadline-clock'
import { ResearchPageHeader } from './ResearchPageLayout'

function openUrl(url: string): void {
  void window.api.shell.openUrl(url)
}

export function ResearchDeadlinesPage(): React.JSX.Element {
  const tracking = useConferenceDeadlines((state) => state.tracking)
  const catalog = useConferenceDeadlines((state) => state.catalog)
  const loading = useConferenceDeadlines((state) => state.loading)
  const refreshing = useConferenceDeadlines((state) => state.refreshing)
  const error = useConferenceDeadlines((state) => state.error)
  const refreshError = useConferenceDeadlines((state) => state.refreshError)
  const needsRestart = useConferenceDeadlines((state) => state.needsRestart)
  const actions = useConferenceTrackingActions()
  const [range, setRange] = useState<'upcoming' | 'past'>('upcoming')
  const [tab, setTab] = useState<DeadlineCategory>('deadline')
  const [filters, setFilters] = useState<ConferenceFilters>(DEFAULT_CONFERENCE_FILTERS)
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ prefill: CustomDeadlinePrefill | null } | null>(null)
  const now = useDeadlineClock()
  const locale = getIntlLocale()
  const timeZone = tracking?.displayTimeZone ?? systemTimeZone()

  useEffect(() => {
    void useConferenceDeadlines.getState().refreshIfStale()
  }, [])

  const browsing =
    tracking?.trackedSeries.length === 0 &&
    tracking.customDeadlines.length === 0 &&
    tracking.submissions.length === 0
  const entries = useMemo(() => {
    if (!tracking) {
      return []
    }
    // Why: before anything is tracked, show every conference's submissions instead of a blank page.
    return browsing
      ? buildCatalogDeadlineEntries(catalog).filter((entry) =>
          matchesConferenceFilters(entry, filters)
        )
      : buildDeadlineEntries(catalog, tracking)
  }, [browsing, catalog, filters, tracking])
  const summaries = useMemo(() => summarizeConferenceSeries(catalog, now), [catalog, now])
  const tracked = useMemo(() => new Set(tracking?.trackedSeries ?? []), [tracking])
  const next = browsing ? null : nextUpcomingDeadline(entries, now)
  const schedule = splitSchedule(entries, tracking, range, now)
  const prompts = tracking && !browsing ? submissionPrompts(catalog, tracking, entries, now) : []
  const missing = tracking ? missingMilestones(catalog, tracking) : []

  function changeStatus(
    editionId: string,
    series: string | null,
    title: string,
    status: SubmissionStatus | null
  ): void {
    const before = submissionStatusOf(tracking, editionId)
    actions.setStatus(editionId, series, status)
    // Why: the row leaves the Deadlines tab, so say where it went instead of letting it vanish.
    if (status === 'submitted' && before === 'none' && tab === 'deadline') {
      toast(`${title} moved to After submission`, {
        action: { label: 'Show', onClick: () => setTab('after-submission') }
      })
    }
  }

  function focusEntry(entry: DeadlineEntry): void {
    setTab(deadlineCategory(entry))
    setRange(entry.epochMs >= now ? 'upcoming' : 'past')
    setHighlightedKey(entry.key)
    requestAnimationFrame(() =>
      document.getElementById(deadlineRowId(entry))?.scrollIntoView({ block: 'center' })
    )
  }

  const blockingMessage = needsRestart
    ? 'Restart the app to load deadlines.'
    : !tracking
      ? loading
        ? 'Loading tracked deadlines…'
        : (error ?? 'Tracked deadlines are unavailable.')
      : browsing && !catalog
        ? refreshing
          ? 'Downloading the conference list…'
          : 'Refresh the conference list on the right to browse it.'
        : null

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-background text-foreground"
      aria-label="Deadlines"
    >
      <ResearchPageHeader
        title="Deadlines"
        context={
          next
            ? `Next: ${next.title} ${next.label} · ${formatCountdown(next.epochMs, now)}`
            : 'Track conference dates in your time zone'
        }
        actions={
          <>
            <ResearchDeadlineZonePicker
              value={tracking?.displayTimeZone ?? null}
              now={now}
              locale={locale}
              disabled={!tracking || actions.saving}
              onChange={actions.setDisplayTimeZone}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!tracking}
              onClick={() => setDialog({ prefill: null })}
            >
              <Plus aria-hidden /> Add deadline
            </Button>
          </>
        }
      />
      {error && tracking ? (
        <p role="alert" className="border-b border-border px-6 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {refreshError ? (
        <p role="status" className="border-b border-border px-6 py-2 text-xs text-muted-foreground">
          {refreshError}
          {catalog ? ' Showing the last downloaded list.' : ''}
        </p>
      ) : null}
      {/* Why: stacked on a phone, the schedule and catalog scroll as one page instead of two short panes. */}
      <div className="scrollbar-sleek grid min-h-0 flex-1 grid-cols-1 max-md:auto-rows-max max-md:overflow-y-auto md:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <div className="flex min-h-0 flex-col">
          <ResearchDeadlineStrip
            entries={entries.filter(isActionableDeadline)}
            now={now}
            timeZone={timeZone}
            locale={locale}
            onSelect={focusEntry}
          />
          <ResearchDeadlineSchedule
            tab={tab}
            range={range}
            browsing={browsing}
            hasSubmissions={Boolean(tracking?.submissions.length)}
            deadlines={schedule.deadlines}
            afterSubmission={schedule.afterSubmission}
            prompts={prompts}
            missing={missing}
            blockingMessage={blockingMessage}
            onTabChange={setTab}
            onRangeChange={setRange}
            onMarkSubmitted={(prompt) =>
              changeStatus(prompt.editionId, prompt.series, prompt.title, 'submitted')
            }
            onAddDate={(milestone) =>
              setDialog({
                prefill: {
                  title: milestone.title,
                  label: milestone.label,
                  timezone: milestone.timezone,
                  editionId: milestone.editionId,
                  stage: milestone.stage
                }
              })
            }
            now={now}
            timeZone={timeZone}
            locale={locale}
            highlightedKey={highlightedKey}
            saving={actions.saving || !tracking}
            showStatus={!browsing}
            statusOf={(editionId) => submissionStatusOf(tracking, editionId)}
            onStatusChange={(entry, status) => {
              if (entry.editionId) {
                changeStatus(entry.editionId, entry.series, entry.title, status)
              }
            }}
            onOpenLink={openUrl}
            onRemoveCustom={actions.removeCustom}
          />
        </div>
        <ResearchDeadlineCatalog
          summaries={summaries}
          tracked={tracked}
          filters={filters}
          now={now}
          timeZone={timeZone}
          locale={locale}
          sources={catalog?.sources ?? []}
          refreshing={refreshing}
          saving={actions.saving || !tracking}
          onFiltersChange={setFilters}
          onToggle={actions.toggleSeries}
          onTrackMany={actions.trackMany}
          onClearTracked={actions.clearTracked}
          onRefresh={() => void useConferenceDeadlines.getState().refresh()}
          onOpenUrl={openUrl}
        />
      </div>
      <ResearchDeadlineCustomDialog
        open={dialog !== null}
        displayTimeZone={timeZone}
        locale={locale}
        prefill={dialog?.prefill ?? null}
        onSave={actions.addCustom}
        onClose={() => setDialog(null)}
      />
    </section>
  )
}
