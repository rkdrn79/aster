import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { replyCharCount } from '../../../../research-harness/research-rebuttal-assemble.mjs'
import { noteRebuttalKeystroke, setRebuttalFieldDirty } from './research-rebuttal-editing'

const AUTOSAVE_MS = 1200

type Props = {
  label: string
  value: string
  placeholder?: string
  readOnly?: boolean
  className?: string
  /** Visible lines before the field scrolls; the user can drag it taller. */
  rows?: number
  /** Resolves to an error message, or null once saved; `base` is the text editing started from. */
  onSave: (text: string, base: string) => Promise<string | null>
  /** Shown to the right of the label, e.g. who wrote this text. */
  labelExtra?: ReactNode
  /** Actions on the save-state row, to the left of the character count. */
  footerExtra?: ReactNode
  /** Reports the selected text, or null when nothing is selected. */
  onSelectionChange?: (selection: string | null) => void
  /** Hides the label row (the surrounding row names the field). */
  hideLabel?: boolean
  /** Grow with the text instead of scrolling. */
  autoGrow?: boolean
  /** Reports unsaved typing and the text it started from, or null once it is saved. */
  onEditingChange?: (editing: { base: string } | null) => void
  /** The reply slot this field edits, so a regroup never moves text that is being typed. */
  slot?: string | null
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
  onSave,
  labelExtra,
  footerExtra,
  onSelectionChange,
  hideLabel = false,
  autoGrow = false,
  onEditingChange,
  slot = null
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
  const dirty = draft.text !== draft.base
  const editingRef = useRef(onEditingChange)
  useEffect(() => {
    editingRef.current = onEditingChange
  })
  useEffect(() => {
    setRebuttalFieldDirty(id, dirty, slot)
    editingRef.current?.(dirty ? { base: draft.base } : null)
  }, [id, dirty, draft.base, slot])
  useEffect(() => () => setRebuttalFieldDirty(id, false), [id])

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
    const error = await saveRef.current(text, base)
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
          void saveRef.current(text, base)
        }
      }
    },
    []
  )

  return (
    <div className={cn('flex min-h-0 flex-col gap-1.5', className)}>
      <div className={cn('flex items-center justify-between gap-2', hideLabel && 'sr-only')}>
        <div className="flex min-w-0 items-center gap-2">
          <Label htmlFor={id}>{label}</Label>
          {labelExtra}
        </div>
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
        className={autoGrow ? 'field-sizing-content max-h-[60vh] resize-none' : 'resize-y'}
        onSelect={(event) => {
          const field = event.currentTarget
          const { selectionStart: start, selectionEnd: end, value: current } = field
          onSelectionChange?.(start !== end ? current.slice(start, end) : null)
        }}
        onChange={(event) => {
          const text = event.target.value
          noteRebuttalKeystroke()
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
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-2xs text-muted-foreground">
        <span role={typeof state === 'object' ? 'alert' : 'status'} className="min-w-0 flex-1">
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
        {footerExtra}
        <span className="tabular-nums">
          {replyCharCount(draft.text).toLocaleString()} characters
        </span>
      </div>
    </div>
  )
}
