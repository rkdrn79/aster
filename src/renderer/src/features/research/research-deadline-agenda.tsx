import { AlertTriangle, ExternalLink, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SubmissionStatus } from '../../../../shared/research/conference-deadlines'
import {
  deadlineTone,
  formatCountdown,
  formatDeadlineDate,
  formatDeadlineDateTime,
  formatDeadlineRange,
  formatMonthLabel,
  formatStatedTime,
  formatZoneOffset,
  type DeadlineTone
} from './research-deadline-format'
import { ResearchDeadlineStatusMenu } from './research-deadline-status-menu'
import type { DeadlineEntry, EditionStatus, TimelineStage } from './research-deadline-timeline'

const TONE_ROW: Record<DeadlineTone, string> = {
  past: 'opacity-60',
  urgent: 'border-destructive/50',
  soon: 'border-status-warning-border bg-status-warning-background',
  later: ''
}

const TONE_COUNTDOWN: Record<DeadlineTone, string> = {
  past: 'text-muted-foreground',
  urgent: 'text-destructive',
  soon: 'text-foreground',
  later: 'text-muted-foreground'
}

const STAGE_TAG: Partial<Record<TimelineStage, string>> = {
  review: 'review',
  rebuttal: 'rebuttal',
  notification: 'decision',
  'camera-ready': 'camera-ready',
  event: 'conference',
  other: 'other'
}

const SOURCE_LABEL: Record<DeadlineEntry['source'], string> = {
  ccfddl: 'ccfddl',
  huggingface: 'HF ai-deadlines',
  custom: 'added by you'
}

export function deadlineRowId(entry: DeadlineEntry): string {
  return `deadline-${entry.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

type Props = {
  entries: DeadlineEntry[]
  now: number
  timeZone: string
  locale: string
  highlightedKey: string | null
  saving: boolean
  /** Off while browsing every conference, where per-paper status would be noise. */
  showStatus: boolean
  statusOf: (editionId: string | null) => EditionStatus
  onStatusChange: (entry: DeadlineEntry, status: SubmissionStatus | null) => void
  onOpenLink: (url: string) => void
  onRemoveCustom: (id: string) => void
}

function groupByMonth(
  entries: DeadlineEntry[],
  timeZone: string,
  locale: string
): { label: string; entries: DeadlineEntry[] }[] {
  const groups: { label: string; entries: DeadlineEntry[] }[] = []
  for (const entry of entries) {
    const label = formatMonthLabel(entry.epochMs, entry.allDay ? 'UTC' : timeZone, locale)
    const last = groups.at(-1)
    if (last?.label === label) {
      last.entries.push(entry)
    } else {
      groups.push({ label, entries: [entry] })
    }
  }
  return groups
}

function countdown(entry: DeadlineEntry, now: number): string {
  if (entry.opensMs !== null && now < entry.opensMs) {
    return `Opens in ${formatCountdown(entry.opensMs, now).replace(/ left$/, '')}`
  }
  return formatCountdown(entry.epochMs, now)
}

function when(entry: DeadlineEntry, timeZone: string, locale: string): string {
  if (entry.allDay) {
    return formatDeadlineDate(entry.epochMs, 'UTC', locale)
  }
  const zone = formatZoneOffset(entry.epochMs, timeZone, locale)
  return entry.opensMs !== null
    ? `${formatDeadlineRange(entry.opensMs, entry.epochMs, timeZone, locale)} ${zone}`
    : `${formatDeadlineDateTime(entry.epochMs, timeZone, locale)} ${zone}`
}

function provenance(entry: DeadlineEntry): string {
  if (entry.allDay) {
    return entry.note ?? ''
  }
  const stated = `Stated as ${formatStatedTime(entry.wallClock, entry.timezone)}`
  return [
    entry.zoneRecognized ? stated : `${stated} · zone not recognized, read as AoE`,
    SOURCE_LABEL[entry.source]
  ].join(' · ')
}

export function ResearchDeadlineAgenda({
  entries,
  now,
  timeZone,
  locale,
  highlightedKey,
  saving,
  showStatus,
  statusOf,
  onStatusChange,
  onOpenLink,
  onRemoveCustom
}: Props): React.JSX.Element {
  return (
    <div className="space-y-5">
      {groupByMonth(entries, timeZone, locale).map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h2 className="sticky top-0 z-10 bg-background py-1 text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
            {group.label}
          </h2>
          <ol className="mt-2 space-y-2">
            {group.entries.map((entry) => {
              const tone = deadlineTone(entry.epochMs, now)
              const { link, customId, editionId } = entry
              const disputed = entry.agreement === 'disputed'
              const tag = STAGE_TAG[entry.stage]
              return (
                <li
                  key={entry.key}
                  id={deadlineRowId(entry)}
                  data-current={entry.key === highlightedKey}
                  className={cn(
                    'grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-start gap-3 rounded-md border border-border px-3 py-2.5 transition-shadow data-[current=true]:ring-2 data-[current=true]:ring-ring',
                    TONE_ROW[tone],
                    !entry.actionable && 'opacity-60'
                  )}
                >
                  <p
                    className={cn(
                      'pt-0.5 text-sm font-semibold tabular-nums',
                      TONE_COUNTDOWN[tone]
                    )}
                  >
                    {countdown(entry, now)}
                  </p>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {entry.title}
                      <span className="font-normal text-muted-foreground">
                        {' · '}
                        {entry.label}
                      </span>
                      {tag && !entry.label.toLowerCase().includes(tag) ? (
                        <span className="ml-2 text-2xs text-muted-foreground">{tag}</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-sm">{when(entry, timeZone, locale)}</p>
                    <p
                      className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"
                      title={entry.note ?? undefined}
                    >
                      {entry.zoneRecognized && !disputed ? null : (
                        <AlertTriangle
                          className="size-3 shrink-0 text-status-warning"
                          aria-hidden
                        />
                      )}
                      <span className="truncate">
                        {disputed
                          ? 'Sources disagree on this date; check the call for papers · '
                          : ''}
                        {provenance(entry)}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {showStatus && editionId && !customId ? (
                      <ResearchDeadlineStatusMenu
                        status={statusOf(editionId)}
                        title={entry.title}
                        offerSubmit={entry.stage === 'submission'}
                        disabled={saving}
                        onChange={(status) => onStatusChange(entry, status)}
                      />
                    ) : null}
                    {link ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Open ${entry.title} call for papers`}
                        onClick={() => onOpenLink(link)}
                      >
                        <ExternalLink />
                      </Button>
                    ) : null}
                    {customId ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove ${entry.title} ${entry.label}`}
                        onClick={() => onRemoveCustom(customId)}
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
