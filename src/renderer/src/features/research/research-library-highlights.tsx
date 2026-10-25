import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Highlighter, LocateFixed, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { PaperHighlight } from '../../../../shared/research/research-library'
import {
  HIGHLIGHT_STYLES,
  removePaperHighlight,
  updatePaperHighlight
} from './research-library-paper-records'

function HighlightNote({ highlight }: { highlight: PaperHighlight }): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(highlight.note ?? '')

  async function save(): Promise<void> {
    try {
      await updatePaperHighlight(highlight.id, { note: draft })
      setEditing(false)
    } catch (cause) {
      toast.error('Note was not saved', { description: String(cause) })
    }
  }

  if (editing) {
    return (
      <div className="mt-2 space-y-1.5">
        <Textarea
          autoFocus
          rows={3}
          value={draft}
          maxLength={10_000}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Why this matters…"
          className="text-xs"
        />
        <div className="flex gap-1">
          <Button size="xs" onClick={() => void save()}>
            Save note
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setDraft(highlight.note ?? '')
              setEditing(false)
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    )
  }
  return highlight.note ? (
    <button
      type="button"
      className="mt-2 block w-full whitespace-pre-wrap rounded-md text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      onClick={() => setEditing(true)}
    >
      {highlight.note}
    </button>
  ) : (
    <Button size="xs" variant="link" className="mt-1 h-auto px-0" onClick={() => setEditing(true)}>
      Add note
    </Button>
  )
}

export function ResearchLibraryHighlights({
  highlights,
  onNavigate,
  onExplain
}: {
  highlights: readonly PaperHighlight[]
  onNavigate: (highlight: PaperHighlight) => void
  onExplain: (highlight: PaperHighlight) => Promise<string | null>
}): React.JSX.Element {
  const ordered = useMemo(
    () =>
      [...highlights].sort(
        (a, b) => a.pageNumber - b.pageNumber || (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0)
      ),
    [highlights]
  )

  if (!ordered.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Highlighter className="size-6 text-muted-foreground" aria-hidden />
        <p className="max-w-xs text-sm text-muted-foreground">
          Select text in the PDF and pick a color to keep a highlight here.
        </p>
      </div>
    )
  }

  return (
    <ul className="scrollbar-sleek min-h-0 flex-1 space-y-2 overflow-auto p-3">
      {ordered.map((highlight) => (
        <li key={highlight.id} className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-1">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: HIGHLIGHT_STYLES[highlight.color].swatch }}
              aria-hidden
            />
            <span className="ml-1 text-2xs text-muted-foreground">Page {highlight.pageNumber}</span>
            <span className="ml-auto flex">
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Go to highlight"
                onClick={() => onNavigate(highlight)}
              >
                <LocateFixed aria-hidden />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Explain highlight with the reading agent"
                onClick={() =>
                  void onExplain(highlight).then((error) => {
                    if (error) {
                      toast.error(error)
                    }
                  })
                }
              >
                <Sparkles aria-hidden />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Delete highlight"
                onClick={() =>
                  void removePaperHighlight(highlight.id).catch((cause: unknown) =>
                    toast.error('Highlight was not deleted', { description: String(cause) })
                  )
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </span>
          </div>
          <blockquote
            className="mt-1.5 line-clamp-5 border-l-2 pl-2 text-xs leading-relaxed"
            style={{ borderColor: HIGHLIGHT_STYLES[highlight.color].swatch }}
          >
            {highlight.text}
          </blockquote>
          <HighlightNote highlight={highlight} />
        </li>
      ))}
    </ul>
  )
}
