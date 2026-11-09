import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'
import type { FigureStyle } from '../../../../research-harness/research-figures-style.mjs'
import {
  buildInsertItem,
  iconItems,
  partItems,
  templateItems,
  type InsertCategory,
  type InsertItem
} from './research-figure-insert-catalog'
import { placeInsertItem } from './research-figure-insert-place'
import {
  deleteMyPart,
  loadMyParts,
  renameMyPart,
  updateMyPart,
  type PartsProject
} from './research-figure-my-parts'
import { ResearchFigureInsertTile } from './ResearchFigureInsertTile'

type Settle = (
  elements: readonly ExcalidrawElement[],
  selected?: ReadonlySet<string>
) => ExcalidrawElement[]
const CATEGORIES: { id: InsertCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'data', label: 'Data' },
  { id: 'icons', label: 'Icons' },
  { id: 'templates', label: 'Templates' },
  { id: 'mine', label: 'My parts' }
]
const NOUN: Record<InsertCategory | 'all', string> = {
  all: 'parts',
  blocks: 'blocks',
  data: 'data parts',
  icons: 'icons',
  templates: 'templates',
  mine: 'saved parts'
}

const errorText = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/**
 * Parts to put on the figure: kit blocks and data parts, icons, module templates and the parts
 * saved for this project or every project, drawn in the figure's style. Click inserts beside the
 * selection (or in the page's largest free spot), Shift-click connects it, drag drops it.
 */
export function ResearchFigureInsertPanel({
  api,
  style,
  project,
  settle,
  autoFocus,
  onInserted
}: {
  api: () => ExcalidrawImperativeAPI | null
  style: FigureStyle
  project: PartsProject
  settle?: Settle
  autoFocus?: boolean
  onInserted?: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<InsertCategory | 'all'>('all')
  const [templates, setTemplates] = useState<InsertItem[]>([])
  const [mine, setMine] = useState<InsertItem[]>([])
  const [renaming, setRenaming] = useState<{ item: InsertItem; name: string } | null>(null)
  const search = useRef<HTMLInputElement | null>(null)
  const refreshMine = useCallback(() => {
    void loadMyParts(project).then(setMine, () => setMine([]))
  }, [project])
  useEffect(() => {
    let live = true
    void templateItems().then((list) => live && setTemplates(list))
    void loadMyParts(project).then(
      (list) => live && setMine(list),
      () => undefined
    )
    return () => {
      live = false
    }
  }, [project])

  const all = useMemo(
    () => [...partItems(), ...templates, ...iconItems(), ...mine],
    [templates, mine]
  )
  const needle = query.trim().toLowerCase()
  const shown = all.filter(
    (item) =>
      (category === 'all' || item.category === category) &&
      (!needle ||
        item.name.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle))
  )

  const insert = (item: InsertItem, connect: boolean): void => {
    const current = api()
    if (!current) {
      return
    }
    void buildInsertItem(item, style).then(
      (built) => {
        placeInsertItem(current, built, settle ?? ((elements) => [...elements]), {
          connect,
          group: item.category === 'templates',
          line: style.line
        })
        onInserted?.()
      },
      (cause: unknown) => toast.error(`Could not insert ${item.name}. ${errorText(cause)}`)
    )
  }
  const act = (work: Promise<void>, done: string): void => {
    work.then(
      () => {
        toast.success(done)
        refreshMine()
      },
      (cause: unknown) => toast.error(errorText(cause))
    )
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(event) => {
        if (event.key === '/' && event.target !== search.current) {
          event.preventDefault()
          search.current?.focus()
        }
      }}
    >
      <div className="space-y-2 border-b border-border p-2">
        <label className="flex items-center gap-1.5">
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            ref={search}
            autoFocus={autoFocus}
            density="compact"
            aria-label="Search parts (/)"
            placeholder="Search parts, icons, templates  /"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (isImeOwnedKeyboardEvent(event)) {
                return
              }
              if (event.key === 'Enter' && shown[0]) {
                insert(shown[0], event.shiftKey)
              }
            }}
          />
        </label>
        <div role="radiogroup" aria-label="Category" className="flex flex-wrap gap-1">
          {CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={category === entry.id}
              className="rounded-full border border-border px-2 py-0.5 text-2xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-checked:border-foreground aria-checked:bg-accent aria-checked:text-foreground"
              onClick={() => setCategory(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        {renaming ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault()
              act(
                renameMyPart(project, renaming.item, renaming.name),
                `Renamed to ${renaming.name}.`
              )
              setRenaming(null)
            }}
          >
            <Input
              autoFocus
              density="compact"
              aria-label="New part name"
              value={renaming.name}
              onChange={(event) => setRenaming({ ...renaming, name: event.target.value })}
            />
            <Button size="xs" type="submit" disabled={!renaming.name.trim()}>
              Rename
            </Button>
            <Button size="xs" variant="ghost" type="button" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
          </form>
        ) : null}
      </div>
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-2">
        {shown.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,88px)] justify-between gap-x-1.5 gap-y-2">
            {shown.map((item) => (
              <ResearchFigureInsertTile
                key={item.key}
                item={item}
                style={style}
                onInsert={insert}
                actions={
                  item.saved
                    ? {
                        rename: () => setRenaming({ item, name: item.name }),
                        update: () => {
                          const current = api()
                          if (current) {
                            act(
                              updateMyPart(current, project, item),
                              `Updated ${item.name} from the selection.`
                            )
                          }
                        },
                        remove: () => act(deleteMyPart(project, item), `Deleted ${item.name}.`)
                      }
                    : undefined
                }
              />
            ))}
          </div>
        ) : (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">
            {needle
              ? `No “${query.trim()}” ${NOUN[category]} — find it in Icons or ask the agent.`
              : category === 'mine'
                ? 'No saved parts yet. Select something and choose Save selection as a part.'
                : 'Nothing here yet.'}
          </p>
        )}
      </div>
    </div>
  )
}
