import { Button } from '@/components/ui/button'
import { SAMPLE_RATING_FILTERS, type SampleRatingFilter } from './research-sample-rating-index'
import { PairwiseRatingSummary, SingleRatingSummary } from './research-sample-rating-panel'
import type { RatingMode, SampleRatingSession } from './research-sample-rating-session'

const MODES: { value: RatingMode; label: string }[] = [
  { value: 'view', label: 'Side by side' },
  { value: 'single', label: 'Rate each' },
  { value: 'ab', label: 'A/B' }
]
const FILTER_LABELS: Record<SampleRatingFilter, string> = {
  all: 'All',
  unrated: 'Unrated by me',
  disagreements: 'User–agent disagreements',
  bad: 'Rated bad'
}

/** Mode, A/B pair and blind switch, sample filters, and the rating summary with n. */
export function SampleRatingToolbar({
  session
}: {
  session: SampleRatingSession
}): React.JSX.Element {
  const { activeMode, pair, ratable, ratings } = session
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Mode</span>
        {MODES.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={activeMode === option.value ? 'secondary' : 'outline'}
            aria-pressed={activeMode === option.value}
            disabled={
              (option.value === 'single' && !ratable.length) ||
              (option.value === 'ab' && !session.candidate)
            }
            onClick={() => session.setMode(option.value)}
          >
            {option.label}
          </Button>
        ))}
        {pair ? (
          <>
            <label className="ml-2 text-sm text-muted-foreground" htmlFor="rating-candidate">
              B
            </label>
            <select
              id="rating-candidate"
              value={pair.candidate.run.id}
              onChange={(event) => session.setCandidateId(event.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              {session.candidates.map((entry) => (
                <option key={entry.run.id} value={entry.run.id}>
                  {entry.run.name}
                </option>
              ))}
            </select>
            <span className="text-sm text-muted-foreground">
              against A: {pair.baseline.run.name}
            </span>
            <Button
              size="sm"
              variant={session.blind ? 'secondary' : 'outline'}
              aria-pressed={session.blind}
              onClick={() => session.setBlind((value) => !value)}
            >
              Blind
            </Button>
          </>
        ) : null}
      </div>
      {!ratable.length ? (
        <p className="text-xs text-muted-foreground">
          Rating needs Runs from a local research/ catalog project; these Runs stay side by side.
        </p>
      ) : pair && pair.baseline.run.id !== session.baselineRunId ? (
        <p className="text-xs text-muted-foreground">
          The baseline is not a catalog Run, so A is {pair.baseline.run.name}.
        </p>
      ) : null}
      {session.scope ? (
        <>
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-sm text-muted-foreground">Show</span>
            {SAMPLE_RATING_FILTERS.map((value) => (
              <Button
                key={value}
                size="xs"
                variant={session.filter === value ? 'secondary' : 'ghost'}
                aria-pressed={session.filter === value}
                onClick={() => session.setFilter(value)}
              >
                {FILTER_LABELS[value]}
              </Button>
            ))}
          </div>
          {pair ? (
            <PairwiseRatingSummary
              summary={ratings.summaries.ab ?? null}
              candidateName={pair.candidate.run.name}
              baselineName={pair.baseline.run.name}
            />
          ) : (
            <SingleRatingSummary
              rows={ratable.map((entry) => ({
                ref: entry.ref,
                name: entry.run.name,
                summary: ratings.summaries[entry.ref] ?? null
              }))}
            />
          )}
          {ratings.error ? (
            <p role="alert" className="text-xs text-destructive">
              Ratings unavailable: {ratings.error}
            </p>
          ) : null}
        </>
      ) : null}
    </>
  )
}
