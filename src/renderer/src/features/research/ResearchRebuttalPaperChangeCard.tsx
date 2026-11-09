import { useState } from 'react'
import { Check, ExternalLink, FilePenLine, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RebuttalPaperChange } from '../../../../research-harness/research-rebuttal-records.mjs'
import { RebuttalDiff } from './ResearchRebuttalProposalCard'

type Props = {
  change: RebuttalPaperChange
  readOnly: boolean
  /** Each resolves to an error message, or null once done. */
  onApprove: () => Promise<string | null>
  onReject: () => Promise<string | null>
  onOpen: (() => void) | null
}

/** A manuscript edit an agent proposed for a concern, applied only after the person approves. */
export function ResearchRebuttalPaperChangeCard({
  change,
  readOnly,
  onApprove,
  onReject,
  onOpen
}: Props): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(task: () => Promise<string | null>): Promise<void> {
    setBusy(true)
    setError(await task())
    setBusy(false)
  }

  const settled =
    change.status === 'applied'
      ? 'Applied to the paper'
      : change.status === 'rejected'
        ? 'Rejected'
        : null
  return (
    <section
      aria-label={`Paper change ${change.id}`}
      className="space-y-2 rounded-md border border-border bg-muted/40 p-2.5"
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <FilePenLine className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="font-medium">Paper change</span>
        <span
          className="min-w-0 truncate font-mono text-2xs text-muted-foreground"
          title={change.file}
        >
          {change.file}
        </span>
        {settled ? <span className="ml-auto text-2xs text-muted-foreground">{settled}</span> : null}
        {change.promise ? (
          <span className="rounded-sm bg-muted px-1 py-px font-mono text-3xs text-muted-foreground">
            {change.promise}
          </span>
        ) : null}
      </header>
      <RebuttalDiff before={change.find} after={change.replace} />
      <p className="text-xs leading-5 text-muted-foreground">{change.why}</p>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {change.status === 'pending' && !readOnly ? (
        <div className="flex items-center justify-end gap-1.5">
          <Button size="xs" variant="ghost" disabled={busy} onClick={() => void run(onReject)}>
            <X aria-hidden /> Reject
          </Button>
          {onOpen ? (
            <Button size="xs" variant="ghost" onClick={onOpen}>
              <ExternalLink aria-hidden /> Open in Writing
            </Button>
          ) : null}
          <Button size="xs" variant="outline" disabled={busy} onClick={() => void run(onApprove)}>
            <Check aria-hidden /> Approve and apply
          </Button>
        </div>
      ) : null}
    </section>
  )
}
