import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { OpenReviewForumReviews } from '../../../../shared/research/openreview-reviews'
import { researchErrorText } from './research-error-text'
import { saveRebuttalReview, updateRebuttalMeta } from './research-rebuttal-mutations'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

type FormProps = {
  snapshot: RebuttalSnapshot
  /** The reviewer ID of the first imported review, to show it. */
  onImported: (reviewerId: string) => void
  /** Footer shown to the left of Import, e.g. a Cancel button. */
  extraActions?: React.ReactNode
}

/** Reviews of an OpenReview forum fetched by the desktop app; each becomes or updates a reviewer. */
export function ResearchRebuttalOpenReviewForm({
  snapshot,
  onImported,
  extraActions
}: FormProps): React.JSX.Element {
  const api = window.api?.researchOpenReview
  const { meta } = snapshot.bundle
  const [forum, setForum] = useState(meta.forum ?? '')
  const [result, setResult] = useState<OpenReviewForumReviews | null>(null)
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState<'fetch' | 'import' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const importedAs = new Map(
    meta.reviewers.flatMap((reviewer) => (reviewer.noteId ? [[reviewer.noteId, reviewer.id]] : []))
  )

  async function fetchReviews(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (!api || !forum.trim()) {
      return
    }
    setBusy('fetch')
    setError(null)
    try {
      const fetched = await api.fetchForum({ forum })
      setResult(fetched)
      setChosen(
        new Set(
          fetched.reviews.filter((review) => !importedAs.has(review.noteId)).map((r) => r.noteId)
        )
      )
    } catch (cause) {
      setResult(null)
      setError(researchErrorText(cause))
    } finally {
      setBusy(null)
    }
  }

  async function importReviews(): Promise<void> {
    if (!result) {
      return
    }
    setBusy('import')
    setError(null)
    try {
      let first: string | null = null
      for (const review of result.reviews.filter((entry) => chosen.has(entry.noteId))) {
        const id = await saveRebuttalReview(snapshot.owner, {
          reviewerId: importedAs.get(review.noteId) ?? null,
          text: review.text,
          label: review.label,
          rating: review.rating,
          confidence: review.confidence,
          source: 'openreview',
          noteId: review.noteId
        })
        first ??= id
      }
      await updateRebuttalMeta(snapshot.owner, (current) => ({
        ...current,
        forum: result.forum,
        venue: current.venue || result.venue || ''
      }))
      if (first) {
        onImported(first)
      }
    } catch (cause) {
      setError(researchErrorText(cause))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      {api ? (
        <form className="flex gap-2" onSubmit={(event) => void fetchReviews(event)}>
          <Input
            aria-label="OpenReview forum"
            autoFocus
            value={forum}
            placeholder="https://openreview.net/forum?id=…"
            onChange={(event) => setForum(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={busy !== null || !forum.trim()}>
            {busy === 'fetch' ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Fetch reviews
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          Importing from OpenReview needs the desktop app. Paste each review instead.
        </p>
      )}
      {result ? (
        result.reviews.length ? (
          <div className="space-y-2">
            {result.title ? (
              <p className="truncate text-sm font-medium" title={result.title}>
                {result.title}
              </p>
            ) : null}
            <ul className="scrollbar-sleek max-h-72 divide-y divide-border overflow-auto rounded-lg border border-border">
              {result.reviews.map((review) => (
                <li key={review.noteId} className="flex items-start gap-2.5 px-3 py-2">
                  <Checkbox
                    className="mt-0.5"
                    checked={chosen.has(review.noteId)}
                    aria-label={`Import ${review.label}`}
                    onCheckedChange={(checked) =>
                      setChosen((current) => {
                        const next = new Set(current)
                        if (checked === true) {
                          next.add(review.noteId)
                        } else {
                          next.delete(review.noteId)
                        }
                        return next
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      {review.label}
                      <span className="text-xs text-muted-foreground">
                        {review.rating ? ` · Rating ${review.rating}` : ''}
                        {review.confidence ? ` · Confidence ${review.confidence}` : ''}
                        {importedAs.has(review.noteId)
                          ? ` · imported as ${importedAs.get(review.noteId)}`
                          : ''}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {review.text.replace(/\s+/g, ' ').slice(0, 160)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            No reviews are public on this forum. During the author response period OpenReview shows
            reviews only to signed-in authors, and Aster cannot sign in to OpenReview yet: copy each
            review from the forum and paste it instead.
          </p>
        )
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        {extraActions}
        {result?.reviews.length ? (
          <Button
            disabled={busy !== null || chosen.size === 0}
            onClick={() => void importReviews()}
          >
            {busy === 'import'
              ? 'Importing…'
              : `Import ${chosen.size || ''} ${chosen.size === 1 ? 'review' : 'reviews'}`.replace(
                  /\s+/g,
                  ' '
                )}
          </Button>
        ) : null}
      </DialogFooter>
    </>
  )
}

type DialogProps = {
  snapshot: RebuttalSnapshot
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: (reviewerId: string) => void
}

/** Importing again later; the first import happens on the page itself. */
export function ResearchRebuttalOpenReviewDialog({
  snapshot,
  open,
  onOpenChange,
  onImported
}: DialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import from OpenReview</DialogTitle>
          <DialogDescription>
            Paste the forum link of your paper. Public reviews come in as reviewers R1, R2, …;
            importing again updates the reviews that changed.
          </DialogDescription>
        </DialogHeader>
        <ResearchRebuttalOpenReviewForm
          snapshot={snapshot}
          onImported={(id) => {
            onImported(id)
            onOpenChange(false)
          }}
          extraActions={
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          }
        />
      </DialogContent>
    </Dialog>
  )
}
