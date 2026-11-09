import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Columns2, Copy, History, RotateCcw, Shapes } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { useFigureEditorHandle } from './research-figure-editor-handle'
import {
  FIGURE_CHECKPOINT_LABELS,
  figureSnapshotThumbnail,
  listFigureHistory,
  readFigureSnapshot,
  restoreFigureSnapshot,
  useFigureHistoryRevision,
  type FigureHistoryEntry
} from './research-figure-history'
import { createFigureFromText } from './research-figure-overwrite'
import type { FigureTarget } from './research-figures-export'
import { projectOwnerKey } from './research-project-files'
import { ResearchFigureHistoryCompare } from './ResearchFigureHistoryCompare'

const thumbnails = new Map<string, string | null>()

function useThumbnail(target: FigureTarget, entry: FigureHistoryEntry): string | null {
  const key = `${projectOwnerKey(target.owner)}|${target.slug}|${entry.id}`
  const [loaded, setLoaded] = useState<{ key: string; url: string | null } | null>(null)
  useEffect(() => {
    if (!entry.thumbnail || thumbnails.has(key)) {
      return
    }
    let live = true
    void figureSnapshotThumbnail(target.owner, target.slug, entry.id).then((url) => {
      thumbnails.set(key, url)
      if (live) {
        setLoaded({ key, url })
      }
    })
    return () => {
      live = false
    }
  }, [target, entry.id, entry.thumbnail, key])
  return thumbnails.get(key) ?? (loaded?.key === key ? loaded.url : null)
}

/** "14:02", or "Nov 7, 14:02" before today, and "2 min ago" within the hour. */
export function historyTimeText(at: string, now = Date.now()): string {
  const when = new Date(at)
  const minutes = Math.round((now - when.getTime()) / 60_000)
  if (minutes < 1) {
    return 'just now'
  }
  if (minutes < 60) {
    return `${minutes} min ago`
  }
  const time = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return new Date(now).toDateString() === when.toDateString()
    ? time
    : `${when.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`
}

function Thumbnail({
  target,
  entry,
  large
}: {
  target: FigureTarget
  entry: FigureHistoryEntry
  large?: boolean
}) {
  const url = useThumbnail(target, entry)
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-white',
        large ? 'h-48 w-full' : 'h-12 w-16'
      )}
    >
      {url ? (
        <img src={url} alt="" className="max-h-full max-w-full object-contain" />
      ) : (
        <Shapes className="size-4 text-muted-foreground/60" aria-hidden />
      )}
    </span>
  )
}

function Deltas({ entry }: { entry: FigureHistoryEntry }): React.JSX.Element | null {
  const deltas = entry.deltas
  if (!deltas || deltas.added + deltas.changed + deltas.removed === 0) {
    return null
  }
  return (
    <span
      className="tabular-nums"
      aria-label={`${deltas.added} added, ${deltas.changed} changed, ${deltas.removed} removed`}
    >
      {deltas.added ? `+${deltas.added} ` : ''}
      {deltas.changed ? `~${deltas.changed} ` : ''}
      {deltas.removed ? `−${deltas.removed}` : ''}
    </span>
  )
}

