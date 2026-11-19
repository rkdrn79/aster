import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { WritingSkeleton } from '../../../../shared/research/research-writing-results'
import {
  confirmDisabledReason,
  editedLines,
  savedLineTexts,
  skeletonFields,
  skeletonTitle
} from './research-writing-skeleton-card'

/** Resolves to an error message, or null once done. */
type SkeletonAction = (lines: Record<string, string> | null) => Promise<string | null>

type Props = {
  skeleton: WritingSkeleton
  /** Saves the person's edits; the skeleton stays a draft. */
  onSave: SkeletonAction
  /** Saves edits if any, confirms, and tells the Writing agent to draft. */
  onConfirm: SkeletonAction
  onDismiss: () => void
}

function StatusLine({ skeleton }: { skeleton: WritingSkeleton }): React.JSX.Element {
  const confirmed = skeleton.status === 'confirmed'
  return (
    <span className="inline-flex items-center gap-2 text-2xs text-muted-foreground">
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          confirmed ? 'bg-status-success' : 'bg-status-warning'
        )}
      />
      {confirmed ? 'Confirmed' : 'Waiting for your confirmation'}
    </span>
  )
}

/**
 * The human decision before drafting: the agent proposes the five lines, the person edits and
 * confirms them, and only then does the agent draft the section.
 */
export function ResearchWritingSkeletonCard({
  skeleton,
  onSave,
  onConfirm,
  onDismiss
}: Props): React.JSX.Element {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<'save' | 'confirm' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(skeleton.status !== 'confirmed')
  const saved = savedLineTexts(skeleton)
  const edited = editedLines(skeleton, drafts)
  const disabledReason =
    confirmDisabledReason(skeleton, drafts) ??
    (skeleton.status === 'confirmed' && !edited
      ? 'Already confirmed; edit a line to change it.'
      : null)
  const title = skeletonTitle(skeleton)

  async function run(kind: 'save' | 'confirm', action: SkeletonAction): Promise<void> {
    setBusy(kind)
    setError(null)
    const failure = await action(edited)
    setBusy(null)
    setError(failure)
    if (!failure) {
      setDrafts({})
      if (kind === 'confirm') {
        setExpanded(false)
      }
    }
  }

  if (!expanded) {
    return (
      <div
        data-writing-skeleton={skeleton.section}
        data-status={skeleton.status}
        className="flex items-center gap-2 rounded-lg bg-card px-3 py-2"
      >
        <span className="min-w-0 flex-1 truncate text-xs">
          {title}{' '}
          <span className="text-muted-foreground">
            · {skeleton.status === 'confirmed' ? 'confirmed' : 'draft'}
          </span>
        </span>
        <Button size="xs" variant="ghost" onClick={() => setExpanded(true)}>
          Edit
        </Button>
        <Button size="xs" variant="ghost" onClick={onDismiss}>
          Hide
        </Button>
      </div>
    )
  }

  const fields = skeletonFields(skeleton)
  const required = fields.filter((field) => field.required)
  const optional = fields.filter((field) => !field.required)
  const field = (entry: (typeof fields)[number]): React.JSX.Element => (
    <label key={entry.key} className="block space-y-1">
      <span className="text-2xs font-medium text-muted-foreground">{entry.label}</span>
      <Textarea
        aria-label={entry.label}
        data-skeleton-line={entry.key}
        rows={2}
        placeholder={entry.hint}
        value={drafts[entry.key] ?? saved[entry.key] ?? ''}
        onChange={(event) =>
          setDrafts((current) => ({ ...current, [entry.key]: event.target.value }))
        }
      />
    </label>
  )

  return (
    <section
      aria-label={title}
      data-writing-skeleton={skeleton.section}
      data-status={skeleton.status}
      className="space-y-3 rounded-xl bg-card p-3"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h3 className="text-[13px] font-medium">{title}</h3>
          <StatusLine skeleton={skeleton} />
        </div>
        <Button size="xs" variant="ghost" onClick={onDismiss}>
          Hide
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The logic of the section in five lines. Edit it, then confirm: the Writing agent drafts only
        from a confirmed skeleton.
      </p>
      <div className="space-y-2">{required.map(field)}</div>
      {optional.length || skeleton.notes.trim() ? (
        <Collapsible>
          <CollapsibleTrigger variant="row">
            <span className="flex items-center gap-2 text-xs">
              <ChevronRight
                aria-hidden
                className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90"
              />
              More lines and the plan
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-2 pt-2">
              {optional.map(field)}
              {skeleton.notes.trim() ? (
                <pre className="scrollbar-sleek max-h-48 overflow-auto rounded-lg bg-muted p-2 text-2xs whitespace-pre-wrap text-muted-foreground">
                  {skeleton.notes.trim()}
                </pre>
              ) : null}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        {disabledReason ? (
          <span className="mr-auto text-2xs text-muted-foreground">{disabledReason}</span>
        ) : null}
        <Button
          size="xs"
          variant="secondary"
          disabled={busy !== null || !edited}
          onClick={() => void run('save', onSave)}
        >
          {busy === 'save' ? 'Saving…' : 'Save'}
        </Button>
        <Button
          size="xs"
          disabled={busy !== null || disabledReason !== null}
          title={disabledReason ?? undefined}
          onClick={() => void run('confirm', onConfirm)}
        >
          {busy === 'confirm' ? 'Confirming…' : 'Confirm skeleton'}
        </Button>
      </div>
    </section>
  )
}
