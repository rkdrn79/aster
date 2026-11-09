import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { RebuttalReviewer } from '../../../../research-harness/research-rebuttal-model.mjs'
import { ResearchRebuttalReviewForm, type ReviewSaveInput } from './ResearchRebuttalReviewForm'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

/** Adding a reviewer later, or correcting one reviewer's text or score. */
export function ResearchRebuttalReviewDialog({
  snapshot,
  mode,
  reviewer,
  onOpenChange,
  onSave
}: {
  snapshot: RebuttalSnapshot
  mode: 'add' | 'edit' | null
  reviewer: RebuttalReviewer | null
  onOpenChange: (open: boolean) => void
  onSave: (input: ReviewSaveInput) => Promise<string | null>
}): React.JSX.Element {
  const editing = mode === 'edit'
  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Edit ${reviewer?.id ?? 'review'}` : 'Add a reviewer'}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? 'Concerns whose quote is no longer in the text are dropped.'
              : 'Paste the review, or load it from a text file.'}
          </DialogDescription>
        </DialogHeader>
        <ResearchRebuttalReviewForm
          key={editing ? reviewer?.id : 'new'}
          snapshot={snapshot}
          reviewer={editing ? reviewer : null}
          submitLabel={editing ? 'Save review' : 'Add review'}
          onCancel={() => onOpenChange(false)}
          onSave={onSave}
        />
      </DialogContent>
    </Dialog>
  )
}
