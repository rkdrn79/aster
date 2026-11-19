import { CheckCircle2, Loader2, Send, Sigma } from 'lucide-react'
import { useSegmentIndicator } from '@/components/ui/segment-indicator'
import { cn } from '@/lib/utils'
import type { RebuttalReviewer } from '../../../../research-harness/research-rebuttal-model.mjs'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'
import { useRebuttalTurns } from './research-rebuttal-turns'
import { reviewerProgress } from './research-rebuttal-view'
import { ResearchProgressBar } from './research-progress-bar'

// Why the selected chip paints its own card: until the rail measures it, there is no slider yet.
const CHIP =
  'relative flex shrink-0 flex-col rounded-xl px-3 py-2 text-left transition-colors duration-(--duration-fast) focus-visible:outline-2 focus-visible:outline-ring data-[state=inactive]:hover:bg-foreground/5 data-[state=active]:bg-raised data-[state=active]:shadow-raised group-data-[segment-indicator]/rail:data-[state=active]:bg-transparent group-data-[segment-indicator]/rail:data-[state=active]:shadow-none'

/** A reviewer ID, or 'general' for the general response, or 'finish' for the finish page. */
export type RebuttalView = string

function ReviewerChip({
  snapshot,
  reviewer,
  selected,
  onSelect
}: {
  snapshot: RebuttalSnapshot
  reviewer: RebuttalReviewer
  selected: boolean
  onSelect: () => void
}): React.JSX.Element {
  const progress = reviewerProgress(snapshot, reviewer.id)
  const working = useRebuttalTurns((state) => state.working[`reviewer:${reviewer.id}`] ?? false)
  const label = reviewer.label?.replace(/^Reviewer\s+/i, '').trim()
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      data-state={selected ? 'active' : 'inactive'}
      className={cn(CHIP, 'min-w-44 gap-2')}
      onClick={onSelect}
    >
      <span className="flex items-center gap-2 text-xs">
        <span className="font-medium">{reviewer.id}</span>
        {label ? <span className="max-w-24 truncate text-muted-foreground">{label}</span> : null}
        {reviewer.rating ? (
          <span
            className="ml-auto text-2xs leading-4 tabular-nums text-muted-foreground"
            title="Score"
          >
            {reviewer.rating}
            {reviewer.confidence ? ` · conf ${reviewer.confidence}` : ''}
          </span>
        ) : null}
      </span>
      <ResearchProgressBar
        role="progressbar"
        aria-label={`${reviewer.id}: ${progress.ready} of ${progress.total} replies ready`}
        aria-valuemin={0}
        aria-valuemax={progress.total || 1}
        aria-valuenow={progress.ready}
        fills={[
          { fraction: progress.total ? progress.drafted / progress.total : 0, tone: 'soft' },
          {
            fraction: progress.total ? progress.ready / progress.total : 0,
            tone: progress.total > 0 && progress.ready === progress.total ? 'success' : 'ink'
          }
        ]}
      />
      <span className="flex items-center gap-2 text-2xs text-muted-foreground tabular-nums">
        <span>
          {progress.ready}/{progress.total} ready
        </span>
        {progress.over ? <span className="text-destructive">over limit</span> : null}
        {progress.waiting ? <span>· {progress.waiting} to review</span> : null}
        {working ? (
          <span
            className="ml-auto inline-flex items-center"
            title={`Simulated ${reviewer.id} is working`}
          >
            <Loader2
              className="size-4 animate-spin"
              aria-label={`Simulated ${reviewer.id} is working`}
            />
          </span>
        ) : progress.total > 0 && progress.ready === progress.total ? (
          <CheckCircle2 className="ml-auto size-4 text-status-success" aria-label="All ready" />
        ) : null}
      </span>
    </button>
  )
}

function ViewChip({
  label,
  detail,
  Icon,
  selected,
  onSelect
}: {
  label: string
  detail: string
  Icon: typeof Sigma
  selected: boolean
  onSelect: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      data-state={selected ? 'active' : 'inactive'}
      className={cn(CHIP, 'min-w-24 justify-center gap-0.5')}
      onClick={onSelect}
    >
      <span className="flex items-center gap-2 text-xs font-medium">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        {label}
      </span>
      <span className="truncate text-2xs text-muted-foreground">{detail}</span>
    </button>
  )
}

/** Reviewers as tabs with where each stands, plus the general response and finishing. */
export function ResearchRebuttalReviewerRail({
  snapshot,
  view,
  onViewChange
}: {
  snapshot: RebuttalSnapshot
  view: RebuttalView
  onViewChange: (view: RebuttalView) => void
}): React.JSX.Element {
  const { meta } = snapshot.bundle
  const totals = meta.reviewers.map((reviewer) => reviewerProgress(snapshot, reviewer.id))
  const ready = totals.reduce((sum, entry) => sum + entry.ready, 0)
  const total = totals.reduce((sum, entry) => sum + entry.total, 0)
  // One raised card slides between reviewers, the general response and Finish.
  const setRail = useSegmentIndicator<HTMLDivElement>('[data-state="active"]', true)
  return (
    <div className="shrink-0 px-4 pt-3 pb-2">
      <div
        ref={setRail}
        role="tablist"
        aria-label="Reviewers"
        className="group/rail scrollbar-none relative flex max-w-full w-fit items-stretch gap-0.5 overflow-x-auto rounded-2xl bg-muted p-1"
      >
        <span
          aria-hidden
          data-slot="segment-indicator"
          className="rounded-xl bg-raised shadow-raised"
        />
        {meta.reviewers.map((reviewer) => (
          <ReviewerChip
            key={reviewer.id}
            snapshot={snapshot}
            reviewer={reviewer}
            selected={view === reviewer.id}
            onSelect={() => onViewChange(reviewer.id)}
          />
        ))}
        <span className="mx-1 my-3 w-px shrink-0 bg-foreground/10" aria-hidden />
        <ViewChip
          label="General"
          detail="Shared response"
          Icon={Sigma}
          selected={view === 'general'}
          onSelect={() => onViewChange('general')}
        />
        <ViewChip
          label="Finish"
          detail={total ? `${ready}/${total} ready` : 'Limits and export'}
          Icon={Send}
          selected={view === 'finish'}
          onSelect={() => onViewChange('finish')}
        />
      </div>
    </div>
  )
}
