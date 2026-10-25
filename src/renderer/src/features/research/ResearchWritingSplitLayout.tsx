import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  constrainWritingPaneRatios,
  DEFAULT_WRITING_PANE_ORDER,
  DEFAULT_WRITING_PANE_VISIBILITY,
  readWritingPaneRatios,
  resizeWritingPaneRatios,
  saveWritingPaneRatios,
  visibleWritingPaneIndexes,
  writingPaneDividerPair,
  writingPaneGridColumns,
  type WritingPaneIndex,
  type WritingPaneOrder,
  type WritingPaneRatios,
  type WritingPaneVisibility
} from './research-writing-pane-ratios'

export type WritingPane = 'agent' | 'source' | 'reader'

type Props = {
  experimentId: string
  wide: boolean
  activePane: WritingPane
  visiblePanes?: WritingPaneVisibility
  order?: WritingPaneOrder
  agent: ReactNode
  source: ReactNode
  reader: ReactNode
}

const PANE_LABELS = ['Writing agent', 'TeX source', 'compiled PDF'] as const

export function ResearchWritingSplitLayout({
  experimentId,
  wide,
  activePane,
  visiblePanes = DEFAULT_WRITING_PANE_VISIBILITY,
  order = DEFAULT_WRITING_PANE_ORDER,
  agent,
  source,
  reader
}: Props): React.JSX.Element {
  const [ratios, setRatios] = useState<WritingPaneRatios>(() => readWritingPaneRatios(experimentId))
  const [containerWidth, setContainerWidth] = useState(0)
  const [draggingDivider, setDraggingDivider] = useState<0 | 1 | null>(null)
  const ratiosRef = useRef(ratios)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const activeDragCleanup = useRef<((commitState: boolean) => void) | null>(null)
  // Why: fitting a narrower container (e.g. the Claims drawer) must not overwrite the saved widths.
  const shownRatios = wide
    ? constrainWritingPaneRatios(ratios, containerWidth, visiblePanes)
    : ratios
  const orderedVisible = visibleWritingPaneIndexes(visiblePanes, order)
  const panePosition = (pane: WritingPaneIndex): number => {
    const position = orderedVisible.indexOf(pane)
    return position === -1 ? 6 + pane : position * 2
  }

  const commitRatios = useCallback(
    (next: WritingPaneRatios): void => {
      ratiosRef.current = next
      setRatios(next)
      saveWritingPaneRatios(experimentId, next)
    },
    [experimentId]
  )

  useLayoutEffect(() => {
    activeDragCleanup.current?.(true)
    const container = containerRef.current
    if (!wide || !container) {
      return
    }
    const measure = (): void => {
      activeDragCleanup.current?.(true)
      setContainerWidth(container.getBoundingClientRect().width)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [order, visiblePanes, wide])

  useEffect(() => {
    const active = activeDragCleanup
    return () => active.current?.(false)
  }, [])

  const startResize = useCallback(
    (divider: 0 | 1, event: React.PointerEvent<HTMLDivElement>): void => {
      if (
        !wide ||
        event.button !== 0 ||
        activeDragCleanup.current ||
        !writingPaneDividerPair(visiblePanes, divider, order)
      ) {
        return
      }
      const container = containerRef.current
      if (!container) {
        return
      }
      event.preventDefault()
      const handle = event.currentTarget
      const pointerId = event.pointerId
      const startX = event.clientX
      const width = container.getBoundingClientRect().width
      const startRatios = constrainWritingPaneRatios(ratiosRef.current, width, visiblePanes)
      let draft = startRatios
      const priorCursor = document.body.style.cursor
      const priorUserSelect = document.body.style.userSelect
      const overlay = document.createElement('div')
      overlay.style.position = 'fixed'
      overlay.style.inset = '0'
      overlay.style.zIndex = '2147483647'
      overlay.style.cursor = 'col-resize'
      document.body.appendChild(overlay)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      setDraggingDivider(divider)
      try {
        handle.setPointerCapture(pointerId)
      } catch {
        // The overlay still receives pointer events when capture is unavailable.
      }

      const onMove = (move: PointerEvent): void => {
        if (move.pointerId !== pointerId) {
          return
        }
        draft = resizeWritingPaneRatios(
          startRatios,
          divider,
          move.clientX - startX,
          width,
          visiblePanes,
          order
        )
        container.style.gridTemplateColumns = writingPaneGridColumns(draft, visiblePanes, order)
      }

      let cleaned = false
      const cleanup = (commitState: boolean): void => {
        if (cleaned) {
          return
        }
        cleaned = true
        window.removeEventListener('pointermove', onMove, true)
        window.removeEventListener('pointerup', onEnd, true)
        window.removeEventListener('pointercancel', onEnd, true)
        window.removeEventListener('blur', onBlur)
        overlay.remove()
        document.body.style.cursor = priorCursor
        document.body.style.userSelect = priorUserSelect
        try {
          if (handle.hasPointerCapture(pointerId)) {
            handle.releasePointerCapture(pointerId)
          }
        } catch {
          // Chromium can drop capture before the pointer-up callback runs.
        }
        if (activeDragCleanup.current === cleanup) {
          activeDragCleanup.current = null
        }
        ratiosRef.current = draft
        saveWritingPaneRatios(experimentId, draft)
        if (commitState) {
          setRatios(draft)
          setDraggingDivider(null)
        }
      }
      const onEnd = (ended: PointerEvent): void => {
        if (ended.pointerId === pointerId) {
          cleanup(true)
        }
      }
      const onBlur = (): void => cleanup(true)
      window.addEventListener('pointermove', onMove, true)
      window.addEventListener('pointerup', onEnd, true)
      window.addEventListener('pointercancel', onEnd, true)
      window.addEventListener('blur', onBlur)
      activeDragCleanup.current = cleanup
    },
    [experimentId, order, visiblePanes, wide]
  )

  function onDividerKeyDown(divider: 0 | 1, event: React.KeyboardEvent<HTMLDivElement>): void {
    const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (!wide || direction === 0 || !writingPaneDividerPair(visiblePanes, divider, order)) {
      return
    }
    event.preventDefault()
    const width = containerRef.current?.getBoundingClientRect().width ?? 0
    commitRatios(
      resizeWritingPaneRatios(
        constrainWritingPaneRatios(ratiosRef.current, width, visiblePanes),
        divider,
        direction * (event.shiftKey ? 48 : 16),
        width,
        visiblePanes,
        order
      )
    )
  }

  function divider(index: 0 | 1): React.JSX.Element {
    const pair = writingPaneDividerPair(visiblePanes, index, order)
    const visibleTotal = orderedVisible.reduce<number>((sum, pane) => sum + shownRatios[pane], 0)
    const before = pair
      ? orderedVisible.slice(0, index + 1).reduce<number>((sum, pane) => sum + shownRatios[pane], 0)
      : 0
    const shown = wide && pair !== null
    return (
      <div
        className={`tab-group-split-resize-handle is-vertical outline-none focus-visible:ring-2 focus-visible:ring-ring ${draggingDivider === index ? 'is-dragging' : ''}`}
        style={{ display: shown ? 'block' : 'none', order: index * 2 + 1 }}
        role="separator"
        tabIndex={shown ? 0 : -1}
        aria-orientation="vertical"
        aria-label={pair ? `Resize ${PANE_LABELS[pair[0]]} and ${PANE_LABELS[pair[1]]}` : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={visibleTotal > 0 ? Math.round((before / visibleTotal) * 100) : 0}
        onPointerDown={(event) => startResize(index, event)}
        onKeyDown={(event) => onDividerKeyDown(index, event)}
      />
    )
  }

  return (
    <div
      ref={containerRef}
      className="grid min-h-0 min-w-0 flex-1 overflow-hidden"
      style={{
        gridTemplateColumns: wide
          ? writingPaneGridColumns(shownRatios, visiblePanes, order)
          : 'minmax(0, 1fr)'
      }}
    >
      <div
        className="flex min-h-0 min-w-0 flex-col overflow-hidden [&>*]:flex-1"
        style={{
          order: panePosition(0),
          display: wide
            ? visiblePanes[0]
              ? 'flex'
              : 'none'
            : activePane === 'agent'
              ? 'flex'
              : 'none'
        }}
      >
        {agent}
      </div>
      {divider(0)}
      <div
        className="flex min-h-0 min-w-0 flex-col overflow-hidden [&>*]:flex-1"
        style={{
          order: panePosition(1),
          display: wide
            ? visiblePanes[1]
              ? 'flex'
              : 'none'
            : activePane === 'source'
              ? 'flex'
              : 'none'
        }}
      >
        {source}
      </div>
      {divider(1)}
      <div
        className="flex min-h-0 min-w-0 flex-col overflow-hidden [&>*]:flex-1"
        style={{
          order: panePosition(2),
          display: wide
            ? visiblePanes[2]
              ? 'flex'
              : 'none'
            : activePane === 'reader'
              ? 'flex'
              : 'none'
        }}
      >
        {reader}
      </div>
    </div>
  )
}
