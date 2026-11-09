import { CheckCircle2, Loader2, Send, Sigma } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RebuttalReviewer } from '../../../../research-harness/research-rebuttal-model.mjs'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'
import { useRebuttalTurns } from './research-rebuttal-turns'
import { reviewerProgress } from './research-rebuttal-view'

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
      className={cn(
        'flex min-w-40 shrink-0 flex-col gap-1 rounded-md border px-2.5 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring',
        selected ? 'border-ring/60 bg-card shadow-xs' : 'border-transparent hover:bg-accent'
      )}
      onClick={onSelect}
    >
      <span className="flex items-center gap-1.5 text-xs">
        <span className="font-semibold">{reviewer.id}</span>
        {label ? <span className="max-w-24 truncate text-muted-foreground">{label}</span> : null}
        {reviewer.rating ? (
          <span className="ml-auto tabular-nums text-muted-foreground" title="Score">
            {reviewer.rating}
            {reviewer.confidence ? ` · conf ${reviewer.confidence}` : ''}
          </span>
        ) : null}
      </span>
      <span
        role="progressbar"
        aria-label={`${reviewer.id}: ${progress.ready} of ${progress.total} replies ready`}
        aria-valuemin={0}
        aria-valuemax={progress.total || 1}
        aria-valuenow={progress.ready}
        className="flex h-1 gap-px overflow-hidden rounded-full bg-muted"
      >
        <span
          className="h-full bg-foreground/70"
          style={{ width: `${progress.total ? (progress.ready / progress.total) * 100 : 0}%` }}
        />
        <span
          className="h-full bg-foreground/25"
          style={{
            width: `${progress.total ? ((progress.drafted - progress.ready) / progress.total) * 100 : 0}%`
          }}
        />
      </span>
      <span className="flex items-center gap-1.5 text-2xs text-muted-foreground tabular-nums">
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
              className="size-3 animate-spin"
              aria-label={`Simulated ${reviewer.id} is working`}
            />
          </span>
        ) : progress.total > 0 && progress.ready === progress.total ? (
          <CheckCircle2 className="ml-auto size-3 text-status-success" aria-label="All ready" />
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
      className={cn(
        'flex min-w-24 shrink-0 flex-col justify-center gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring',
        selected ? 'border-ring/60 bg-card shadow-xs' : 'border-transparent hover:bg-accent'
      )}
      onClick={onSelect}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold">
        <Icon className="size-3 text-muted-foreground" aria-hidden />
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
  return (
    <div
      role="tablist"
      aria-label="Reviewers"
      className="scrollbar-sleek flex shrink-0 items-stretch gap-1 overflow-x-auto border-b border-border px-3 py-1.5"
    >
      {meta.reviewers.map((reviewer) => (
        <ReviewerChip
          key={reviewer.id}
          snapshot={snapshot}
          reviewer={reviewer}
          selected={view === reviewer.id}
          onSelect={() => onViewChange(reviewer.id)}
        />
      ))}
      <span className="my-1 w-px shrink-0 bg-border" aria-hidden />
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
  )
}
