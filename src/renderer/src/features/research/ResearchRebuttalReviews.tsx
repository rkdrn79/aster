import { useEffect, useRef, useState } from 'react'
import { ClipboardPaste, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  localPointLabel,
  type RebuttalReviewer
} from '../../../../research-harness/research-rebuttal-model.mjs'
import { reviewerDisplayName } from '../../../../research-harness/research-rebuttal-assemble.mjs'
import {
  POINT_KIND_LABELS,
  POINT_TYPE_LABELS,
  clusterIdByPoint,
  reviewSegments
} from './research-rebuttal-highlights'
import { pointsLostByReviewEdit } from './research-rebuttal-mutations'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

export type ReviewSaveInput = { reviewerId: string | null; text: string; label: string }

type Props = {
  snapshot: RebuttalSnapshot
  readOnly: boolean
  /** A reviewer ID, or null while a new review is being pasted. */
  reviewerId: string | null
  onReviewerChange: (reviewerId: string | null) => void
  selectedClusterId: string | null
  onSelectCluster: (clusterId: string | null) => void
  /** Resolves to an error message, or null once saved. */
  onSaveReview: (input: ReviewSaveInput) => Promise<string | null>
}

export function ResearchRebuttalReviews({
  snapshot,
  readOnly,
  reviewerId,
  onReviewerChange,
  selectedClusterId,
  onSelectCluster,
  onSaveReview
}: Props): React.JSX.Element {
  const { reviewers } = snapshot.bundle.meta
  const [editing, setEditing] = useState(false)
  const reviewer = reviewers.find((entry) => entry.id === reviewerId) ?? null
  const adding = reviewerId === null || reviewers.length === 0
  return (
    <section aria-label="Reviews" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-1.5">
        <div
          role="tablist"
          aria-label="Reviewers"
          className="scrollbar-sleek flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        >
          {reviewers.map((entry) => {
            const count = snapshot.bundle.points.filter((point) => point.reviewer === entry.id)
            return (
              <Button
                key={entry.id}
                role="tab"
                aria-selected={entry.id === reviewerId}
                size="xs"
                variant={entry.id === reviewerId ? 'secondary' : 'ghost'}
                className="shrink-0"
                title={reviewerDisplayName(entry)}
                onClick={() => {
                  setEditing(false)
                  onReviewerChange(entry.id)
                }}
              >
                <span className="font-semibold">{entry.id}</span>
                {entry.label && entry.label !== entry.id ? (
                  <span className="max-w-24 truncate text-muted-foreground">
                    {entry.label.replace(/^Reviewer\s+/i, '')}
                  </span>
                ) : null}
                {count.length ? (
                  <span className="text-3xs text-muted-foreground tabular-nums">
                    {count.length}
                  </span>
                ) : null}
              </Button>
            )
          })}
        </div>
        {readOnly ? null : (
          <Button
            size="xs"
            variant={adding ? 'secondary' : 'ghost'}
            aria-label="Add a review"
            title="Paste another reviewer's review"
            onClick={() => {
              setEditing(false)
              onReviewerChange(null)
            }}
          >
            <Plus aria-hidden />
            {reviewers.length ? null : 'Add review'}
          </Button>
        )}
      </div>
      {adding || editing ? (
        <ReviewForm
          key={adding ? 'new' : reviewer?.id}
          snapshot={snapshot}
          reviewer={adding ? null : reviewer}
          onCancel={reviewers.length ? () => setEditing(false) : null}
          onCancelNew={() => onReviewerChange(reviewers[0]?.id ?? null)}
          onSave={async (input) => {
            const error = await onSaveReview(input)
            if (!error) {
              setEditing(false)
            }
            return error
          }}
        />
      ) : reviewer ? (
        <ReviewText
          snapshot={snapshot}
          reviewer={reviewer}
          readOnly={readOnly}
          selectedClusterId={selectedClusterId}
          onSelectCluster={onSelectCluster}
          onEdit={() => setEditing(true)}
        />
      ) : null}
    </section>
  )
}

