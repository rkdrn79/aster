import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { replyCharCount } from '../../../../research-harness/research-rebuttal-assemble.mjs'

const AUTOSAVE_MS = 1200

type Props = {
  label: string
  value: string
  placeholder?: string
  readOnly?: boolean
  className?: string
  /** Visible lines before the field scrolls; the user can drag it taller. */
  rows?: number
  /** Resolves to an error message, or null once saved. */
  onSave: (text: string) => Promise<string | null>
}

type Draft = { base: string; text: string }
type SaveState = 'idle' | 'saving' | 'saved' | { error: string }

/**
 * A draft saved to the project as the user types. While it has no unsaved edits it follows the
 * file, so text the agent writes shows up; with unsaved edits it says the agent changed it.
 */
export function ResearchRebuttalDraftField({
  label,
  value,
  placeholder,
  readOnly = false,
  className,
  rows = 6,
  onSave
}: Props): React.JSX.Element {
  const id = useId()
  const [draft, setDraft] = useState<Draft>({ base: value, text: value })
  const [state, setState] = useState<SaveState>('idle')
  const timer = useRef<number | null>(null)
  const latest = useRef(draft)
  const saveRef = useRef(onSave)
  useEffect(() => {
    latest.current = draft
    saveRef.current = onSave
  })
  // Why during render: adopting the file's newer text is derived state, not an effect.
  if (draft.base !== value && draft.text === draft.base) {
    setDraft({ base: value, text: value })
  }
  const agentChanged = draft.base !== value && draft.text !== draft.base

  async function save(): Promise<void> {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    const { text, base } = latest.current
    if (text === base) {
      return
    }
    setState('saving')
    const error = await saveRef.current(text)
    if (error) {
      setState({ error })
      return
    }
    setDraft((current) =>
      current.text === text ? { base: text, text } : { ...current, base: text }
    )
    setState('saved')
  }

  useEffect(
    () => () => {
      // Why: leaving the field mid-pause still saves what was typed.
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
        const { text, base } = latest.current
        if (text !== base) {
          void saveRef.current(text)
        }
      }
    },
    []
  )

  return (
    <div className={cn('flex min-h-0 flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {agentChanged ? (
          <span className="flex items-center gap-1 text-2xs text-status-warning">
            Changed on disk
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => setDraft({ base: value, text: value })}
            >
              Use that version
            </Button>
          </span>
        ) : null}
      </div>
      <Textarea
        id={id}
        value={draft.text}
        readOnly={readOnly}
        placeholder={placeholder}
        rows={rows}
        className="resize-y"
        onChange={(event) => {
          const text = event.target.value
          latest.current = { ...latest.current, text }
          setDraft((current) => ({ ...current, text }))
          setState('idle')
          if (timer.current !== null) {
            window.clearTimeout(timer.current)
          }
          timer.current = window.setTimeout(() => void save(), AUTOSAVE_MS)
        }}
        onBlur={() => void save()}
      />
      <div className="flex items-center justify-between gap-2 text-2xs text-muted-foreground">
        <span role={typeof state === 'object' ? 'alert' : 'status'}>
          {typeof state === 'object' ? (
            <span className="text-destructive">{state.error}</span>
          ) : state === 'saving' ? (
            'Saving…'
          ) : state === 'saved' && draft.text === draft.base ? (
            'Saved'
          ) : draft.text !== draft.base ? (
            'Unsaved'
          ) : null}
        </span>
        <span className="tabular-nums">
          {replyCharCount(draft.text).toLocaleString()} characters
        </span>
      </div>
    </div>
  )
}
