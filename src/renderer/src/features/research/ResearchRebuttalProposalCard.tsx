import { useMemo, useState } from 'react'
import { Bot, Check, Undo2, X } from 'lucide-react'
import { diffWordsWithSpace } from 'diff'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  proposalOutcome,
  type RebuttalReplyProposal
} from '../../../../research-harness/research-rebuttal-records.mjs'
import { historyTimeText } from './research-rebuttal-view'

/** A word-level diff, removed words struck through and added words underlined. */
export function RebuttalDiff({
  before,
  after
}: {
  before: string
  after: string
}): React.JSX.Element {
  const parts = useMemo(() => diffWordsWithSpace(before, after), [before, after])
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-6">
      {parts.map((part, index) => (
        <span
          key={index}
          className={cn(
            part.added &&
              'rounded-xs bg-status-success-background text-foreground underline decoration-status-success/70 decoration-1 underline-offset-2',
            part.removed && 'text-muted-foreground line-through decoration-destructive/70'
          )}
        >
          {part.value}
        </span>
      ))}
    </p>
  )
}

type Props = {
  proposal: RebuttalReplyProposal
  current: string
  readOnly: boolean
  /** Each resolves to an error message, or null once done. */
  onAccept: () => Promise<string | null>
  onDiscard: () => Promise<string | null>
}

/** What the agent changed or wants to change in one reply, decided here. */
export function ResearchRebuttalProposalCard({
  proposal,
  current,
  readOnly,
  onAccept,
  onDiscard
}: Props): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const outcome = proposalOutcome(current, proposal)

  async function run(task: () => Promise<string | null>): Promise<void> {
    setBusy(true)
    setError(await task())
    setBusy(false)
  }

  if (proposal.applied) {
    return (
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs"
        aria-label="Agent draft waiting for your review"
      >
        <Bot className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 text-muted-foreground">
          Agent draft
          {proposal.request ? ` · ${proposal.request}` : ''}
        </span>
        {readOnly ? null : (
          <span className="flex items-center gap-1.5">
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => void run(onDiscard)}>
              <Undo2 aria-hidden /> Undo
            </Button>
            <Button size="xs" variant="outline" disabled={busy} onClick={() => void run(onAccept)}>
              <Check aria-hidden /> Keep
            </Button>
          </span>
        )}
        {error ? (
          <p role="alert" className="w-full text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <section
      aria-label="Suggested change from the agent"
      className="space-y-2 rounded-md border border-border bg-muted/40 p-2.5"
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <Bot className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="font-medium">Suggested change</span>
        <span className="text-muted-foreground">
          {proposal.kind === 'passage' ? 'to a passage' : 'to the whole reply'}
          {proposal.request ? ` · ${proposal.request}` : ''}
        </span>
        <span className="ml-auto text-2xs text-muted-foreground">
          {historyTimeText(proposal.at)}
        </span>
      </header>
      {proposal.kind === 'passage' && proposal.find !== null && proposal.replace !== null ? (
        <RebuttalDiff before={proposal.find} after={proposal.replace} />
      ) : (
        <RebuttalDiff
          before={outcome.mode === 'conflict' ? proposal.base : current}
          after={proposal.text}
        />
      )}
      {outcome.mode === 'overwrites' ? (
        <p className="text-xs text-status-warning">
          You changed this reply after the agent read it. Accepting replaces those edits; they stay
          in Versions.
        </p>
      ) : outcome.mode === 'conflict' ? (
        <p role="alert" className="text-xs text-status-warning">
          The passage changed since the agent wrote this, so it cannot be applied. Copy what you
          want, then discard it.
        </p>
      ) : null}
      {readOnly ? null : (
        <div className="flex items-center justify-end gap-1.5">
          <Button size="xs" variant="ghost" disabled={busy} onClick={() => void run(onDiscard)}>
            <X aria-hidden /> Discard
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={busy || outcome.mode === 'conflict'}
            onClick={() => void run(onAccept)}
          >
            <Check aria-hidden /> Accept
          </Button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}
