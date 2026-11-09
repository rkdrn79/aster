import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { parseFigureText } from './research-figure-document'
import { diffFigureElements, figureDiffText } from './research-figure-diff'
import {
  FIGURE_CHECKPOINT_LABELS,
  readFigureSnapshot,
  type FigureHistoryEntry
} from './research-figure-history'
import type { FigureTarget } from './research-figures-export'

type Rendered = { urls: [string | null, string | null]; diff: string }
const COMPARE_PX = 720

function label(entry: FigureHistoryEntry): string {
  return `${FIGURE_CHECKPOINT_LABELS[entry.kind]} · ${new Date(entry.at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })}`
}

/** Two kept versions side by side, or the newer over the older with a slider. */
export function ResearchFigureHistoryCompare({
  target,
  entries,
  onClose
}: {
  target: FigureTarget
  /** Older first. */
  entries: readonly [FigureHistoryEntry, FigureHistoryEntry]
  onClose: () => void
}): React.JSX.Element {
  const [mode, setMode] = useState<'side' | 'overlay'>('side')
  const [reveal, setReveal] = useState(50)
  const [rendered, setRendered] = useState<Rendered | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [older, newer] = entries
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const texts = await Promise.all(
          [older, newer].map((entry) => readFigureSnapshot(target.owner, target.slug, entry.id))
        )
        const { figureVersionDataUrl } = await import('./research-figure-history-render')
        const urls = await Promise.all(texts.map((text) => figureVersionDataUrl(text, COMPARE_PX)))
        const diff = diffFigureElements(
          parseFigureText(texts[0]).elements,
          parseFigureText(texts[1]).elements
        )
        if (live) {
          setRendered({ urls: [urls[0], urls[1]], diff: figureDiffText(diff) })
        }
      } catch (cause) {
        if (live) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      }
    })()
    return () => {
      live = false
    }
  }, [target, older, newer])
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Compare versions</DialogTitle>
          <DialogDescription>
            {label(older)} → {label(newer)}
            {rendered ? ` · ${rendered.diff}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-1" role="group" aria-label="Compare view">
          <Button
            size="xs"
            variant={mode === 'side' ? 'secondary' : 'ghost'}
            aria-pressed={mode === 'side'}
            onClick={() => setMode('side')}
          >
            Side by side
          </Button>
          <Button
            size="xs"
            variant={mode === 'overlay' ? 'secondary' : 'ghost'}
            aria-pressed={mode === 'overlay'}
            onClick={() => setMode('overlay')}
          >
            Overlay
          </Button>
          {mode === 'overlay' ? (
            <Slider
              className="ml-3 max-w-64"
              min={0}
              max={100}
              step={1}
              value={[reveal]}
              thumbLabels={['How much of the newer version shows']}
              onValueChange={([value]) => setReveal(value ?? 50)}
            />
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : !rendered ? (
          <p role="status" className="text-xs text-muted-foreground">
            Drawing both versions…
          </p>
        ) : mode === 'side' ? (
          <div className="grid grid-cols-2 gap-3">
            {[older, newer].map((entry, index) => (
              <figure key={entry.id} className="space-y-1">
                <div className="flex h-72 items-center justify-center rounded-md border border-border bg-white p-2">
                  {rendered.urls[index] ? (
                    <img
                      src={rendered.urls[index] ?? ''}
                      alt={label(entry)}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : null}
                </div>
                <figcaption className="text-xs text-muted-foreground">{label(entry)}</figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="relative flex h-96 items-center justify-center rounded-md border border-border bg-white p-2">
            {rendered.urls.map((url, index) =>
              url ? (
                <img
                  key={index === 0 ? older.id : newer.id}
                  src={url}
                  alt={index === 0 ? label(older) : label(newer)}
                  className={cn(
                    'max-h-full max-w-full object-contain',
                    index === 1 && 'absolute inset-2 m-auto'
                  )}
                  style={index === 1 ? { clipPath: `inset(0 ${100 - reveal}% 0 0)` } : undefined}
                />
              ) : null
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
