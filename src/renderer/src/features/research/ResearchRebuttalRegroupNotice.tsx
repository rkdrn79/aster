import { useState } from 'react'
import { Check, Shuffle, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  regroupPhrases,
  type RebuttalArchivedGroup,
  type RebuttalRegroup
} from '../../../../research-harness/research-rebuttal-regroup.mjs'
import { ResearchRebuttalRegroupChanges } from './ResearchRebuttalRegroupChanges'
import { historyTimeText } from './research-rebuttal-view'
import type { RebuttalActions } from './use-research-rebuttal-actions'

type Props = {
  record: RebuttalRegroup
  archive: readonly RebuttalArchivedGroup[]
  readOnly: boolean
  actions: Pick<
    RebuttalActions,
    'undoRegroup' | 'acceptRegroup' | 'forgetRegroup' | 'restoreArchivedGroup'
  >
}

/**
 * One regroup of concerns that touched written replies: a quiet notice with Undo once it is
 * applied, or a card to accept or discard while it waits (Ask first, or held while typing).
 */
export function ResearchRebuttalRegroupNotice({
  record,
  archive,
  readOnly,
  actions
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(!record.applied)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sentence = regroupPhrases(record.summary).join('; ')

  async function run(task: () => Promise<string | null>): Promise<void> {
    setBusy(true)
    setError(await task())
    setBusy(false)
  }

  const changes = (
    <ResearchRebuttalRegroupChanges
      record={record}
      archive={archive}
      readOnly={readOnly}
      onRestore={(id) => void run(() => actions.restoreArchivedGroup(id))}
    />
  )

  if (!record.applied) {
    return (
      <section
        aria-label="Regroup concerns"
        className="space-y-2 rounded-md border border-border bg-card p-2.5"
      >
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <Shuffle className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="font-medium">Regroup concerns</span>
          <span className="min-w-0 text-muted-foreground">
            {record.heldWhileTyping ? 'written while you were typing · ' : ''}
            {sentence}
            {record.request ? ` · ${record.request}` : ''}
          </span>
          <span className="ml-auto text-2xs text-muted-foreground">
            {historyTimeText(record.at)}
          </span>
        </header>
        {changes}
        {record.heldWhileTyping ? (
          <p className="text-2xs text-muted-foreground">
            Nothing moved while you typed. Accepting applies it to the replies as they are now.
          </p>
        ) : null}
        {readOnly ? null : (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              size="xs"
              variant="ghost"
              disabled={busy}
              onClick={() => void run(() => actions.forgetRegroup(record.id))}
            >
              <X aria-hidden /> Discard
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={busy}
              onClick={() => void run(() => actions.acceptRegroup(record.id))}
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

  return (
    <div aria-label="Agent regroup" className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-2xs text-muted-foreground">
        <Shuffle className="size-3 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">
          The agent {sentence}
          {record.request ? ` · ${record.request}` : ''} · {historyTimeText(record.at)}
        </span>
        <Button size="xs" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide changes' : 'Show changes'}
        </Button>
        {readOnly ? null : (
          <>
            <Button
              size="xs"
              variant="ghost"
              disabled={busy}
              onClick={() => void run(() => actions.undoRegroup(record.id))}
            >
              <Undo2 aria-hidden /> Undo
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Dismiss the regroup note"
              title="Keep the new groups and hide this note"
              disabled={busy}
              onClick={() => void run(() => actions.forgetRegroup(record.id))}
            >
              <X aria-hidden />
            </Button>
          </>
        )}
      </div>
      {open ? changes : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
