import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type {
  ResearchFinding,
  ResearchFindingStatus
} from '../../../../shared/research/research-quality-findings'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { researchErrorText } from './research-error-text'
import { researchFindingsBridge } from './use-research-findings'

const ACTION_LABELS: Partial<Record<ResearchFindingStatus, string>> = {
  accepted: 'Accept',
  dismissed: 'Dismiss',
  open: 'Reopen'
}

/** Accept, Dismiss, or Reopen a finding as the user, with an optional note. */
export function ResearchFindingStatusAction({
  experiment,
  slug,
  finding,
  status,
  onChanged
}: {
  experiment: ExperimentRecord
  slug: string
  finding: ResearchFinding
  status: ResearchFindingStatus
  onChanged: () => Promise<void>
}): React.JSX.Element | null {
  const noteId = useId()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const label = ACTION_LABELS[status]
  const { setStatus } = researchFindingsBridge()
  if (!label || !setStatus) {
    return null
  }

  const submit = async (): Promise<void> => {
    setBusy(true)
    try {
      await setStatus({
        workspacePath: experiment.workspacePath,
        experiment: slug,
        id: finding.id,
        status,
        note: note.trim() || null
      })
      setOpen(false)
      setNote('')
      await onChanged()
    } catch (cause) {
      toast.error(`Couldn't update the finding. ${researchErrorText(cause)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setNote('')
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button size="xs" variant="ghost">
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <form
          className="space-y-2 p-3"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Label htmlFor={noteId}>Note (optional)</Label>
          <Input
            id={noteId}
            density="compact"
            autoFocus
            maxLength={2000}
            value={note}
            placeholder={status === 'dismissed' ? 'Why this is not a problem' : undefined}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="flex justify-end gap-1">
            <Button type="button" size="xs" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="xs" disabled={busy}>
              {label}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
