import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatUiRelativeTimeFromDate } from '@/i18n/relative-time-format'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import type { ResearchRunSummary } from '../../../../shared/research/research-run-summary'
import { researchErrorText } from './research-error-text'
import { catalogRunReference } from './use-research-harness-experiment'
import { researchOrganizeBridge } from './use-research-run-summaries'

type Notes = ResearchRunSummary['notes']

/** Enter saves; Shift+Enter (or an IME composition) keeps typing. */
function submitOnEnter(event: React.KeyboardEvent, submit: () => void, cancel?: () => void): void {
  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
    event.preventDefault()
    submit()
  } else if (event.key === 'Escape' && cancel) {
    event.preventDefault()
    cancel()
  }
}

/** Notes agents and the user left in the selected Run's summary.json, newest first; the user
 * adds, edits and deletes their own here. */
export function ResearchRunNotes({
  run,
  notes
}: {
  run: Pick<ResearchRunRecord, 'name' | 'hostId' | 'workspacePath' | 'manifestPath'>
  notes: Notes
}): React.JSX.Element | null {
  const reference = catalogRunReference(run)
  const bridge = researchOrganizeBridge()
  // Why local catalog Runs only: summary.json is written by the harness beside the Run's run.json.
  const writable = Boolean(reference && run.hostId === 'local' && bridge.addNote)
  // Why: summaries are re-read on a 10 s poll; show the saved list until that read catches up.
  const [saved, setSaved] = useState<{ base: Notes; notes: Notes } | null>(null)
  const shown = saved?.base === notes ? saved.notes : notes
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ at: string; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!shown.length && !writable) {
    return null
  }

  async function write(
    task: (params: { workspacePath: string; run: string }) => Promise<{ notes: Notes }> | undefined
  ): Promise<boolean> {
    if (!reference || busy) {
      return false
    }
    setBusy(true)
    setError(null)
    try {
      const result = await task({ workspacePath: run.workspacePath, run: reference })
      if (!result) {
        throw new Error('Restart Aster to save notes.')
      }
      setSaved({ base: notes, notes: result.notes })
      return true
    } catch (cause) {
      setError(researchErrorText(cause))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function add(): Promise<void> {
    const text = draft.trim()
    if (text && (await write((params) => bridge.addNote?.({ ...params, text })))) {
      setDraft('')
    }
  }

  async function saveEdit(): Promise<void> {
    const text = editing?.text.trim()
    if (!editing || !text) {
      return
    }
    const { at } = editing
    if (await write((params) => bridge.editNote?.({ ...params, at, text }))) {
      setEditing(null)
    }
  }

  return (
    <section aria-label={`Notes on ${run.name}`} className="space-y-2">
      <h3 className="text-sm font-medium">Notes</h3>
      {shown.length ? (
        <ul className="space-y-2 text-xs">
          {shown.toReversed().map((note) => (
            <li key={`${note.at}:${note.by}`} className="group space-y-0.5">
              {editing?.at === note.at && note.by === 'user' ? (
                <Textarea
                  autoFocus
                  aria-label="Edit note"
                  value={editing.text}
                  disabled={busy}
                  onChange={(event) => setEditing({ at: note.at, text: event.target.value })}
                  onKeyDown={(event) =>
                    submitOnEnter(
                      event,
                      () => void saveEdit(),
                      () => setEditing(null)
                    )
                  }
                  className="min-h-14"
                />
              ) : (
                <p className="whitespace-pre-wrap">{note.text}</p>
              )}
              <p className="flex items-center gap-1 text-muted-foreground">
                {note.by === 'agent' ? 'Agent note' : 'Your note'} ·{' '}
                {formatUiRelativeTimeFromDate(note.at)}
                {writable && note.by === 'user' && editing?.at !== note.at ? (
                  <span className="ml-1 inline-flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Edit note"
                      disabled={busy}
                      onClick={() => setEditing({ at: note.at, text: note.text })}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Delete note"
                      disabled={busy}
                      onClick={() =>
                        void write((params) => bridge.deleteNote?.({ ...params, at: note.at }))
                      }
                    >
                      <Trash2 />
                    </Button>
                  </span>
                ) : null}
                {editing?.at === note.at ? <span>· Enter to save, Esc to cancel</span> : null}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {writable ? (
        <Textarea
          aria-label="Add a note"
          placeholder="Add a note — Enter to save, Shift+Enter for a new line"
          value={draft}
          disabled={busy}
          maxLength={2000}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => submitOnEnter(event, () => void add())}
          className="min-h-14"
        />
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}
