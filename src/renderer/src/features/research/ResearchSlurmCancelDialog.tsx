import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { ResearchComputeJobEntry } from './research-compute-usage'
import { isRunningSlurmState } from './research-compute-usage'

function CancelDialogBody({
  entry,
  dial,
  onClose,
  onCancelled
}: {
  entry: ResearchComputeJobEntry
  dial: boolean
  onClose: () => void
  onCancelled: (targetId: string) => void
}): React.JSX.Element {
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { job, hostLabel, targetId } = entry
  const running = isRunningSlurmState(job.state)

  async function cancel(): Promise<void> {
    setCancelling(true)
    setError(null)
    try {
      const result = await window.api.researchCompute.cancelJob({
        targetId,
        jobId: job.jobId,
        dial
      })
      if (!result.ok) {
        setError(result.message)
        setCancelling(false)
        return
      }
      toast.success(`Cancel requested for job ${job.jobId} on ${hostLabel}`)
      onCancelled(targetId)
      onClose()
    } catch (cause) {
      setError(String(cause))
      setCancelling(false)
    }
  }

  return (
    <DialogContent size="compact">
      <DialogHeader>
        <DialogTitle>Cancel job {job.jobId}?</DialogTitle>
        <DialogDescription>
          {job.name} on {hostLabel} ·{' '}
          {running
            ? 'It is running. scancel stops it now, and work it has not saved is lost.'
            : 'It leaves the queue and will not start.'}
        </DialogDescription>
      </DialogHeader>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={cancelling}>
          Keep job
        </Button>
        <Button variant="destructive" onClick={() => void cancel()} disabled={cancelling}>
          {cancelling ? 'Cancelling…' : 'Cancel job'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

export function ResearchSlurmCancelDialog({
  entry,
  onClose,
  ...props
}: {
  entry: ResearchComputeJobEntry | null
  dial: boolean
  onClose: () => void
  onCancelled: (targetId: string) => void
}): React.JSX.Element {
  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      {entry ? (
        <CancelDialogBody
          key={`${entry.targetId}:${entry.job.jobId}`}
          entry={entry}
          onClose={onClose}
          {...props}
        />
      ) : null}
    </Dialog>
  )
}
