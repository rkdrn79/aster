import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Bot, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RebuttalReplyProposal } from '../../../../research-harness/research-rebuttal-records.mjs'
import { RebuttalDiff } from './ResearchRebuttalProposalCard'
import { INSET_WELL, REVEAL } from './research-surface-classes'

type Props = {
  /** An agent edit already in the reply; `base` is the text Undo puts back. */
  proposal: RebuttalReplyProposal
  /** The edit landed while the person was typing here; it waits until they pause. */
  held: boolean
  readOnly: boolean
  /** Each resolves to an error message, or null once done. */
  onUndo: () => Promise<string | null>
  onDismiss: () => Promise<string | null>
}

/** A quiet note under a reply the agent changed: what changed, and a one-click way back. */
export function ResearchRebuttalAgentEditMark({
  proposal,
  held,
  readOnly,
  onUndo,
  onDismiss
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const drafted = !proposal.base.trim()

  async function run(task: () => Promise<string | null>): Promise<void> {
    setBusy(true)
    setError(await task())
    setBusy(false)
  }

  if (held) {
    return (
      <p
        role="status"
        className="flex items-start gap-2 rounded-lg bg-foreground/4 px-3 py-2 text-2xs leading-4 text-muted-foreground"
        aria-label="Agent edit held while you type"
      >
        <Bot className="mt-px size-4 shrink-0" aria-hidden />
        The agent rewrote this reply while you were typing. Your words stay; its version waits here
        when you pause.
      </p>
    )
  }

  return (
    <div aria-label="Agent edit" className="space-y-2">
      <div className="flex w-fit max-w-full flex-wrap items-center gap-x-0.5 gap-y-0.5 rounded-lg bg-foreground/4 py-0.5 pr-0.5 pl-3 text-2xs text-muted-foreground">
        <Bot className="mr-0.5 size-4 shrink-0" aria-hidden />
        <span className="min-w-0 truncate pr-1">
          {drafted ? 'Drafted by the agent' : 'Edited by the agent'}
          {proposal.request ? ` · ${proposal.request}` : ''}
        </span>
        {drafted ? null : (
          <Button size="xs" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Hide changes' : 'Show changes'}
          </Button>
        )}
        {readOnly ? null : (
          <>
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => void run(onUndo)}>
              <Undo2 aria-hidden /> Undo
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Dismiss the agent edit note"
              title="Keep the edit and hide this note"
              disabled={busy}
              onClick={() => void run(onDismiss)}
            >
              <X aria-hidden />
            </Button>
          </>
        )}
      </div>
      {open && !drafted ? (
        <div className={cn(INSET_WELL, REVEAL, 'px-3 py-2')}>
          <RebuttalDiff before={proposal.base} after={proposal.text} />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
