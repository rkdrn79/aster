import { useRef, useState } from 'react'
import { GripVertical } from 'lucide-react'
import { Toggle } from '../../components/ui/toggle'
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

/** Narrow windows show one Writing pane at a time, picked from these tabs. */
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
      className="shrink-0 border-b border-border"
      style={{ display: wide ? 'none' : 'flex' }}
      aria-label="Writing panes"
    >
      {order.map((index) => (
        <button
          key={PANES[index]}
          type="button"
          className={`flex-1 border-b-2 px-3 py-2 text-xs font-medium ${activePane === PANES[index] ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}
          onClick={() => onSelect(PANES[index])}
        >
          {PANE_TAB_LABELS[index]}
        </button>
      ))}
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
      className="items-center gap-0.5 rounded-md border border-border p-0.5"
      style={{ display: wide ? 'flex' : 'none' }}
      role="group"
      aria-label="Writing panels"
    >
      {order.map((index) => (
        <span
          key={index}
          className={dropTarget === index ? 'rounded-md ring-2 ring-ring' : undefined}
        >
          <Toggle
            size="xs"
            variant="segmented"
            pressed={visiblePanes[index]}
            aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
            title={`${visiblePanes[index] ? 'Hide' : 'Show'} ${PANE_LABELS[index]}. Drag to reorder.`}
            disabled={visiblePanes[index] && openCount === 1}
            onPressedChange={() => onToggle(index)}
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
            <GripVertical className="size-3 opacity-60" aria-hidden />
            {PANE_LABELS[index]}
          </Toggle>
        </span>
      ))}
    </div>
  )
}
