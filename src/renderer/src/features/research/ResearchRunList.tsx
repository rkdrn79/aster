import { useCallback, useState } from 'react'
import { Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { getIntlLocale } from '@/i18n/i18n'
import { formatUiRelativeTimeFromDate } from '@/i18n/relative-time-format'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import { useResearchRecords } from './research-records-store'
import {
  ATTACHED_FILE_NOTE,
  RunInspector,
  type ResearchMetricSourceHealth
} from './ResearchRunInspector'
import { selectResearchRun } from '../../../../shared/research/research-selection'
import { effectiveRunStatusFacts, type ResearchRunStatusFacts } from './research-run-status-label'
import { ResearchRunStatusLine } from './ResearchRunStatusLine'
import { catalogRunReference } from './use-research-harness-experiment'
import { researchWatchText } from './research-watch-condition-text'
import type { ResearchFinding } from '../../../../shared/research/research-quality-findings'
import { ResearchRunFindingBadge } from './ResearchRunFindingBadge'
import type { ResearchRunSummary } from '../../../../shared/research/research-run-summary'
import { sortResearchRuns, type ResearchRunSort } from './research-run-list-sort'

const NO_NOTES: ResearchRunSummary['notes'] = []
const RUN_SORTS: readonly ResearchRunSort[] = ['newest', 'name', 'status', 'metric']

function runSortOf(value: string): ResearchRunSort {
  return RUN_SORTS.find((sort) => sort === value) ?? 'newest'
}

const SOURCE_PROBLEMS: Partial<Record<ResearchMetricSourceHealth['state'], string>> = {
  checking: 'reading…',
  cached: "couldn't refresh",
  unavailable: 'metrics unavailable',
  'identity-mismatch': 'metrics file changed'
}

/** How the last metrics read went; when a Run has no known status, when it was last read. */
function sourceSummary(
  health: ResearchMetricSourceHealth | undefined,
  statusKnown: boolean
): string | null {
  const problem = health ? SOURCE_PROBLEMS[health.state] : undefined
  if (problem) {
    return problem
  }
  return !statusKnown && health?.observedAt
    ? `updated ${new Date(health.observedAt).toLocaleTimeString(getIntlLocale())}`
    : null
}

export type ResearchRunComparison = {
  /** This Experiment's checked Runs. */
  checkedIds: string[]
  /** The brief's baseline, compared always, so its box stays checked. */
  lockedId: string | null
  /** No room for another Run. */
  full: boolean
  onToggle: (id: string) => void
}

/** The Runs tab: a filterable Run list and the selected Run's inspector. */
export function ResearchRunList({
  runs,
  selectedRunId,
  comparison,
  markAttached,
  onDetach,
  liveStatuses,
  watches,
  findingsByRun,
  summaries
}: {
  runs: ResearchRunRecord[]
  selectedRunId: string | null
  comparison: ResearchRunComparison
  /** Marks Runs outside the research/ catalog, in Experiments that have one. */
  markAttached: boolean
  onDetach: (id: string) => void
  /** run.json status by `<experiment>/<run>`, for Runs in the project's research/ catalog. */
  liveStatuses: ReadonlyMap<string, ResearchRunStatusFacts>
  /** Active watch conditions by `<experiment>/<run>`. */
  watches: ReadonlyMap<string, string[]>
  /** Open quality findings by `<experiment>/<run>`. */
  findingsByRun: ReadonlyMap<string, ResearchFinding[]>
  /** summary.json by `<experiment>/<run>`, for the agents' notes on the selected Run. */
  summaries: ReadonlyMap<string, ResearchRunSummary | null>
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort] = useState<ResearchRunSort>('newest')
  const [sourceHealth, setSourceHealth] = useState<Record<string, ResearchMetricSourceHealth>>({})
  const onSourceHealthChange = useCallback((id: string, health: ResearchMetricSourceHealth) => {
    setSourceHealth((current) => ({ ...current, [id]: health }))
  }, [])
  const selected = runs.find((run) => run.id === selectedRunId)
  const liveOf = (run: ResearchRunRecord): ResearchRunStatusFacts | null => {
    const reference = catalogRunReference(run)
    return reference ? (liveStatuses.get(reference) ?? null) : null
  }
  const watchOf = (run: ResearchRunRecord): string | null => {
    const reference = catalogRunReference(run)
    const conditions = reference ? watches.get(reference) : undefined
    return conditions?.length ? researchWatchText(conditions) : null
  }
  const findingsOf = (run: ResearchRunRecord): ResearchFinding[] => {
    const reference = catalogRunReference(run)
    return reference ? (findingsByRun.get(reference) ?? []) : []
  }
  const statusOf = (run: ResearchRunRecord): ResearchRunStatusFacts =>
    effectiveRunStatusFacts(run, liveOf(run))
  const primaryOf = (run: ResearchRunRecord): ResearchRunSummary['primary'] =>
    summaries.get(catalogRunReference(run) ?? '')?.primary ?? null
  const hasPrimary = runs.some((run) => primaryOf(run)?.last)
  const search = query.trim().toLowerCase()
  const matchingRuns = sortResearchRuns(
    runs.filter(
      (run) =>
        (statusFilter === 'all' || statusOf(run).state === statusFilter) &&
        (run.name.toLowerCase().includes(search) || run.sourcePath.toLowerCase().includes(search))
    ),
    sort,
    { statusOf, primaryOf }
  )
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
      {/* Why sticky: the inspector is long; the list stays in reach while it scrolls. */}
      <div className="scrollbar-sleek space-y-2 lg:sticky lg:top-0 lg:max-h-[calc(100vh-9rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
        <div className="flex flex-wrap gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search runs"
            aria-label="Find a Run or source"
            className="min-w-40 flex-1"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger aria-label="Filter Runs by recorded status" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="unknown">Status unknown</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="succeeded">Succeeded</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(value) => setSort(runSortOf(value))}>
            <SelectTrigger aria-label="Sort Runs" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="status">Status</SelectItem>
              {hasPrimary ? (
                <SelectItem value="metric">Primary metric, best first</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>
        {matchingRuns.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">No runs match.</p>
        ) : null}
        <ul className="space-y-0.5">
          {matchingRuns.map((run) => {
            const status = statusOf(run)
            const summary = sourceSummary(sourceHealth[run.id], status.state !== 'unknown')
            const watched = watchOf(run)
            const locked = comparison.lockedId === run.id
            const checked = locked || comparison.checkedIds.includes(run.id)
            const attached = markAttached && !catalogRunReference(run)
            const started = status.startedAt ?? run.createdAt
            return (
              <li key={run.id} className="flex items-start gap-2 px-1">
                <Checkbox
                  aria-label={`Compare ${run.name}`}
                  title={locked ? 'Baseline, always compared' : undefined}
                  className="mt-2"
                  checked={checked}
                  disabled={locked || (!checked && comparison.full)}
                  onCheckedChange={() => comparison.onToggle(run.id)}
                />
                <div className="min-w-0 flex-1">
                  <Button
                    variant={selected?.id === run.id ? 'secondary' : 'ghost'}
                    size="sm"
                    className="w-full justify-start"
                    aria-current={selected?.id === run.id ? 'true' : undefined}
                    onClick={() =>
                      void useResearchRecords
                        .getState()
                        .update((current) => selectResearchRun(current, run.id))
                        .catch(() => undefined)
                    }
                  >
                    <span className="truncate">{run.name}</span>
                    {locked ? <Badge variant="outline">Baseline</Badge> : null}
                    <ResearchRunFindingBadge findings={findingsOf(run)} />
                    {watched ? (
                      <span
                        role="img"
                        aria-label={watched}
                        title={watched}
                        className="ml-auto inline-flex shrink-0 text-muted-foreground"
                      >
                        <Eye aria-hidden className="size-3" />
                      </span>
                    ) : null}
                  </Button>
                  {status.state !== 'unknown' || summary || attached || started ? (
                    <p className="mt-0.5 flex min-w-0 items-center gap-1 px-3 text-xs text-muted-foreground">
                      {status.state !== 'unknown' ? (
                        <ResearchRunStatusLine facts={status} className="shrink-0" />
                      ) : null}
                      {[attached ? 'attached file' : null, summary]
                        .filter((part): part is string => Boolean(part))
                        .map((part, index) => (
                          <span
                            key={part}
                            className="truncate"
                            title={part === 'attached file' ? ATTACHED_FILE_NOTE : undefined}
                          >
                            {status.state !== 'unknown' || index > 0 ? '· ' : ''}
                            {part}
                          </span>
                        ))}
                      {started ? (
                        <time
                          dateTime={started}
                          title={`Started ${new Date(started).toLocaleString(getIntlLocale())}`}
                          className="ml-auto shrink-0 pl-1 tabular-nums"
                        >
                          {formatUiRelativeTimeFromDate(started)}
                        </time>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
      {selected ? (
        <div className="min-w-0 space-y-3">
          {matchingRuns.every((run) => run.id !== selected.id) ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span>{selected.name} is hidden by the filter.</span>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  setQuery('')
                  setStatusFilter('all')
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : null}
          <RunInspector
            key={selected.id}
            run={selected}
            live={liveOf(selected)}
            watched={watchOf(selected)}
            findings={findingsOf(selected)}
            notes={summaries.get(catalogRunReference(selected) ?? '')?.notes ?? NO_NOTES}
            attachedFile={!catalogRunReference(selected)}
            onDetach={onDetach}
            onSourceHealthChange={onSourceHealthChange}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Select a run.</p>
      )}
    </div>
  )
}
