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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DEFAULT_REPLY_CHAR_LIMIT } from '../../../../research-harness/research-rebuttal-model.mjs'

export type NewRebuttalInput = { name: string; venue: string; replyChars: number }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Resolves to an error message, or null once created. */
  onCreate: (input: NewRebuttalInput) => Promise<string | null>
}

export function ResearchRebuttalNewDialog({
  open,
  onOpenChange,
  onCreate
}: Props): React.JSX.Element {
  const [name, setName] = useState('')
  const [venue, setVenue] = useState('')
  const [limit, setLimit] = useState(String(DEFAULT_REPLY_CHAR_LIMIT))
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const replyChars = Number(limit)
  const validLimit = Number.isInteger(replyChars) && replyChars >= 200 && replyChars <= 100_000

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (!name.trim() || !validLimit) {
      return
    }
    setCreating(true)
    const failure = await onCreate({ name: name.trim(), venue: venue.trim(), replyChars })
    setCreating(false)
    setError(failure)
    if (!failure) {
      setName('')
      setVenue('')
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New rebuttal</DialogTitle>
          <DialogDescription>
            One rebuttal per venue round. Its files live in the project under .aster/rebuttal/, so
            the agent works on the same reviews and drafts.
          </DialogDescription>
        </DialogHeader>
        <form id="rebuttal-new-form" className="space-y-3" onSubmit={(event) => void submit(event)}>
          <div className="space-y-1.5">
            <Label htmlFor="rebuttal-new-name">Name</Label>
            <Input
              id="rebuttal-new-name"
              autoFocus
              value={name}
              maxLength={160}
              placeholder="e.g. ICLR 2027 rebuttal"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rebuttal-new-venue">Venue</Label>
              <Input
                id="rebuttal-new-venue"
                value={venue}
                maxLength={160}
                placeholder="e.g. ICLR 2027"
                onChange={(event) => setVenue(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rebuttal-new-limit">Reply limit</Label>
              <Input
                id="rebuttal-new-limit"
                type="number"
                min={200}
                max={100000}
                step={100}
                value={limit}
                aria-invalid={!validLimit}
                onChange={(event) => setLimit(event.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Characters per reviewer reply. OpenReview venues usually allow 5,000.
          </p>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="rebuttal-new-form"
            disabled={creating || !name.trim() || !validLimit}
          >
            {creating ? 'Creating…' : 'Create rebuttal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
