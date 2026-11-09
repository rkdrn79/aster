import { useEffect, useState } from 'react'
import { exportToSvg } from '@excalidraw/excalidraw'
import { MoreHorizontal } from 'lucide-react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { FigureStyle } from '../../../../research-harness/research-figures-style.mjs'
import { buildInsertItem, type InsertItem } from './research-figure-insert-catalog'

/** The drag type a tile carries to the canvas: the item's key. */
export const INSERT_DRAG_TYPE = 'application/x-aster-figure-insert'

const previews = new Map<string, Promise<string | null>>()

/** A picture of an item in the figure's style (kept per item and style). */
function preview(item: InsertItem, style: FigureStyle): Promise<string | null> {
  const key = `${item.key}:${style.name}:${style.accentName}`
  let shown = previews.get(key)
  if (!shown) {
    shown = buildInsertItem(item, style)
      .then(async ({ elements, files }) => {
        const svg = await exportToSvg({
          elements,
          files: Object.fromEntries(files.map((file) => [file.id, file])),
          appState: { exportBackground: false, viewBackgroundColor: 'transparent' },
          exportPadding: 4
        })
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`
      })
      .catch(() => null)
    previews.set(key, shown)
  }
  return shown
}

function usePreview(item: InsertItem, style: FigureStyle): string | null {
  const [url, setUrl] = useState<{ key: string; url: string | null } | null>(null)
  const key = `${item.key}:${style.name}:${style.accentName}`
  useEffect(() => {
    let live = true
    void preview(item, style).then((next) => live && setUrl({ key, url: next }))
    return () => {
      live = false
    }
  }, [item, style, key])
  return url?.key === key ? url.url : null
}

export type TileActions = {
  rename: () => void
  update: () => void
  remove: () => void
}

/** An 88×64 tile: the item drawn in the figure's style, its name, a larger picture on hover. */
export function ResearchFigureInsertTile({
  item,
  style,
  actions,
  onInsert
}: {
  item: InsertItem
  style: FigureStyle
  actions?: TileActions
  onInsert: (item: InsertItem, connect: boolean) => void
}): React.JSX.Element {
  const url = usePreview(item, style)
  const [hover, setHover] = useState(false)
  // Why: after a click the pointer still rests on the tile; the preview waits until it leaves.
  const [quiet, setQuiet] = useState(false)
  return (
    <div className="group relative w-[88px]">
      <HoverCard
        open={hover}
        openDelay={500}
        closeDelay={50}
        onOpenChange={(open) => setHover(open && !quiet)}
      >
        <HoverCardTrigger asChild>
          <button
            type="button"
            draggable
            aria-label={`Insert ${item.name}`}
            className="flex h-16 w-[88px] items-center justify-center overflow-hidden rounded-md border border-border bg-background hover:border-foreground/40 focus-visible:outline-2 focus-visible:outline-ring"
            onPointerLeave={() => setQuiet(false)}
            onClick={(event) => {
              setHover(false)
              setQuiet(true)
              onInsert(item, event.shiftKey)
            }}
            onDragStart={(event) => {
              setHover(false)
              event.dataTransfer.setData(INSERT_DRAG_TYPE, item.key)
              event.dataTransfer.effectAllowed = 'copy'
            }}
          >
            {url ? (
              <img
                alt=""
                src={url}
                className="max-h-14 max-w-20 object-contain"
                draggable={false}
              />
            ) : null}
          </button>
        </HoverCardTrigger>
        <HoverCardContent side="left" className="pointer-events-none w-60">
          <div className="flex h-36 items-center justify-center rounded-sm border border-border bg-background">
            {url ? (
              <img alt={item.name} src={url} className="max-h-32 max-w-52 object-contain" />
            ) : null}
          </div>
          <p className="mt-2 text-xs font-medium">{item.name}</p>
          <p className="text-xs text-muted-foreground">{item.description}</p>
          <p className="mt-1 text-2xs text-muted-foreground">
            Click to insert · Shift-click to connect · drag onto the canvas
          </p>
        </HoverCardContent>
      </HoverCard>
      <p className="mt-0.5 truncate text-center text-2xs text-muted-foreground" title={item.name}>
        {item.saved ? `${item.saved.scope === 'project' ? 'Project' : 'Mine'} · ` : ''}
        {item.name}
      </p>
      {actions ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${item.name} options`}
              className="absolute top-0.5 right-0.5 hidden size-5 items-center justify-center rounded bg-background/90 text-muted-foreground group-focus-within:flex group-hover:flex hover:text-foreground focus-visible:flex focus-visible:outline-2 focus-visible:outline-ring"
            >
              <MoreHorizontal className="size-3.5" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={actions.rename}>Rename…</DropdownMenuItem>
            <DropdownMenuItem onSelect={actions.update}>Update from selection</DropdownMenuItem>
            <DropdownMenuItem onSelect={actions.remove}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
