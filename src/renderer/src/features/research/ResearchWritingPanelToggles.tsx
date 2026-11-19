import { useRef, useState } from 'react'
import { GripVertical } from 'lucide-react'
import { ResearchSegmentedTrack, researchSegmentClass } from './research-segmented-track'
import {
  DEFAULT_WRITING_PANE_ORDER,
  visibleWritingPaneIndexes,
  type WritingPaneIndex,
  type WritingPaneOrder,
  type WritingPaneVisibility
} from './research-writing-pane-ratios'

const PANE_LABELS = ['Agent', 'TeX', 'PDF'] as const
const PANES = ['agent', 'source', 'reader'] as const
const PANE_TAB_LABELS = ['Writing agent', 'TeX source', 'PDF reader'] as const

/** Narrow windows show one Writing pane at a time, picked from this segmented control. */
export function ResearchWritingPaneTabs({
  wide,
  order,
  activePane,
  onSelect
}: {
  wide: boolean
  order: WritingPaneOrder
  activePane: (typeof PANES)[number]
  onSelect: (pane: (typeof PANES)[number]) => void
}): React.JSX.Element {
  return (
    <nav
      className="shrink-0 justify-center border-b border-border px-3 py-2"
      style={{ display: wide ? 'none' : 'flex' }}
      aria-label="Writing panes"
    >
      <ResearchSegmentedTrack enabled={!wide} className="w-full max-w-md">
        {order.map((index) => {
          const active = activePane === PANES[index]
          return (
            <button
              key={PANES[index]}
              type="button"
              aria-current={active ? 'page' : undefined}
              data-state={active ? 'active' : 'inactive'}
              className={researchSegmentClass(active, 'h-7 flex-1')}
              onClick={() => onSelect(PANES[index])}
            >
              {PANE_TAB_LABELS[index]}
            </button>
          )
        })}
      </ResearchSegmentedTrack>
    </nav>
  )
}

export function ResearchWritingPanelToggles({
  wide,
  visiblePanes,
  order = DEFAULT_WRITING_PANE_ORDER,
  onToggle,
  onReorder
}: {
  wide: boolean
  visiblePanes: WritingPaneVisibility
  order?: WritingPaneOrder
  onToggle: (index: WritingPaneIndex) => void
  onReorder?: (first: WritingPaneIndex, second: WritingPaneIndex) => void
}): React.JSX.Element {
  const openCount = visibleWritingPaneIndexes(visiblePanes).length
  const dragSource = useRef<WritingPaneIndex | null>(null)
  const [dropTarget, setDropTarget] = useState<WritingPaneIndex | null>(null)

  function clearDrag(): void {
    dragSource.current = null
    setDropTarget(null)
  }

  return (
    <div
      className="items-center gap-0.5 rounded-full bg-muted p-0.5"
      style={{ display: wide ? 'flex' : 'none' }}
      role="group"
      aria-label="Writing panels"
    >
      {order.map((index) => (
        <span
          key={index}
          className={dropTarget === index ? 'rounded-full ring-2 ring-ring' : undefined}
        >
          <button
            type="button"
            // Why raised, not a slide: any of the panes can be on at once, so each shown pane lifts.
            className="group/pane-toggle inline-flex h-7 items-center gap-1 rounded-full pr-3 pl-2 text-xs font-medium whitespace-nowrap text-muted-foreground transition-[color,background-color,box-shadow] duration-(--duration-fast) outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-raised aria-pressed:text-foreground aria-pressed:shadow-raised"
            aria-pressed={visiblePanes[index]}
            data-state={visiblePanes[index] ? 'on' : 'off'}
            aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
            title={`${visiblePanes[index] ? 'Hide' : 'Show'} ${PANE_LABELS[index]}. Drag to reorder.`}
            disabled={visiblePanes[index] && openCount === 1}
            onClick={() => onToggle(index)}
            draggable={wide && Boolean(onReorder)}
            onDragStart={(event) => {
              dragSource.current = index
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', String(index))
            }}
            onDragOver={(event) => {
              if (dragSource.current === null || dragSource.current === index) {
                return
              }
              event.preventDefault()
              setDropTarget(index)
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(event) => {
              event.preventDefault()
              if (dragSource.current !== null && dragSource.current !== index) {
                onReorder?.(dragSource.current, index)
              }
              clearDrag()
            }}
            onDragEnd={clearDrag}
            onKeyDown={(event) => {
              if (!event.altKey || !onReorder) {
                return
              }
              const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
              const adjacent = order[order.indexOf(index) + direction]
              if (direction !== 0 && adjacent !== undefined) {
                event.preventDefault()
                onReorder(index, adjacent)
              }
            }}
          >
            <GripVertical
              className="size-4 opacity-0 transition-opacity duration-(--duration-fast) group-hover/pane-toggle:opacity-50 group-focus-visible/pane-toggle:opacity-50"
              aria-hidden
            />
            {PANE_LABELS[index]}
          </button>
        </span>
      ))}
    </div>
  )
}
