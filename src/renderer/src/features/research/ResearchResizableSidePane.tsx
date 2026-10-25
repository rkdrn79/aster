import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useSidebarResize } from '@/hooks/useSidebarResize'
import { cn } from '@/lib/utils'
import {
  clampToSidePaneBounds,
  readSidePaneWidth,
  saveSidePaneWidth,
  SIDE_PANE_RESIZE_STEP,
  type SidePaneWidthBounds,
  type SidePaneWidthLimits
} from './research-side-pane-width'

/** Preferred width that survives reloads; callers clamp it to the space they have. */
export function useStoredSidePaneWidth(
  storageKey: string,
  limits: SidePaneWidthLimits
): [number, (width: number) => void] {
  const [width, setWidth] = useState(() => readSidePaneWidth(storageKey, limits))
  const commit = useCallback(
    (next: number): void => {
      setWidth(next)
      saveSidePaneWidth(storageKey, next, limits)
    },
    [limits, storageKey]
  )
  return [width, commit]
}

type Props = {
  /** Outer edge the pane sits on; its resize handle is on the opposite, inner edge. */
  side: 'start' | 'end'
  label: string
  width: number
  bounds: SidePaneWidthBounds
  defaultWidth: number
  onWidthChange: (width: number) => void
  onResizingChange?: (resizing: boolean) => void
  /** Keeps the pane's content mounted while it is out of the layout. */
  hidden?: boolean
  children: ReactNode
}

export function ResearchResizableSidePane({
  side,
  label,
  width,
  bounds,
  defaultWidth,
  onWidthChange,
  onResizingChange,
  hidden = false,
  children
}: Props): React.JSX.Element {
  const towardEnd = side === 'start' ? 1 : -1
  const { containerRef, isResizing, onResizeStart } = useSidebarResize<HTMLDivElement>({
    isOpen: true,
    width,
    minWidth: bounds.minWidth,
    maxWidth: bounds.maxWidth,
    deltaSign: towardEnd,
    setWidth: onWidthChange
  })

  useEffect(() => {
    onResizingChange?.(isResizing)
  }, [isResizing, onResizingChange])

  function onMouseDown(event: React.MouseEvent<HTMLDivElement>): void {
    // Why: the drag overlay swallows dblclick, so the second press of a double-click resets.
    if (event.detail > 1) {
      event.preventDefault()
      onWidthChange(defaultWidth)
      return
    }
    if (event.button === 0) {
      onResizeStart(event)
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const arrow = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    const next =
      event.key === 'Home'
        ? bounds.minWidth
        : event.key === 'End'
          ? bounds.maxWidth
          : arrow
            ? width + arrow * towardEnd * SIDE_PANE_RESIZE_STEP * (event.shiftKey ? 3 : 1)
            : null
    if (next === null) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    onWidthChange(clampToSidePaneBounds(next, bounds))
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative flex min-h-0 shrink-0 flex-col', hidden && 'hidden')}
      style={{ width }}
    >
      {children}
      <div
        role="separator"
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={Math.round(bounds.minWidth)}
        aria-valuemax={Math.round(bounds.maxWidth)}
        aria-valuenow={Math.round(width)}
        title="Drag to resize · double-click to reset"
        tabIndex={0}
        className={cn(
          'group absolute inset-y-0 z-30 w-1.5 cursor-col-resize outline-none focus-visible:ring-2 focus-visible:ring-ring',
          side === 'start' ? '-right-1' : '-left-1'
        )}
        onMouseDown={onMouseDown}
        onKeyDown={onKeyDown}
      >
        <div
          className={cn(
            'h-full w-px transition-colors group-hover:bg-ring group-focus-visible:bg-ring',
            side === 'start' ? 'ml-px' : 'ml-1',
            isResizing ? 'bg-ring' : 'bg-border'
          )}
        />
      </div>
    </div>
  )
}
