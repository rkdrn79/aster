import { useEffect, useRef, useState } from 'react'
import { Check, ImagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'
import { cn } from '@/lib/utils'
import { ResearchChip } from './research-chip'
import { FIGURE_PINNED_MAX, readFigureModesSaved } from './research-figure-modes'
import {
  addFigureReferenceFile,
  useFigureReferenceLibrary,
  type FigureReferenceEntry
} from './research-figure-reference-library'

const thumbnails = new Map<string, Promise<string | null>>()

/** A reference image's thumbnail, read once through the main process. */
function useThumbnail(image: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const read = window.api.researchFigures?.referenceThumbnail
    if (!image || !read) {
      setUrl(null)
      return
    }
    let live = true
    const folder = readFigureModesSaved().folder ?? null
    const pending =
      thumbnails.get(image) ?? read({ folder, image }).catch((): string | null => null)
    thumbnails.set(image, pending)
    void pending.then((next) => {
      if (live) {
        setUrl(next)
      }
    })
    return () => {
      live = false
    }
  }, [image])
  return url
}

function Row({
  entry,
  pinned,
  full,
  onToggle
}: {
  entry: FigureReferenceEntry
  pinned: boolean
  full: boolean
  onToggle: () => void
}): React.JSX.Element {
  const url = useThumbnail(entry.image)
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={pinned}
        aria-disabled={!pinned && full ? true : undefined}
        title={
          !pinned && full ? `Pin at most ${String(FIGURE_PINNED_MAX)}` : (entry.title ?? entry.id)
        }
        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-accent aria-disabled:opacity-50"
        onClick={() => {
          if (pinned || !full) {
            onToggle()
          }
        }}
      >
        <span className="flex h-8 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background">
          {url ? <img src={url} alt="" className="max-h-full max-w-full object-contain" /> : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs text-foreground">{entry.id}</span>
          <span className="truncate text-2xs text-muted-foreground">
            {entry.recipe
              ? `${entry.title ?? ''}${entry.year ? ` (${String(entry.year)})` : ''}`
              : 'Your image (no recipe)'}
          </span>
        </span>
        <Check aria-hidden className={cn('size-3.5 shrink-0', !pinned && 'invisible')} />
      </button>
    </li>
  )
}

/** Picks which references of the person's folder the agent follows first (`figures refs --pin`). */
export function ResearchFigureReferencePicker({
  pinned,
  onChange
}: {
  pinned: readonly string[]
  onChange: (pinned: readonly string[]) => void
}): React.JSX.Element {
  const entries = useFigureReferenceLibrary((state) => state.entries)
  const [query, setQuery] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)
  const words = query.trim().toLowerCase()
  // Why own images first: they are what the person added; the recipes follow in their order.
  const shown = [
    ...entries.filter((entry) => !entry.recipe),
    ...entries.filter((entry) => entry.recipe)
  ].filter(
    (entry) =>
      !words ||
      entry.id.includes(words) ||
      (entry.title ?? '').toLowerCase().includes(words) ||
      (entry.genre ?? '').includes(words)
  )
  const full = pinned.length >= FIGURE_PINNED_MAX
  return (
    <div className="flex flex-col gap-1.5" data-figure-reference-picker="">
      <div className="flex items-center gap-1.5">
        <input
          type="search"
          value={query}
          aria-label="Filter references"
          placeholder="Filter references"
          className="h-7 min-w-0 flex-1 rounded-lg bg-background px-2 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (isImeOwnedKeyboardEvent(event)) {
              return
            }
            if (event.key === 'Escape' && query) {
              event.stopPropagation()
              setQuery('')
            }
          }}
        />
        <ResearchChip
          tone="quiet"
          className="h-7 px-2"
          aria-label="Add a reference image"
          title="Add a PNG or JPEG figure to your reference folder"
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus aria-hidden />
        </ResearchChip>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) {
              void addFigureReferenceFile(file).then((failure) => {
                if (failure) {
                  toast.error(failure)
                }
              })
            }
          }}
        />
      </div>
      <ul
        aria-label="References to pin"
        className="scrollbar-sleek max-h-56 overflow-y-auto rounded-lg bg-background/60 p-1"
      >
        {shown.map((entry) => (
          <Row
            key={entry.id}
            entry={entry}
            pinned={pinned.includes(entry.id)}
            full={full}
            onToggle={() =>
              onChange(
                pinned.includes(entry.id)
                  ? pinned.filter((id) => id !== entry.id)
                  : [...pinned, entry.id]
              )
            }
          />
        ))}
        {shown.length === 0 ? (
          <li className="px-2 py-3 text-center text-2xs text-muted-foreground">
            No reference matches.
          </li>
        ) : null}
      </ul>
    </div>
  )
}
