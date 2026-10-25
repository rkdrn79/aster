import { useMemo, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  CONFERENCE_SOURCES,
  type ConferenceCatalog
} from '../../../../shared/research/conference-deadlines'
import { ResearchDeadlineCatalogGroup } from './research-deadline-catalog-group'
import { formatDeadlineDateTime } from './research-deadline-format'
import {
  ResearchDeadlineFilterBar,
  groupConferenceSummaries,
  matchesConferenceFilters,
  type ConferenceFilters
} from './research-deadline-filters'
import { useConferenceGroupOpenState } from './research-deadline-group-state'
import type { ConferenceSeriesSummary } from './research-deadline-progress'

type Props = {
  summaries: ConferenceSeriesSummary[]
  tracked: ReadonlySet<string>
  filters: ConferenceFilters
  now: number
  timeZone: string
  locale: string
  sources: ConferenceCatalog['sources']
  refreshing: boolean
  saving: boolean
  onFiltersChange: (filters: ConferenceFilters) => void
  onToggle: (series: string) => void
  onTrackMany: (series: string[]) => void
  onClearTracked: () => void
  onRefresh: () => void
  onOpenUrl: (url: string) => void
}

export function ResearchDeadlineCatalog({
  summaries,
  tracked,
  filters,
  now,
  timeZone,
  locale,
  sources,
  refreshing,
  saving,
  onFiltersChange,
  onToggle,
  onTrackMany,
  onClearTracked,
  onRefresh,
  onOpenUrl
}: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    const matches = summaries.filter(
      (summary) =>
        matchesConferenceFilters(summary, filters) &&
        (!normalized ||
          [summary.title, summary.fullName].some((value) =>
            value?.toLocaleLowerCase().includes(normalized)
          ))
    )
    return groupConferenceSummaries(matches, tracked)
  }, [filters, query, summaries, tracked])
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const groupState = useConferenceGroupOpenState(
    normalizedQuery || filters.topic !== 'all' ? `${normalizedQuery}|${filters.topic}` : null
  )
  const failed = sources.filter((entry) => entry.failed)
  const fetchedAt = sources
    .map((entry) => entry.fetchedAt)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1)

  return (
    <aside
      className="flex min-h-0 flex-col border-t border-border md:border-l md:border-t-0"
      aria-label="Conferences"
    >
      <div className="space-y-2 px-3 pt-3">
        <p className="px-1 text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
          Conferences · {tracked.size} tracked
        </p>
        <label className="flex items-center gap-2">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search ICML, NeurIPS…"
            aria-label="Search conferences"
          />
        </label>
        <ResearchDeadlineFilterBar filters={filters} onChange={onFiltersChange} />
      </div>
      <div className="scrollbar-sleek mt-2 min-h-0 flex-1 overflow-auto px-2 pb-2">
        {groups.length ? (
          groups.map((group) => (
            <ResearchDeadlineCatalogGroup
              key={group.key}
              group={group}
              tracked={tracked}
              open={groupState.isOpen(group.key)}
              onOpenChange={() => groupState.toggle(group.key)}
              now={now}
              timeZone={timeZone}
              locale={locale}
              saving={saving}
              onToggle={onToggle}
              onTrackMany={onTrackMany}
              onClearTracked={onClearTracked}
            />
          ))
        ) : (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            {summaries.length
              ? 'No conferences match these filters.'
              : refreshing
                ? 'Downloading the conference list…'
                : 'The conference list has not been downloaded yet.'}
          </p>
        )}
      </div>
      <footer className="border-t border-border px-3 py-2 text-2xs text-muted-foreground">
        {failed.length ? (
          <p className="mb-1 text-status-warning">
            {failed.map((entry) => CONFERENCE_SOURCES[entry.source].name).join(', ')} could not be
            updated; showing the last copy.
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate">
            Data:{' '}
            {(['ccfddl', 'huggingface'] as const).map((source, index) => (
              <span key={source}>
                {index ? ' + ' : ''}
                <button
                  type="button"
                  className="underline-offset-2 hover:text-foreground hover:underline"
                  onClick={() => onOpenUrl(CONFERENCE_SOURCES[source].url)}
                >
                  {source === 'ccfddl' ? 'ccfddl' : 'HF ai-deadlines'}
                </button>
              </span>
            ))}
            {fetchedAt
              ? ` · ${formatDeadlineDateTime(Date.parse(fetchedAt), timeZone, locale)}`
              : ''}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Refresh conference list"
            disabled={refreshing}
            onClick={onRefresh}
          >
            <RefreshCw className={cn(refreshing && 'animate-spin')} />
          </Button>
        </div>
      </footer>
    </aside>
  )
}