function ReviewText({
  snapshot,
  reviewer,
  readOnly,
  selectedClusterId,
  onSelectCluster,
  onEdit
}: {
  snapshot: RebuttalSnapshot
  reviewer: RebuttalReviewer
  readOnly: boolean
  selectedClusterId: string | null
  onSelectCluster: (clusterId: string | null) => void
  onEdit: () => void
}): React.JSX.Element {
  const text = snapshot.reviews[reviewer.id] ?? ''
  const points = snapshot.bundle.points.filter((point) => point.reviewer === reviewer.id)
  const clusterOf = clusterIdByPoint(snapshot.bundle)
  const scroller = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    // Why: picking a cluster elsewhere brings its quote in this review into view.
    scroller.current
      ?.querySelector('[data-active-quote="true"]')
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selectedClusterId, reviewer.id])
  const facts = [
    reviewer.rating ? `Rating ${reviewer.rating}` : null,
    reviewer.confidence ? `Confidence ${reviewer.confidence}` : null,
    `${points.length} ${points.length === 1 ? 'point' : 'points'}`,
    reviewer.source === 'openreview' ? 'OpenReview' : null
  ].filter(Boolean)
  return (
    <>
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3 pb-1">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{reviewerDisplayName(reviewer)}</p>
          <p className="truncate text-xs text-muted-foreground">{facts.join(' · ')}</p>
        </div>
        {readOnly ? null : (
          <Button size="xs" variant="ghost" onClick={onEdit}>
            <Pencil aria-hidden /> Edit
          </Button>
        )}
      </div>
      <div
        ref={scroller}
        data-testid="rebuttal-review-text"
        className="scrollbar-sleek min-h-0 flex-1 overflow-auto px-4 pt-2 pb-8 text-sm leading-6 whitespace-pre-wrap break-words"
      >
        {reviewSegments(text, points).map((segment) => {
          if (segment.points.length === 0) {
            return <span key={segment.start}>{segment.text}</span>
          }
          const clusters = segment.points.map((point) => clusterOf.get(point.id) ?? null)
          const active = selectedClusterId !== null && clusters.includes(selectedClusterId)
          const clustered = clusters.some(Boolean)
          return (
            <span key={segment.start}>
              {segment.starting.map((point) => {
                const clusterId = clusterOf.get(point.id) ?? null
                return (
                  <button
                    key={point.id}
                    type="button"
                    className={cn(
                      'mr-0.5 inline-flex h-4 items-center rounded-sm px-1 align-[1px] font-mono text-3xs leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      clusterId && clusterId === selectedClusterId
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                    title={`${point.id} · ${POINT_KIND_LABELS[point.kind]} · ${POINT_TYPE_LABELS[point.type]}${clusterId ? ` → ${clusterId}` : ' · not grouped yet'}${point.summary ? `\n${point.summary}` : ''}`}
                    aria-label={`${point.id}${point.summary ? `: ${point.summary}` : ''}`}
                    onClick={() => onSelectCluster(clusterId)}
                  >
                    {localPointLabel(point.id)}
                  </button>
                )
              })}
              <mark
                data-active-quote={active ? 'true' : undefined}
                data-point-ids={segment.points.map((point) => point.id).join(' ')}
                className={cn(
                  'rounded-sm text-foreground transition-colors',
                  active
                    ? 'bg-annotation-highlight/55'
                    : clustered
                      ? 'bg-annotation-highlight/20'
                      : 'bg-transparent underline decoration-muted-foreground/60 decoration-dotted underline-offset-4'
                )}
              >
                {segment.text}
              </mark>
            </span>
          )
        })}
        {text ? null : <p className="text-muted-foreground">This review has no text yet.</p>}
      </div>
    </>
  )
}

function ReviewForm({
  snapshot,
  reviewer,
  onCancel,
  onCancelNew,
  onSave
}: {
  snapshot: RebuttalSnapshot
  reviewer: RebuttalReviewer | null
  onCancel: (() => void) | null
  onCancelNew: () => void
  onSave: (input: ReviewSaveInput) => Promise<string | null>
}): React.JSX.Element {
  const [label, setLabel] = useState(reviewer?.label ?? '')
  const [text, setText] = useState(reviewer ? (snapshot.reviews[reviewer.id] ?? '') : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lost = reviewer ? pointsLostByReviewEdit(snapshot, reviewer.id, text) : []

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setSaving(true)
    setError(await onSave({ reviewerId: reviewer?.id ?? null, text, label }))
    setSaving(false)
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-3 p-4"
      onSubmit={(event) => void submit(event)}
    >
      <div className="space-y-1.5">
        <Label htmlFor="rebuttal-reviewer-label">Reviewer</Label>
        <Input
          id="rebuttal-reviewer-label"
          value={label}
          maxLength={120}
          placeholder={reviewer ? reviewer.id : 'e.g. Reviewer Xy12 (optional)'}
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <Label htmlFor="rebuttal-review-text">Review</Label>
        <Textarea
          id="rebuttal-review-text"
          value={text}
          className="min-h-40 flex-1 resize-none"
          placeholder="Paste the full review: summary, strengths, weaknesses, questions…"
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      {lost.length ? (
        <p className="text-xs text-status-warning">
          Saving drops {lost.map((point) => point.id).join(', ')}: their quotes are no longer in the
          text.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        {reviewer && onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : snapshot.bundle.meta.reviewers.length ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancelNew}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={saving || !text.trim()}>
          <ClipboardPaste aria-hidden />
          {saving ? 'Saving…' : reviewer ? 'Save review' : 'Add review'}
        </Button>
      </div>
    </form>
  )
}
