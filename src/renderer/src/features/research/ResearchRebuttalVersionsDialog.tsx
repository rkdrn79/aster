import { useEffect, useState } from 'react'
import { Bot, History, RotateCcw, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { RebuttalReplyVersion } from '../../../../research-harness/research-rebuttal-records.mjs'
import { researchErrorText } from './research-error-text'
import { listReplyVersions, restoreReplyVersion } from './research-rebuttal-reply-mutations'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'
import { RebuttalDiff } from './ResearchRebuttalProposalCard'
import { historyTimeText } from './research-rebuttal-view'

type Props = {
  snapshot: RebuttalSnapshot
  slot: string
  label: string
  current: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Every kept version of one reply: who wrote it, what it was, and restoring it. */
export function ResearchRebuttalVersionsDialog({
  snapshot,
  slot,
  label,
  current,
  open,
  onOpenChange
}: Props): React.JSX.Element {
  const [versions, setVersions] = useState<RebuttalReplyVersion[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    let live = true
    setVersions(null)
    setSelectedId(null)
    void listReplyVersions(snapshot, slot)
      .then((entries) => live && setVersions(entries.toReversed()))
      .catch((cause) => live && setError(researchErrorText(cause)))
    return () => {
      live = false
    }
    // Why not the snapshot: reopening reads again; a poll must not reset what is being compared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, slot])
  const selected = versions?.find((entry) => entry.id === selectedId) ?? versions?.[0] ?? null

  async function restore(version: RebuttalReplyVersion): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await restoreReplyVersion(snapshot.owner, slot, version.id)
      onOpenChange(false)
    } catch (cause) {
      setError(researchErrorText(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            <span className="inline-flex items-center gap-2">
              <History className="size-4" aria-hidden /> Versions of {label}
            </span>
          </DialogTitle>
          <DialogDescription>
            Each agent change and your edits are kept here. Restoring keeps the current text too.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <div className="grid min-h-64 gap-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
          <ul className="scrollbar-sleek max-h-[50vh] space-y-0.5 overflow-y-auto pr-1">
            {(versions ?? []).map((version) => (
              <li key={version.id}>
                <button
                  type="button"
                  aria-pressed={version.id === selected?.id}
                  className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors duration-(--duration-fast) hover:bg-highlight aria-pressed:bg-raised aria-pressed:shadow-raised"
                  onClick={() => setSelectedId(version.id)}
                >
                  {version.by === 'agent' ? (
                    <Bot className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  ) : (
                    <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{version.what}</span>
                    <span className="text-2xs text-muted-foreground">
                      {historyTimeText(version.at)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {versions?.length === 0 ? (
              <li className="px-2 py-1 text-xs text-muted-foreground">No versions yet</li>
            ) : null}
          </ul>
          <section aria-label="Version preview" className="min-w-0 space-y-2">
            {selected ? (
              <>
                <div className="scrollbar-sleek max-h-[50vh] overflow-y-auto rounded-lg bg-muted/60 px-3 py-3 dark:bg-muted/45">
                  <RebuttalDiff before={current} after={selected.text} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Compared with the reply as it is now
                  </span>
                  <Button size="sm" disabled={busy} onClick={() => void restore(selected)}>
                    <RotateCcw aria-hidden /> Restore this version
                  </Button>
                </div>
              </>
            ) : null}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
