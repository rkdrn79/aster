import { useId, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { experimentChatPrompt } from './research-experiment-agent-chat'
import { ResearchExperimentChatButton } from './ResearchExperimentAgentPane'
import type { ExperimentWorkspace } from './research-experiment-workspace-state'
import { researchErrorText } from './research-error-text'
import { storedConclusionDraft } from './research-experiment-brief-draft'
import {
  closeNotebookEditor,
  readNotebookDraft,
  useHasNotebookDraft,
  writeNotebookDraft
} from './research-notebook-draft'
import { NotebookDraftNotice, NotebookSection } from './ResearchExperimentNotebookLayout'

function ConclusionEditor({
  experimentId,
  initial,
  onSave,
  onCancel
}: {
  experimentId: string
  initial: string
  onSave: (conclusion: string | null) => Promise<void>
  onCancel: () => void
}): React.JSX.Element {
  const id = useId()
  const [draft, setDraft] = useState(
    () => storedConclusionDraft(readNotebookDraft('conclusion', experimentId)) ?? initial
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = draft !== initial
  const close = (): void =>
    closeNotebookEditor({ kind: 'conclusion', experimentId, changed, onClose: onCancel })
  const discard = (): void => {
    writeNotebookDraft('conclusion', experimentId, null)
    onCancel()
  }
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        setSaving(true)
        setError(null)
        onSave(draft.trim() || null).then(
          () => writeNotebookDraft('conclusion', experimentId, null),
          (cause: unknown) => {
            setError(researchErrorText(cause))
            setSaving(false)
          }
        )
      }}
    >
      <Textarea
        id={id}
        autoFocus
        aria-label="Conclusion"
        value={draft}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          writeNotebookDraft('conclusion', experimentId, next === initial ? null : { text: next })
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !saving) {
            event.preventDefault()
            event.stopPropagation()
            close()
          }
        }}
        placeholder="What the Runs show, how sure you are, and what they do not show."
        className="min-h-24"
        maxLength={4000}
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        {changed ? (
          <span className="mr-auto flex items-center gap-1 text-xs text-muted-foreground">
            Draft kept until you save
            <Button type="button" size="xs" variant="ghost" onClick={discard} disabled={saving}>
              Discard changes
            </Button>
          </span>
        ) : null}
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={close}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving…' : 'Save conclusion'}
        </Button>
      </div>
    </form>
  )
}

/** The user's conclusion; the agent may draft one in the chat but never writes it here. */
export function ResearchExperimentNotebookConclusion({
  workspace
}: {
  workspace: ExperimentWorkspace
}): React.JSX.Element | null {
  const { experiment, brief, scope } = workspace
  // Why the Experiment ID: switching Experiments must close an open editor.
  const [editingId, setEditingId] = useState<string | null>(null)
  const hasDraft = useHasNotebookDraft('conclusion', experiment?.id ?? null)
  if (!experiment || !scope || !brief.available || !brief.loaded) {
    return null
  }
  const conclusion = brief.brief?.conclusion ?? null
  const editing = editingId === experiment.id
  const draft = hasDraft
    ? storedConclusionDraft(readNotebookDraft('conclusion', experiment.id))
    : null
  return (
    <NotebookSection
      label="Conclusion"
      action={
        editing ? null : (
          <>
            <ResearchExperimentChatButton
              experiment={experiment}
              build={(setup) => experimentChatPrompt('draft-conclusion', setup)}
            >
              Ask agent to draft
            </ResearchExperimentChatButton>
            {draft === null ? (
              <Button size="xs" variant="ghost" onClick={() => setEditingId(experiment.id)}>
                <Pencil aria-hidden />
                {conclusion ? 'Edit' : 'Write'}
              </Button>
            ) : null}
          </>
        )
      }
    >
      {!editing && draft !== null ? (
        <NotebookDraftNotice
          label="Unsaved conclusion"
          preview={draft}
          onResume={() => setEditingId(experiment.id)}
          onDiscard={() => writeNotebookDraft('conclusion', experiment.id, null)}
        />
      ) : null}
      {editing ? (
        <ConclusionEditor
          experimentId={experiment.id}
          initial={conclusion ?? ''}
          onCancel={() => setEditingId(null)}
          onSave={async (next) => {
            await brief.update({ conclusion: next })
            setEditingId(null)
          }}
        />
      ) : conclusion ? (
        <p className="whitespace-pre-wrap text-sm">{conclusion}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Not concluded yet.</p>
      )}
    </NotebookSection>
  )
}
