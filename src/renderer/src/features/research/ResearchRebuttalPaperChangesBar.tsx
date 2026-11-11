import { useState } from 'react'
import { CheckCheck, FilePenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RebuttalPaperChange } from '../../../../research-harness/research-rebuttal-records.mjs'

/**
 * Pending manuscript changes, applied together in one click. They still wait for the person:
 * an approved change edits the paper file itself, which has no version to undo to here.
 */
export function ResearchRebuttalPaperChangesBar({
  changes,
  readOnly,
  onApplyAll
}: {
  changes: readonly RebuttalPaperChange[]
  readOnly: boolean
  /** Resolves to an error message, or null once every change is applied. */
  onApplyAll: (ids: readonly string[]) => Promise<string | null>
}): React.JSX.Element | null {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = changes.filter((change) => change.status === 'pending')
  if (!pending.length) {
    return null
  }
  const files = [...new Set(pending.map((change) => change.file))].join(', ')
  return (
    <section
      aria-label="Paper changes waiting"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
    >
      <FilePenLine className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">
          {pending.length} paper {pending.length === 1 ? 'change' : 'changes'} waiting
        </span>
        <span className="text-muted-foreground"> · {files} · each shown under its reply</span>
      </span>
      {readOnly ? null : (
        <Button
          size="xs"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void onApplyAll(pending.map((change) => change.id)).then((failure) => {
              setError(failure)
              setBusy(false)
            })
          }}
        >
          <CheckCheck aria-hidden /> Apply all {pending.length}
        </Button>
      )}
      {error ? (
        <p role="alert" className="w-full text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}
