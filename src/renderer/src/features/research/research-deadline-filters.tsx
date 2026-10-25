import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  CONFERENCE_TOPICS,
  type ConferenceTopic
} from '../../../../shared/research/conference-topics'
import type { ConferenceSeriesSummary } from './research-deadline-progress'

export type ConferenceFilters = {
  tier: 'all' | 'top'
  topic: ConferenceTopic | 'all'
}

export const DEFAULT_CONFERENCE_FILTERS: ConferenceFilters = { tier: 'all', topic: 'all' }

export function matchesConferenceFilters(
  item: { topTier: boolean; topic: ConferenceTopic | null },
  filters: ConferenceFilters
): boolean {
  return (
    (filters.tier === 'all' || item.topTier) &&
    (filters.topic === 'all' || item.topic === filters.topic)
  )
}

export type ConferenceGroup = { key: string; label: string; summaries: ConferenceSeriesSummary[] }

/** Tracked conferences first, then the rest clustered by topic in a fixed order. */
export function groupConferenceSummaries(
  summaries: ConferenceSeriesSummary[],
  tracked: ReadonlySet<string>
): ConferenceGroup[] {
  const groups: ConferenceGroup[] = [
    {
      key: 'tracked',
      label: 'Tracked',
      summaries: summaries.filter((summary) => tracked.has(summary.series))
    },
    ...CONFERENCE_TOPICS.map((topic) => ({
      key: topic.key,
      label: topic.label,
      summaries: summaries.filter(
        (summary) => summary.topic === topic.key && !tracked.has(summary.series)
      )
    }))
  ]
  return groups.filter((group) => group.summaries.length > 0)
}

function isTopic(value: string): value is ConferenceTopic {
  return CONFERENCE_TOPICS.some((topic) => topic.key === value)
}

export function ResearchDeadlineFilterBar({
  filters,
  onChange
}: {
  filters: ConferenceFilters
  onChange: (filters: ConferenceFilters) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <ToggleGroup
        type="single"
        variant="outline"
        size="xs"
        value={filters.tier}
        onValueChange={(value) =>
          value && onChange({ ...filters, tier: value === 'top' ? 'top' : 'all' })
        }
        aria-label="Conference tier"
      >
        <ToggleGroupItem value="all">All tiers</ToggleGroupItem>
        <ToggleGroupItem value="top" title="CCF A or CORE A*">
          Top tier
        </ToggleGroupItem>
      </ToggleGroup>
      <Select
        value={filters.topic}
        onValueChange={(value) => onChange({ ...filters, topic: isTopic(value) ? value : 'all' })}
      >
        <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="Topic">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All topics</SelectItem>
          {CONFERENCE_TOPICS.map((topic) => (
            <SelectItem key={topic.key} value={topic.key}>
              {topic.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
