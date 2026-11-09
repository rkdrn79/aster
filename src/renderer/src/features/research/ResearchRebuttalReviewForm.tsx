import { useRef, useState } from 'react'
import { ClipboardPaste, FileUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { RebuttalReviewer } from '../../../../research-harness/research-rebuttal-model.mjs'
import { pointsLostByReviewEdit } from './research-rebuttal-mutations'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

export type ReviewSaveInput = {
  reviewerId: string | null
  text: string
  label: string
  rating: string | null
  confidence: string | null
}

type Props = {
  snapshot: RebuttalSnapshot
  reviewer: RebuttalReviewer | null
  /** Omitted while there is nothing to go back to. */
  onCancel?: () => void
  /** Resolves to an error message, or null once saved. */
  onSave: (input: ReviewSaveInput) => Promise<string | null>
  /** Words on the save button. */
  submitLabel: string
}

/** Paste a review or load it from a text file; the score and confidence feed the simulated reviewer. */
export function ResearchRebuttalReviewForm({
  snapshot,
  reviewer,
  onCancel,
  onSave,
  submitLabel
}: Props): React.JSX.Element {
  const [label, setLabel] = useState(reviewer?.label ?? '')
  const [rating, setRating] = useState(reviewer?.rating ?? '')
  const [confidence, setConfidence] = useState(reviewer?.confidence ?? '')
  const [text, setText] = useState(reviewer ? (snapshot.reviews[reviewer.id] ?? '') : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const lost = reviewer ? pointsLostByReviewEdit(snapshot, reviewer.id, text) : []

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setSaving(true)
    const failure = await onSave({
      reviewerId: reviewer?.id ?? null,
      text,
      label,
      rating: rating.trim() || null,
      confidence: confidence.trim() || null
    })
    setSaving(false)
    setError(failure)
    if (!failure && !reviewer) {
      setLabel('')
      setRating('')
      setConfidence('')
      setText('')
    }
  }

  async function loadFile(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    try {
      setText(await file.text())
      setError(null)
    } catch (cause) {
      setError(`That file could not be read. ${String(cause)}`)
    }
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col gap-3" onSubmit={(event) => void submit(event)}>
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="rebuttal-reviewer-label">Reviewer</Label>
          <Input
            id="rebuttal-reviewer-label"
            value={label}
            maxLength={120}
            placeholder={reviewer ? reviewer.id : 'e.g. Reviewer Xy12 (optional)'}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="rebuttal-reviewer-score">Score</Label>
          <Input
            id="rebuttal-reviewer-score"
            value={rating}
            maxLength={120}
            placeholder="e.g. 5"
            onChange={(event) => setRating(event.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="rebuttal-reviewer-confidence">Confidence</Label>
          <Input
            id="rebuttal-reviewer-confidence"
            value={confidence}
            maxLength={120}
            placeholder="e.g. 4"
            onChange={(event) => setConfidence(event.target.value)}
          />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="rebuttal-review-text">Review</Label>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => fileInput.current?.click()}
          >
            <FileUp aria-hidden /> Load a file
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".txt,.md,.markdown,.text"
            className="hidden"
            aria-label="Load a review file"
            onChange={(event) => void loadFile(event)}
          />
        </div>
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
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={saving || !text.trim()}>
          <ClipboardPaste aria-hidden />
          {saving ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
