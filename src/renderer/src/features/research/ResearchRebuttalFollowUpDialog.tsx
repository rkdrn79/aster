import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { reviewerDisplayName } from '../../../../research-harness/research-rebuttal-assemble.mjs'
import type { RebuttalReviewer } from '../../../../research-harness/research-rebuttal-model.mjs'

type Props = {
  reviewer: RebuttalReviewer
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Resolves to an error message, or null once saved. */
  onAdd: (text: string) => Promise<string | null>
}

/** A reviewer's later reply during discussion, attached to them as a new round. */
export function ResearchRebuttalFollowUpDialog({
  reviewer,
  open,
  onOpenChange,
  onAdd
}: Props): React.JSX.Element {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = reviewerDisplayName(reviewer)

  async function save(): Promise<void> {
    setSaving(true)
    const failure = await onAdd(text)
    setSaving(false)
    setError(failure)
    if (!failure) {
      setText('')
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New round from {name}</DialogTitle>
          <DialogDescription>
            Paste what {name} wrote during discussion. It becomes a new round under this reviewer,
            with its own reply and character limit.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label="Follow-up text"
          value={text}
          rows={8}
          autoFocus
          placeholder="Thanks for the response. However, …"
          onChange={(event) => setText(event.target.value)}
        />
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving || !text.trim()} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Add round'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
