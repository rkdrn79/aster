import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Languages, MessageCircleQuestion, Send, Sparkles } from 'lucide-react'
import type { PdfTextSelection } from '@/components/editor/pdf-text-selection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HIGHLIGHT_COLORS, type HighlightColor } from '../../../../shared/research/research-library'
import { HIGHLIGHT_STYLES } from './research-library-paper-records'

export type ReaderSelectionAction =
  | { kind: 'explain' | 'translate'; selection: PdfTextSelection }
  | { kind: 'ask'; selection: PdfTextSelection; question: string }
  | { kind: 'highlight'; selection: PdfTextSelection; color: HighlightColor }

const TOOLBAR_WIDTH = 360

export function ResearchLibrarySelectionToolbar({
  selection,
  onAction,
  onClose
}: {
  selection: PdfTextSelection
  /** Resolves to an error message, or null when the action went through. */
  onAction: (action: ReaderSelectionAction) => Promise<string | null>
  onClose: () => void
}): React.JSX.Element {
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [asking, setAsking] = useState(false)
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Why: the toolbar is fixed to where the text was; once the page scrolls it points at nothing.
    const close = (event: Event): void => {
      if (!(event.target instanceof Node && toolbarRef.current?.contains(event.target))) {
        onClose()
      }
    }
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [onClose])

  async function run(action: ReaderSelectionAction): Promise<void> {
    if (busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const failure = await onAction(action)
      if (failure) {
        setError(failure)
        return
      }
      window.getSelection()?.removeAllRanges()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const left = Math.max(
    12,
    Math.min(selection.anchor.x - TOOLBAR_WIDTH / 2, window.innerWidth - TOOLBAR_WIDTH - 12)
  )
  const top = Math.max(
    12,
    Math.min(selection.anchor.y + 8, window.innerHeight - (asking ? 120 : 64))
  )

  return createPortal(
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Selected paper text"
      className="fixed z-[90] flex flex-col gap-1.5 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
      style={{ left, top, width: TOOLBAR_WIDTH }}
      // Why: keeps the page selection painted while the user picks an action.
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLInputElement)) {
          event.preventDefault()
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="flex items-center gap-0.5">
        <Button
          size="xs"
          variant="ghost"
          disabled={busy}
          onClick={() => void run({ kind: 'explain', selection })}
        >
          <Sparkles aria-hidden /> Explain
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={busy}
          onClick={() => void run({ kind: 'translate', selection })}
        >
          <Languages aria-hidden /> Translate
        </Button>
        <Button
          size="xs"
          variant={asking ? 'secondary' : 'ghost'}
          disabled={busy}
          onClick={() => setAsking((value) => !value)}
        >
          <MessageCircleQuestion aria-hidden /> Ask
        </Button>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            disabled={busy}
            aria-label={`Highlight ${HIGHLIGHT_STYLES[color].label.toLowerCase()}`}
            title={`Highlight ${HIGHLIGHT_STYLES[color].label.toLowerCase()}`}
            className="flex size-6 items-center justify-center rounded hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
            onClick={() => void run({ kind: 'highlight', selection, color })}
          >
            <span
              className="size-3.5 rounded-full border border-black/10"
              style={{ background: HIGHLIGHT_STYLES[color].swatch }}
            />
          </button>
        ))}
        <Button
          size="icon-xs"
          variant="ghost"
          className="ml-auto"
          aria-label="Copy selected text"
          onClick={() => {
            void window.api.ui.writeClipboardText(selection.text)
            onClose()
          }}
        >
          <Copy aria-hidden />
        </Button>
      </div>
      {asking ? (
        <form
          className="flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            if (question.trim()) {
              void run({ kind: 'ask', selection, question })
            }
          }}
        >
          <Input
            autoFocus
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask about this passage…"
            className="h-7 text-xs"
            aria-label="Question about the selected text"
          />
          <Button
            type="submit"
            size="icon-xs"
            className="size-7"
            disabled={busy || !question.trim()}
            aria-label="Send question"
          >
            <Send aria-hidden />
          </Button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="px-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>,
    document.body
  )
}
