import { useRef, useState } from 'react'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'
import { equalWeights, resizeWeights } from './research-split-layout'
import { setResearchSplitWeights, useResearchSplit } from './research-split-store'

const KEY_STEP_PX = 32

/**
 * The shell gap between two columns, which resizes them. While dragging, a cover takes the
 * pointer so a side's page underneath cannot swallow the moves. Double-click evens the columns.
 */
export function ResearchSplitDivider({
  index,
  columnsWidth
}: {
  /** The divider sits after this column. */
  index: number
  /** The width the columns share, without the gaps between them. */
  columnsWidth: number
}): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; weights: number[] } | null>(null)
  const weights = useResearchSplit((state) => state.weights)
  const sum = weights.reduce((total, weight) => total + weight, 0)
  const share = sum > 0 ? Math.round(((weights[index] ?? 0) / sum) * 100) : 0

  const moveBy = (deltaPx: number, from: readonly number[]): void => {
    setResearchSplitWeights(resizeWeights(from, index, deltaPx, columnsWidth))
  }

  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize projects"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={share}
        tabIndex={0}
        data-research-split-divider={index}
        className="group relative w-2 shrink-0 cursor-col-resize outline-none [-webkit-app-region:no-drag]"
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return
          }
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          start.current = { x: event.clientX, weights: useResearchSplit.getState().weights }
          setDragging(true)
        }}
        onPointerMove={(event) => {
          if (start.current) {
            moveBy(event.clientX - start.current.x, start.current.weights)
          }
        }}
        onPointerUp={(event) => {
          start.current = null
          setDragging(false)
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onLostPointerCapture={() => {
          start.current = null
          setDragging(false)
        }}
        onDoubleClick={() => setResearchSplitWeights(equalWeights(weights.length))}
        onKeyDown={(event) => {
          if (isImeOwnedKeyboardEvent(event.nativeEvent)) {
            return
          }
          const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
          if (step !== 0) {
            event.preventDefault()
            moveBy(step * (event.shiftKey ? KEY_STEP_PX * 4 : KEY_STEP_PX), weights)
          }
        }}
      >
        <span
          aria-hidden
          className={
            dragging
              ? 'absolute inset-y-3 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-ring'
              : 'absolute inset-y-3 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-transparent transition-colors duration-(--duration-fast) group-hover:bg-ring/50 group-focus-visible:bg-ring'
          }
        />
      </div>
      {dragging ? <div aria-hidden className="fixed inset-0 z-50 cursor-col-resize" /> : null}
    </>
  )
}
