import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import {
  localPointLabel,
  type RebuttalPoint,
  type RebuttalReviewer
} from '../../../../research-harness/research-rebuttal-model.mjs'
import { reviewerDisplayName } from '../../../../research-harness/research-rebuttal-assemble.mjs'
import {
  POINT_KIND_LABELS,
  POINT_TYPE_LABELS,
  reviewSegments
} from './research-rebuttal-highlights'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'
import type { RebuttalActions } from './use-research-rebuttal-actions'

type PendingConcern = { quote: string; round: number; x: number; y: number }

function ReviewBlock({
  text,
  points
}: {
  text: string
  points: RebuttalPoint[]
}): React.JSX.Element {
  return (
    <>
      {reviewSegments(text, points).map((segment) => {
        if (segment.points.length === 0) {
          return <span key={segment.start}>{segment.text}</span>
        }
        return (
          <span key={segment.start}>
            {segment.starting.map((point) => (
              <button
                key={point.id}
                type="button"
                className="mr-0.5 inline-flex h-4 items-center rounded-sm bg-muted px-1 align-[1px] font-mono text-3xs leading-none text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                title={`${point.id} · ${POINT_KIND_LABELS[point.kind]} · ${POINT_TYPE_LABELS[point.type]}${point.summary ? `\n${point.summary}` : ''}`}
                aria-label={`Show ${point.id}`}
                onClick={() => {
                  document
                    .querySelector(`[data-answer-points~="${point.id}"]`)
                    ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                }}
              >
                {localPointLabel(point.id)}
              </button>
            ))}
            <mark className="rounded-sm bg-annotation-highlight/20 text-foreground">
              {segment.text}
            </mark>
          </span>
        )
      })}
    </>
  )
}

/** The review as written, with its concerns highlighted; select a sentence to add one by hand. */
export function ResearchRebuttalReviewPane({
  snapshot,
  reviewer,
  readOnly,
  actions
}: {
  snapshot: RebuttalSnapshot
  reviewer: RebuttalReviewer
  readOnly: boolean
  actions: RebuttalActions
}): React.JSX.Element {
  const scroller = useRef<HTMLDivElement | null>(null)
  const [pending, setPending] = useState<PendingConcern | null>(null)
  const [error, setError] = useState<string | null>(null)
  const text = snapshot.reviews[reviewer.id] ?? ''
  const reviewPoints = snapshot.bundle.points.filter(
    (point) => point.reviewer === reviewer.id && point.origin === 'review'
  )
  const followUps = snapshot.followUps.filter((entry) => entry.reviewer === reviewer.id)
  const facts = [
    reviewer.rating ? `Score ${reviewer.rating}` : null,
    reviewer.confidence ? `Confidence ${reviewer.confidence}` : null,
    `${reviewPoints.length} ${reviewPoints.length === 1 ? 'concern' : 'concerns'}`
  ].filter(Boolean)

  function capture(): void {
    const selection = window.getSelection()
    const quote = selection?.toString().trim()
    if (!selection || selection.isCollapsed || !quote || readOnly) {
      return
    }
    const anchor = selection.getRangeAt(0).startContainer.parentElement
    const block = anchor?.closest('[data-review-round]')
    if (!block || !scroller.current?.contains(block)) {
      return
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect()
    setPending({
      quote,
      round: Number(block.getAttribute('data-review-round')) || 1,
      x: Math.min(rect.left, window.innerWidth - 300),
      y: rect.bottom + 6
    })
  }

  useEffect(() => {
    if (!pending) {
      return
    }
    const clear = (event: MouseEvent): void => {
      if (!(event.target instanceof HTMLElement && event.target.closest('[data-add-concern]'))) {
        setPending(null)
      }
    }
    document.addEventListener('mousedown', clear)
    return () => document.removeEventListener('mousedown', clear)
  }, [pending])

  async function add(kind: 'weakness' | 'question' | 'minor'): Promise<void> {
    if (!pending) {
      return
    }
    const failure = await actions.addConcern({
      reviewerId: reviewer.id,
      round: pending.round,
      quote: pending.quote,
      summary: '',
      kind
    })
    setError(failure)
    setPending(null)
    window.getSelection()?.removeAllRanges()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <p className="min-w-0 flex-1 truncate text-xs font-semibold">
          {reviewerDisplayName(reviewer)}
          <span className="ml-2 font-normal text-muted-foreground">{facts.join(' · ')}</span>
        </p>
      </div>
      <div
        ref={scroller}
        data-testid="rebuttal-review-text"
        onMouseUp={capture}
        className="scrollbar-sleek min-h-0 flex-1 space-y-4 overflow-auto px-4 pt-3 pb-8 text-sm leading-6 whitespace-pre-wrap break-words"
      >
        <div data-review-round="1">
          <ReviewBlock text={text} points={reviewPoints.filter((point) => point.round === 1)} />
          {text ? null : <p className="text-muted-foreground">This review has no text yet.</p>}
        </div>
        {followUps.map((followUp) => (
          <div
            key={followUp.round}
            data-review-round={followUp.round}
            className="border-t border-border pt-3"
          >
            <p className="mb-1 text-xs font-medium text-muted-foreground">Round {followUp.round}</p>
            <ReviewBlock
              text={followUp.text}
              points={reviewPoints.filter((point) => point.round === followUp.round)}
            />
          </div>
        ))}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      {pending
        ? createPortal(
            <div
              data-add-concern=""
              role="dialog"
              aria-label="Add the selected text as a concern"
              className="fixed z-[100] flex items-center gap-1 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
              style={{ left: pending.x, top: pending.y }}
            >
              <span className="px-1.5 text-2xs text-muted-foreground">Add as</span>
              {(['weakness', 'question', 'minor'] as const).map((kind) => (
                <Button
                  key={kind}
                  size="xs"
                  variant="ghost"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void add(kind)}
                >
                  {POINT_KIND_LABELS[kind]}
                </Button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
