import { useEffect, useState } from 'react'
import { CaptureUpdateAction } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import {
  ChevronRight,
  Eye,
  EyeOff,
  Image,
  Lock,
  LockOpen,
  MoveRight,
  Sigma,
  Square,
  SquareDashed,
  Type,
  type LucideIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  layerRows,
  reorderLayer,
  withHidden,
  type LayerKind,
  type LayerRow
} from './research-figure-layers'
import { lockTargets, withLock } from './research-figure-lock'
import { selectWhole } from './research-figure-panel-marquee'

const ICONS: Record<LayerKind, LucideIcon> = {
  box: Square,
  panel: SquareDashed,
  arrow: MoveRight,
  text: Type,
  picture: Image,
  math: Sigma,
  other: Square
}
const ROW_TOOL =
  'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&_svg]:size-3.5'

type Snapshot = { rows: LayerRow[]; selected: ReadonlySet<string> }
type Drop = { key: string; place: 'above' | 'below' }

function snapshotOf(elements: readonly ExcalidrawElement[], appState: AppState): Snapshot {
  return {
    rows: layerRows(elements),
    selected: new Set(
      Object.keys(appState.selectedElementIds).filter((id) => appState.selectedElementIds[id])
    )
  }
}

/** A row and what follows it (bound labels, badges, an arrow's label), which move and hide along. */
function reach(row: LayerRow, elements: readonly ExcalidrawElement[]): Set<string> {
  const members = elements.filter((element) => row.ids.includes(element.id))
  return new Set([...row.ids, ...lockTargets(members, elements).map((element) => element.id)])
}

/**
 * PowerPoint's Selection Pane and Figma's layers, beside the Inspector: one row per thing a person
 * picks, topmost first, named by its label. A click selects it (Shift adds), its label and math
 * are one click away, the eye hides it, the lock locks it, and rows drag to restack.
 */