/** The open figure's kept versions: preview, restore, duplicate, and compare two. */
export function ResearchFigureHistoryPanel(): React.JSX.Element {
  const target = useFigureEditorHandle((state) => state.handle?.target ?? null)
  const revision = useFigureHistoryRevision((state) => state.revision)
  const [loaded, setLoaded] = useState<{ key: string; entries: FigureHistoryEntry[] } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [comparing, setComparing] = useState(false)
  const [working, setWorking] = useState(false)
  const key = target ? `${projectOwnerKey(target.owner)}|${target.folder}|${target.slug}` : ''
  useEffect(() => {
    if (!target) {
      return
    }
    let live = true
    void listFigureHistory(target.owner, target.slug)
      .catch(() => [])
      .then((entries) => live && setLoaded({ key, entries }))
    return () => {
      live = false
    }
  }, [target, key, revision])
  if (!target) {
    return <p className="p-4 text-xs text-muted-foreground">Open a figure to see its history.</p>
  }
  const entries = loaded?.key === key ? loaded.entries : []
  const open = entries.find((entry) => entry.id === openId) ?? null
  const pickedEntries = entries.filter((entry) => picked.includes(entry.id))

  async function restore(entry: FigureHistoryEntry): Promise<void> {
    if (!target) {
      return
    }
    setWorking(true)
    const failure = await restoreFigureSnapshot(target, entry.id)
    setWorking(false)
    if (failure) {
      toast.error(failure)
    } else {
      toast.success(`Restored the version from ${historyTimeText(entry.at)}.`, {
        description: 'The version it replaced is kept in History too.'
      })
      setOpenId(null)
    }
  }

  async function duplicate(entry: FigureHistoryEntry): Promise<void> {
    if (!target) {
      return
    }
    setWorking(true)
    try {
      const text = await readFigureSnapshot(target.owner, target.slug, entry.id)
      const slug = await createFigureFromText(target.owner, target.folder, target.slug, text)
      toast.success(`Opened the version as ${slug}.`)
    } catch (cause) {
      toast.error(`Not duplicated. ${cause instanceof Error ? cause.message : String(cause)}`)
    } finally {
      setWorking(false)
    }
  }

  if (open) {
    return (
      <section
        aria-label="Version preview"
        className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 text-xs"
      >
        <Button size="xs" variant="ghost" className="self-start" onClick={() => setOpenId(null)}>
          <ArrowLeft aria-hidden /> All versions
        </Button>
        <Thumbnail target={target} entry={open} large />
        <p className="font-medium">
          {FIGURE_CHECKPOINT_LABELS[open.kind]} · {historyTimeText(open.at)}
        </p>
        <p className="text-muted-foreground">{open.what}</p>
        <p className="text-muted-foreground">
          <Deltas entry={open} />
        </p>
        <p className="text-2xs text-muted-foreground">
          Read-only preview. Restoring keeps the current version in History.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button size="xs" disabled={working} onClick={() => void restore(open)}>
            <RotateCcw aria-hidden /> Restore
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={working}
            onClick={() => void duplicate(open)}
          >
            <Copy aria-hidden /> Duplicate as new figure
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section aria-label="Figure history" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
        <History className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{target.slug}</span>
        <Button
          size="xs"
          variant="outline"
          disabled={pickedEntries.length !== 2}
          title={
            pickedEntries.length === 2
              ? 'Compare the two picked versions'
              : 'Pick two versions to compare'
          }
          onClick={() => setComparing(true)}
        >
          <Columns2 aria-hidden /> Compare
          {pickedEntries.length ? ` (${pickedEntries.length}/2)` : ''}
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="p-4 text-xs text-muted-foreground">
          No history yet — ask the agent or save to start one.
        </p>
      ) : (
        <ul
          className="scrollbar-sleek min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5"
          aria-label="Versions"
        >
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 rounded-md p-1 hover:bg-accent">
              <Checkbox
                aria-label={`Pick the version from ${historyTimeText(entry.at)} to compare`}
                checked={picked.includes(entry.id)}
                onCheckedChange={(checked) =>
                  setPicked((current) =>
                    checked === true
                      ? [...current.filter((id) => id !== entry.id), entry.id].slice(-2)
                      : current.filter((id) => id !== entry.id)
                  )
                }
              />
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring"
                aria-label={`Preview: ${FIGURE_CHECKPOINT_LABELS[entry.kind]}, ${entry.what}, ${historyTimeText(entry.at)}`}
                onClick={() => setOpenId(entry.id)}
              >
                <Thumbnail target={target} entry={entry} />
                <span className="min-w-0 flex-1 text-xs">
                  <span className="block truncate font-medium">
                    {FIGURE_CHECKPOINT_LABELS[entry.kind]}
                  </span>
                  <span className="block truncate text-muted-foreground" title={entry.what}>
                    {entry.what}
                  </span>
                  <span className="flex gap-2 text-2xs text-muted-foreground">
                    <span>{historyTimeText(entry.at)}</span>
                    <Deltas entry={entry} />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {comparing && pickedEntries.length === 2 ? (
        <ResearchFigureHistoryCompare
          target={target}
          entries={[pickedEntries[1], pickedEntries[0]]}
          onClose={() => setComparing(false)}
        />
      ) : null}
    </section>
  )
}
