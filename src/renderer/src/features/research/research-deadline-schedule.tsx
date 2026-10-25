import { CalendarClock } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ResearchDeadlineAgenda } from './research-deadline-agenda'
import { ResearchDeadlineNextSteps } from './research-deadline-next-steps'
import type { MissingMilestone, SubmissionPrompt } from './research-deadline-progress'
import type { DeadlineCategory, DeadlineEntry } from './research-deadline-timeline'

type AgendaProps = Omit<React.ComponentProps<typeof ResearchDeadlineAgenda>, 'entries'>

type Props = AgendaProps & {
  tab: DeadlineCategory
  range: 'upcoming' | 'past'
  browsing: boolean
  hasSubmissions: boolean
  /** Both lists are already limited to `range` and ordered for display. */
  deadlines: DeadlineEntry[]
  afterSubmission: DeadlineEntry[]
  prompts: SubmissionPrompt[]
  missing: MissingMilestone[]
  /** Loading, restart or error text that replaces either list. */
  blockingMessage: string | null
  onTabChange: (tab: DeadlineCategory) => void
  onRangeChange: (range: 'upcoming' | 'past') => void
  onMarkSubmitted: (prompt: SubmissionPrompt) => void
  onAddDate: (milestone: MissingMilestone) => void
}

function EmptyState({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <CalendarClock className="mb-4 size-7 text-muted-foreground" aria-hidden />
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

function deadlinesEmptyText(
  browsing: boolean,
  hasSubmissions: boolean,
  range: Props['range']
): string {
  if (browsing) {
    return 'No submission deadlines match these filters.'
  }
  const text =
    range === 'upcoming'
      ? 'No announced deadlines for your tracked conferences yet.'
      : 'No deadlines in the past twelve months.'
  return hasSubmissions
    ? `${text} Papers you marked submitted are on the After submission tab.`
    : text
}

function afterSubmissionEmptyText(hasSubmissions: boolean, range: Props['range']): string {
  if (!hasSubmissions) {
    return 'Mark a paper submitted to follow its rebuttal, decision and camera-ready dates.'
  }
  return range === 'upcoming'
    ? 'No upcoming dates for your submitted papers.'
    : 'No dates in the past twelve months.'
}

/** Splits the schedule into what you submit by and what follows a submission. */
export function ResearchDeadlineSchedule({
  tab,
  range,
  browsing,
  hasSubmissions,
  deadlines,
  afterSubmission,
  prompts,
  missing,
  blockingMessage,
  onTabChange,
  onRangeChange,
  onMarkSubmitted,
  onAddDate,
  ...agendaProps
}: Props): React.JSX.Element {
  const lists: Record<DeadlineCategory, DeadlineEntry[]> = {
    deadline: deadlines,
    'after-submission': afterSubmission
  }
  const renderList = (category: DeadlineCategory, emptyText: string): React.JSX.Element =>
    blockingMessage ? (
      <EmptyState message={blockingMessage} />
    ) : lists[category].length ? (
      <ResearchDeadlineAgenda entries={lists[category]} {...agendaProps} />
    ) : (
      <EmptyState message={emptyText} />
    )
  const nextSteps = (shown: { prompts: SubmissionPrompt[]; missing: MissingMilestone[] }) =>
    range === 'upcoming' ? (
      <ResearchDeadlineNextSteps
        {...shown}
        saving={agendaProps.saving}
        onMarkSubmitted={onMarkSubmitted}
        onAddDate={onAddDate}
      />
    ) : null

  return (
    <Tabs
      value={tab}
      onValueChange={(value) =>
        onTabChange(value === 'after-submission' ? 'after-submission' : 'deadline')
      }
      className="min-h-0 flex-1"
    >
      <div className="flex flex-wrap items-end gap-2 border-b border-border px-6">
        <TabsList variant="line" aria-label="Schedule">
          <TabsTrigger value="deadline">
            Deadlines
            <span className="text-2xs tabular-nums text-muted-foreground">{deadlines.length}</span>
          </TabsTrigger>
          <TabsTrigger value="after-submission">
            After submission
            <span className="text-2xs tabular-nums text-muted-foreground">
              {afterSubmission.length}
            </span>
          </TabsTrigger>
        </TabsList>
        <div className="ml-auto flex flex-wrap items-center gap-2 pb-1.5">
          <ToggleGroup
            type="single"
            variant="outline"
            size="xs"
            value={range}
            onValueChange={(value) =>
              value && onRangeChange(value === 'past' ? 'past' : 'upcoming')
            }
            aria-label="Date range"
          >
            <ToggleGroupItem value="upcoming">Upcoming</ToggleGroupItem>
            <ToggleGroupItem value="past">Past</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      <TabsContent value="deadline" className="scrollbar-sleek min-h-0 overflow-auto px-6 pb-5">
        {browsing ? (
          <p className="pb-1 pt-3 text-xs text-muted-foreground">
            Showing every matching conference; track one to keep it here.
          </p>
        ) : null}
        <div className="pt-3">
          {nextSteps({ prompts, missing: [] })}
          {renderList('deadline', deadlinesEmptyText(browsing, hasSubmissions, range))}
        </div>
      </TabsContent>
      <TabsContent
        value="after-submission"
        className="scrollbar-sleek min-h-0 overflow-auto px-6 pb-5"
      >
        <div className="pt-3">
          {nextSteps({ prompts: [], missing })}
          {missing.length && !afterSubmission.length
            ? null
            : renderList('after-submission', afterSubmissionEmptyText(hasSubmissions, range))}
        </div>
      </TabsContent>
    </Tabs>
  )
}
