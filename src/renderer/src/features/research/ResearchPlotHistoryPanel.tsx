import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, History, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FigureHistoryThumbnail, historyTimeText } from './ResearchFigureHistoryPanel'
import {
  FIGURE_CHECKPOINT_LABELS,
  listFigureHistory,
  useFigureHistoryRevision,
  type FigureHistoryEntry
} from './research-figure-history'
import type { FigureTarget } from './research-figures-export'
import { restorePlotSnapshot } from './research-plot-history'
import { projectOwnerKey, type ProjectFileOwner } from './research-project-files'

/** The open plot's kept versions (before and after each agent turn): preview and restore. */
export function ResearchPlotHistoryPanel({
  owner,
  folder,
  slug
}: {
  owner: ProjectFileOwner
  folder: string
  slug: string
}): React.JSX.Element {
  const target = useMemo<FigureTarget>(() => ({ owner, folder, slug }), [owner, folder, slug])
  const revision = useFigureHistoryRevision((state) => state.revision)
  const key = `${projectOwnerKey(owner)}|${folder}|${slug}`
  const [loaded, setLoaded] = useState<{ key: string; entries: FigureHistoryEntry[] } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  useEffect(() => {
    let live = true
    void listFigureHistory(owner, slug)
      .catch(() => [])
      .then((entries) => live && setLoaded({ key, entries }))
    return () => {
      live = false
    }
  }, [owner, slug, key, revision])
  // Why only plot versions: a diagram that once had this name keeps its own, not restorable here.
  const entries = (loaded?.key === key ? loaded.entries : []).filter((entry) =>
    Array.isArray(entry.plot)
  )
  const open = entries.find((entry) => entry.id === openId) ?? null

  async function restore(entry: FigureHistoryEntry): Promise<void> {
    setWorking(true)
    const failure = await restorePlotSnapshot(target, entry.id)
    setWorking(false)
    if (failure) {
      toast.error(failure)
      return
    }
    toast.success(`Restored the version from ${historyTimeText(entry.at)}.`, {
      description: 'The version it replaced is kept in History too.'
    })
    setOpenId(null)
  }

  if (open) {
    return (
      <section
        aria-label="Version preview"
        className="research-pane-in scrollbar-sleek flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 text-xs"
      >
        <Button
          size="xs"
          variant="ghost"
          className="h-7 self-start"
          onClick={() => setOpenId(null)}
        >
          <ArrowLeft aria-hidden /> All versions
        </Button>
        <FigureHistoryThumbnail target={target} entry={open} large />
        <p className="pt-1 text-[13px] font-medium">
          {FIGURE_CHECKPOINT_LABELS[open.kind]} · {historyTimeText(open.at)}
        </p>
        <p className="text-muted-foreground">{open.what}</p>
        <p className="text-2xs text-muted-foreground">
          Restoring puts back its script and its picture, and keeps the current version in History.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="xs" className="h-7" disabled={working} onClick={() => void restore(open)}>
            <RotateCcw aria-hidden /> Restore
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section aria-label="Plot history" className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3 text-xs">
        <History className="size-4 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{slug}</span>
      </div>
      {entries.length === 0 ? (
        <p className="p-4 text-xs text-muted-foreground">
          No history yet. Ask the agent and versions of this plot collect here.
        </p>
      ) : (
        <ul
          className="research-pane-in scrollbar-sleek min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2"
          aria-label="Versions"
        >
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="flex w-full min-w-0 items-center gap-2 rounded-lg p-2 text-left transition-colors duration-(--duration-fast) hover:bg-accent/70 focus-visible:outline-2 focus-visible:outline-ring"
                aria-label={`Preview: ${FIGURE_CHECKPOINT_LABELS[entry.kind]}, ${entry.what}, ${historyTimeText(entry.at)}`}
                onClick={() => setOpenId(entry.id)}
              >
                <FigureHistoryThumbnail target={target} entry={entry} />
                <span className="min-w-0 flex-1 text-xs">
                  <span className="block truncate text-[13px] leading-snug font-medium">
                    {FIGURE_CHECKPOINT_LABELS[entry.kind]}
                  </span>
                  <span className="block truncate text-muted-foreground" title={entry.what}>
                    {entry.what}
                  </span>
                  <span className="mt-0.5 block text-2xs text-muted-foreground">
                    {historyTimeText(entry.at)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
