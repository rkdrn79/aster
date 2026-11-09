import { useState } from 'react'
import { MessageSquareReply } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ResearchRebuttalOpenReviewForm } from './ResearchRebuttalOpenReviewDialog'
import { ResearchRebuttalReviewForm, type ReviewSaveInput } from './ResearchRebuttalReviewForm'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

type Source = 'openreview' | 'paste'

type Props = {
  snapshot: RebuttalSnapshot
  readOnly: boolean
  /** Resolves to an error message, or null once saved. */
  onSaveReview: (input: ReviewSaveInput) => Promise<string | null>
  onImported: (reviewerId: string) => void
}

/** The page's first step: reviews come in once, from OpenReview, a paste, or a file. */
export function ResearchRebuttalFirstStep({
  snapshot,
  readOnly,
  onSaveReview,
  onImported
}: Props): React.JSX.Element {
  const [source, setSource] = useState<Source>('openreview')
  const added = snapshot.bundle.meta.reviewers.length
  return (
    <div className="scrollbar-sleek flex min-h-0 flex-1 justify-center overflow-y-auto p-6">
      <section aria-label="Import reviews" className="w-full max-w-2xl space-y-4 py-4">
        <div>
          <MessageSquareReply className="mb-2 size-5 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">Bring in your reviews</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You do this once. Reviewers then get their own page, with their concerns next to your
            replies. Later comments from a reviewer come in as new rounds on that reviewer.
          </p>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={source}
          aria-label="How to bring in reviews"
          onValueChange={(value) => {
            if (value === 'openreview' || value === 'paste') {
              setSource(value)
            }
          }}
        >
          <ToggleGroupItem value="openreview">From OpenReview</ToggleGroupItem>
          <ToggleGroupItem value="paste">Paste or load a file</ToggleGroupItem>
        </ToggleGroup>
        <div
          className={`flex flex-col rounded-lg border border-border bg-card p-4 ${source === 'paste' ? 'min-h-96' : ''}`}
        >
          {readOnly ? (
            <p className="text-sm text-muted-foreground">
              These files need fixing before reviews can be added.
            </p>
          ) : source === 'openreview' ? (
            <ResearchRebuttalOpenReviewForm snapshot={snapshot} onImported={onImported} />
          ) : (
            <ResearchRebuttalReviewForm
              snapshot={snapshot}
              reviewer={null}
              onSave={onSaveReview}
              submitLabel={added ? 'Add this review' : 'Add review'}
            />
          )}
        </div>
      </section>
    </div>
  )
}