export function ResearchFigureLayersPanel({
  api
}: {
  api: () => ExcalidrawImperativeAPI | null
}): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => {
    const current = api()
    return current
      ? snapshotOf(current.getSceneElements(), current.getAppState())
      : { rows: [], selected: new Set() }
  })
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [dragging, setDragging] = useState<string | null>(null)
  const [drop, setDrop] = useState<Drop | null>(null)
  const live = api()
  useEffect(() => {
    if (!live) {
      return
    }
    let frame = 0
    const off = live.onChange((elements, appState) => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => setSnapshot(snapshotOf(elements, appState)))
    })
    return () => {
      off()
      window.cancelAnimationFrame(frame)
    }
  }, [live])
  const scene = (): readonly ExcalidrawElement[] => api()?.getSceneElementsIncludingDeleted() ?? []
  const commit = (
    next: readonly ExcalidrawElement[],
    selection?: AppState['selectedElementIds']
  ): void => {
    api()?.updateScene({
      elements: next,
      ...(selection ? { appState: { selectedElementIds: selection } } : {}),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY
    })
  }
  const select = (row: LayerRow, add: boolean): void => {
    const current = api()
    if (!current || row.hidden) {
      return
    }
    const elements = current.getSceneElements()
    const state = current.getAppState()
    const members = elements.filter((element) => row.ids.includes(element.id))
    const base = add
      ? {
          selectedElementIds: Object.fromEntries(
            [...snapshot.selected].map((id) => [id, true] as const)
          ),
          selectedGroupIds: Object.fromEntries(
            Object.keys(state.selectedGroupIds).flatMap((id) =>
              state.selectedGroupIds[id] ? [[id, true] as const] : []
            )
          )
        }
      : undefined
    current.updateScene({
      appState: { ...selectWhole(elements, members, null, base), editingGroupId: null },
      captureUpdate: CaptureUpdateAction.NEVER
    })
  }
  const toggle = (row: LayerRow, what: 'hide' | 'lock'): void => {
    const elements = scene()
    const ids = reach(row, elements)
    if (what === 'lock') {
      commit(withLock(elements, ids, !row.locked))
      return
    }
    const hiding = !row.hidden
    const selected = Object.fromEntries(
      [...snapshot.selected].flatMap((id) => (hiding && ids.has(id) ? [] : [[id, true] as const]))
    )
    commit(withHidden(elements, ids, hiding), hiding ? selected : undefined)
  }
  const restack = (target: LayerRow, place: 'above' | 'below'): void => {
    const moving = snapshot.rows.find((row) => row.key === dragging)
    if (!moving || moving.key === target.key) {
      return
    }
    const elements = scene()
    commit(
      reorderLayer(elements, [...reach(moving, elements)], [...reach(target, elements)], place)
    )
  }
  return (
    <div role="listbox" aria-label="Layers" aria-multiselectable className="py-1">
      {snapshot.rows.map((row) => {
        const Icon = ICONS[row.kind]
        const chosen = row.ids.some((id) => snapshot.selected.has(id))
        const expanded = open.has(row.key)
        return (
          <div key={row.key}>
            <div
              role="option"
              aria-selected={chosen}
              aria-label={row.name}
              tabIndex={-1}
              draggable
              className={cn(
                'group/row relative flex h-7 cursor-default items-center gap-1 rounded-lg pr-1 pl-1 text-xs hover:bg-accent/60',
                chosen && 'bg-accent',
                row.hidden && 'text-muted-foreground',
                dragging === row.key && 'opacity-50'
              )}
              onClick={(event) => select(row, event.shiftKey)}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', row.key)
                setDragging(row.key)
              }}
              onDragOver={(event) => {
                if (!dragging || dragging === row.key) {
                  return
                }
                event.preventDefault()
                const box = event.currentTarget.getBoundingClientRect()
                const place = event.clientY < box.top + box.height / 2 ? 'above' : 'below'
                setDrop((current) =>
                  current?.key === row.key && current.place === place
                    ? current
                    : { key: row.key, place }
                )
              }}
              onDrop={(event) => {
                event.preventDefault()
                restack(row, drop?.key === row.key ? drop.place : 'above')
                setDragging(null)
                setDrop(null)
              }}
              onDragEnd={() => {
                setDragging(null)
                setDrop(null)
              }}
            >
              {drop?.key === row.key ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute right-1 left-1 h-0.5 rounded-full bg-foreground',
                    drop.place === 'above' ? '-top-px' : '-bottom-px'
                  )}
                />
              ) : null}
              {row.parts.length ? (
                <button
                  type="button"
                  aria-label={
                    expanded ? `Fold ${row.name}` : `Show the label and math of ${row.name}`
                  }
                  aria-expanded={expanded}
                  className={ROW_TOOL}
                  onClick={(event) => {
                    event.stopPropagation()
                    setOpen((current) => {
                      const next = new Set(current)
                      if (!next.delete(row.key)) {
                        next.add(row.key)
                      }
                      return next
                    })
                  }}
                >
                  <ChevronRight aria-hidden className={cn(expanded && 'rotate-90')} />
                </button>
              ) : (
                <span className="size-6 shrink-0" aria-hidden />
              )}
              <span
                aria-hidden
                className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-border [&_svg]:size-3 [&_svg]:text-muted-foreground"
                style={
                  row.fill && row.fill !== 'transparent' ? { background: row.fill } : undefined
                }
              >
                {row.fill && row.fill !== 'transparent' ? null : <Icon />}
              </span>
              <span className="min-w-0 flex-1 truncate pl-1" title={row.name}>
                {row.name}
              </span>
              <button
                type="button"
                aria-label={row.hidden ? `Show ${row.name}` : `Hide ${row.name}`}
                aria-pressed={row.hidden}
                className={cn(
                  ROW_TOOL,
                  !row.hidden && 'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100'
                )}
                onClick={(event) => {
                  event.stopPropagation()
                  toggle(row, 'hide')
                }}
              >
                {row.hidden ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </button>
              <button
                type="button"
                aria-label={row.locked ? `Unlock ${row.name}` : `Lock ${row.name}`}
                aria-pressed={row.locked}
                disabled={row.hidden}
                className={cn(
                  ROW_TOOL,
                  row.locked
                    ? 'text-foreground'
                    : 'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100',
                  'disabled:pointer-events-none'
                )}
                onClick={(event) => {
                  event.stopPropagation()
                  toggle(row, 'lock')
                }}
              >
                {row.locked ? <Lock aria-hidden /> : <LockOpen aria-hidden />}
              </button>
            </div>
            {expanded
              ? row.parts.map((part) => {
                  const PartIcon = ICONS[part.kind]
                  return (
                    <div
                      key={part.id}
                      role="option"
                      aria-selected={snapshot.selected.has(part.id)}
                      aria-label={part.name}
                      tabIndex={-1}
                      className={cn(
                        'flex h-7 cursor-default items-center gap-2 rounded-lg pr-2 pl-9 text-xs text-muted-foreground hover:bg-accent/60 [&_svg]:size-3',
                        snapshot.selected.has(part.id) && 'bg-accent text-foreground'
                      )}
                      onClick={() =>
                        api()?.updateScene({
                          appState: {
                            selectedElementIds: { [part.id]: true },
                            selectedGroupIds: {},
                            editingGroupId: part.editingGroupId
                          },
                          captureUpdate: CaptureUpdateAction.NEVER
                        })
                      }
                    >
                      <PartIcon aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{part.name}</span>
                    </div>
                  )
                })
              : null}
          </div>
        )
      })}
    </div>
  )
}
