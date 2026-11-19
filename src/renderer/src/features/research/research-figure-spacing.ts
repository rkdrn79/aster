import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { PAGE_FRAME_ID } from '../../../../research-harness/research-figures-model.mjs'
import { uniformGap } from './research-figure-align'
import { selectionUnits, type SelectionUnit } from './research-figure-geometry-edit'
import { isPanelElement } from './research-figure-panel-fit'
import type { SceneBox } from './ResearchFigureCanvasOverlays'

/** Gaps within this many scene units (a quarter point) count as equal. */
const EQUAL = 0.5
const FAR = 400

/**
 * A distance to show: along `axis`, from `from` to `to`, drawn at `at` across it. `equal` marks
 * a gap that matches its neighbour's (PowerPoint's equal-spacing arrows).
 */
export type SpacingMark = {
  axis: 'x' | 'y'
  from: number
  to: number
  at: number
  gap: number
  equal: boolean
}

type Side = 'left' | 'right' | 'up' | 'down'
const AXIS: Record<Side, 'x' | 'y'> = { left: 'x', right: 'x', up: 'y', down: 'y' }

const overlapMid = (a0: number, a1: number, b0: number, b1: number): number | null => {
  const low = Math.max(a0, b0)
  const high = Math.min(a1, b1)
  return high - low > 0.5 ? (low + high) / 2 : null
}

/** The nearest box on one side of `box`, overlapping it across, and the gap to it. */
function neighbour(
  box: SceneBox,
  others: readonly SceneBox[],
  side: Side
): { other: SceneBox; gap: number; at: number } | null {
  let best: { other: SceneBox; gap: number; at: number } | null = null
  for (const other of others) {
    const at =
      AXIS[side] === 'x'
        ? overlapMid(box.y, box.y + box.height, other.y, other.y + other.height)
        : overlapMid(box.x, box.x + box.width, other.x, other.x + other.width)
    if (at === null) {
      continue
    }
    const gap =
      side === 'left'
        ? box.x - (other.x + other.width)
        : side === 'right'
          ? other.x - (box.x + box.width)
          : side === 'up'
            ? box.y - (other.y + other.height)
            : other.y - (box.y + box.height)
    if (gap >= -0.01 && gap <= FAR && (!best || gap < best.gap)) {
      best = { other, gap: Math.max(0, gap), at }
    }
  }
  return best
}

function markBetween(near: SceneBox, far: SceneBox, side: Side, gap: number, at: number) {
  const axis = AXIS[side]
  const [from, to] =
    side === 'left'
      ? [far.x + far.width, near.x]
      : side === 'right'
        ? [near.x + near.width, far.x]
        : side === 'up'
          ? [far.y + far.height, near.y]
          : [near.y + near.height, far.y]
  return { axis, from, to, at, gap, equal: false }
}

/**
 * While a box is dragged: its distance to the nearest box on each side, in scene units, and
 * where a neighbour's own next gap (or the gap on the other side) is the same, both marked equal.
 */
export function dragSpacing(moving: SceneBox, others: readonly SceneBox[]): SpacingMark[] {
  const marks: SpacingMark[] = []
  const found = new Map<Side, { mark: SpacingMark; other: SceneBox }>()
  for (const side of ['left', 'right', 'up', 'down'] as const) {
    const near = neighbour(moving, others, side)
    if (near) {
      const mark = markBetween(moving, near.other, side, near.gap, near.at)
      found.set(side, { mark, other: near.other })
      marks.push(mark)
    }
  }
  for (const [side, opposite] of [
    ['left', 'right'],
    ['up', 'down']
  ] as const) {
    const a = found.get(side)
    const b = found.get(opposite)
    if (a && b && Math.abs(a.mark.gap - b.mark.gap) <= EQUAL) {
      a.mark.equal = true
      b.mark.equal = true
    }
  }
  for (const [side, { mark, other }] of found) {
    const next = neighbour(
      other,
      others.filter((box) => box !== other),
      side
    )
    if (next && Math.abs(next.gap - mark.gap) <= EQUAL) {
      mark.equal = true
      marks.push({ ...markBetween(other, next.other, side, next.gap, next.at), equal: true })
    }
  }
  return marks
}

/** The boxes a dragged selection measures against: every other thing, not panels or the page. */
export function spacingNeighbours(
  elements: readonly ExcalidrawElement[],
  movingIds: ReadonlySet<string>
): SceneBox[] {
  const candidates = elements.filter(
    (element) =>
      !element.isDeleted &&
      !movingIds.has(element.id) &&
      element.id !== PAGE_FRAME_ID &&
      element.type !== 'frame' &&
      element.type !== 'arrow' &&
      element.type !== 'line' &&
      !(element.type === 'text' && element.containerId) &&
      !isPanelElement(element)
  )
  return selectionUnits(candidates, elements)
    .filter((unit) => !isPanelElement(unit.primary))
    .map((unit) => unit.box)
}

/** One handle per gap between evenly spaced units (Figma's smart selection), along their axis. */
export type GapHandle = { index: number; axis: 'x' | 'y'; x: number; y: number; gap: number }

export function gapHandles(units: readonly SelectionUnit[]): GapHandle[] {
  if (units.length < 3) {
    return []
  }
  const { axis, gap } = uniformGap(units)
  if (gap === null) {
    return []
  }
  const sorted = units.toSorted((a, b) => (axis === 'x' ? a.box.x - b.box.x : a.box.y - b.box.y))
  return sorted.slice(1).map((unit, index) => {
    const before = sorted[index].box
    const after = unit.box
    if (axis === 'x') {
      const top = Math.max(before.y, after.y)
      const bottom = Math.min(before.y + before.height, after.y + after.height)
      return {
        index,
        axis,
        x: before.x + before.width + gap / 2,
        y:
          bottom > top
            ? (top + bottom) / 2
            : (before.y + before.height / 2 + after.y + after.height / 2) / 2,
        gap
      }
    }
    const left = Math.max(before.x, after.x)
    const right = Math.min(before.x + before.width, after.x + after.width)
    return {
      index,
      axis,
      x:
        right > left
          ? (left + right) / 2
          : (before.x + before.width / 2 + after.x + after.width / 2) / 2,
      y: before.y + before.height + gap / 2,
      gap
    }
  })
}
