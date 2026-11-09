import { useState } from 'react'
import { ArrowUp, PanelRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FIGURE_COMPOSER_PLACEHOLDER } from './ResearchFigureAgentPane'

/** The Figure agent folded under the canvas (focus mode, narrow windows): one line to ask. */
export function ResearchFigureAgentPill({
  onSend,
  onExpand
}: {
  /** Resolves to an error message, or null once the agent has it. */
  onSend: ((text: string) => Promise<string | null>) | null
  onExpand: () => void
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(null)

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (!onSend || !text.trim() || sending) {
      return
    }
    setSending(true)
    const failure = await onSend(text.trim())
    setSending(false)
    if (failure) {
      setNote({ error: true, text: failure })
      return
    }
    setText('')
    setNote({ error: false, text: 'Sent. The agent works in the background; open it to follow.' })
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-1 border-t border-border px-3 py-2">
      <form
        className="flex w-full max-w-xl items-center gap-1 rounded-full border border-border bg-background py-0.5 pr-1 pl-3 shadow-xs focus-within:border-foreground/50"
        onSubmit={(event) => void submit(event)}
      >
        <input
          aria-label="Ask the Figure agent"
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
          placeholder={FIGURE_COMPOSER_PLACEHOLDER}
          value={text}
          disabled={!onSend}
          onChange={(event) => {
            setText(event.target.value)
            setNote(null)
          }}
        />
        <Button
          type="submit"
          size="icon-xs"
          aria-label="Send to the Figure agent"
          disabled={!onSend || !text.trim() || sending}
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Open the agent pane"
          title="Open the agent pane (⌘\)"
          onClick={onExpand}
        >
          <PanelRight aria-hidden />
        </Button>
      </form>
      {note ? (
        <p
          role={note.error ? 'alert' : 'status'}
          className={note.error ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
        >
          {note.text}
        </p>
      ) : null}
    </div>
  )
}
