import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { spaceEvenly, translate, type SelectionUnit } from './research-figure-geometry-edit'
import type { SceneBox } from './ResearchFigureCanvasOverlays'

export type AlignEdge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type DistributeAxis = 'x' | 'y'

/** The box around the units' shapes: what "align to selection" lines things up against. */
export function unitsBox(units: readonly SelectionUnit[]): SceneBox | null {
  if (!units.length) {
    return null
  }
  const x = Math.min(...units.map((unit) => unit.box.x))
  const y = Math.min(...units.map((unit) => unit.box.y))
  const right = Math.max(...units.map((unit) => unit.box.x + unit.box.width))
  const bottom = Math.max(...units.map((unit) => unit.box.y + unit.box.height))
  return { x, y, width: right - x, height: bottom - y }
}

function along(box: SceneBox, edge: AlignEdge): number {
  switch (edge) {
    case 'left':
      return box.x
    case 'center':
      return box.x + box.width / 2
    case 'right':
      return box.x + box.width
    case 'top':
      return box.y
    case 'middle':
      return box.y + box.height / 2
    case 'bottom':
      return box.y + box.height
  }
}

const HORIZONTAL = new Set<AlignEdge>(['left', 'center', 'right'])

/**
 * Lines each unit's shape up with `reference` on one edge or centre: a box moves with its label,
 * math and badges (settling then brings followers and connectors along).
 */
export function alignUnits(
  elements: readonly ExcalidrawElement[],
  units: readonly SelectionUnit[],
  edge: AlignEdge,
  reference: SceneBox
): ExcalidrawElement[] {
  const target = along(reference, edge)
  const horizontal = HORIZONTAL.has(edge)
  let next = [...elements]
  for (const unit of units) {
    const delta = target - along(unit.box, edge)
    if (Math.abs(delta) < 0.01) {
      continue
    }
    const ids = new Set(unit.members.map((member) => member.id))
    next = translate(next, ids, horizontal ? delta : 0, horizontal ? 0 : delta)
  }
  return next
}

function sortedAlong(units: readonly SelectionUnit[], axis: DistributeAxis): SelectionUnit[] {
  return units.toSorted((a, b) => (axis === 'x' ? a.box.x - b.box.x : a.box.y - b.box.y))
}

/**
 * Equal gaps between units along an axis, the first and last staying where they are; when they
 * overlap along it (no room for gaps), their centres are spread evenly instead.
 */
export function distributeUnits(
  elements: readonly ExcalidrawElement[],
  units: readonly SelectionUnit[],
  axis: DistributeAxis
): ExcalidrawElement[] {
  if (units.length < 3) {
    return [...elements]
  }
  const sorted = sortedAlong(units, axis)
  const start = (unit: SelectionUnit) => (axis === 'x' ? unit.box.x : unit.box.y)
  const size = (unit: SelectionUnit) => (axis === 'x' ? unit.box.width : unit.box.height)
  const [first] = sorted
  const last = sorted.at(-1) ?? first
  const span = start(last) + size(last) - start(first)
  const total = sorted.reduce((sum, unit) => sum + size(unit), 0)
  const gap = (span - total) / (sorted.length - 1)
  const centres = gap < 0
  const firstCentre = start(first) + size(first) / 2
  const step = (start(last) + size(last) / 2 - firstCentre) / (sorted.length - 1)
  let next = [...elements]
  let edge = start(first) + size(first)
  sorted.slice(1, -1).forEach((unit, index) => {
    const wanted = centres ? firstCentre + step * (index + 1) - size(unit) / 2 : edge + gap
    const delta = wanted - start(unit)
    const ids = new Set(unit.members.map((member) => member.id))
    next = translate(next, ids, axis === 'x' ? delta : 0, axis === 'x' ? 0 : delta)
    edge = wanted + size(unit)
  })
  return next
}

/** The axis the units run along: the longer spread of their centres. */
export function unitsAxis(units: readonly SelectionUnit[]): DistributeAxis {
  const xs = units.map((unit) => unit.box.x + unit.box.width / 2)
  const ys = units.map((unit) => unit.box.y + unit.box.height / 2)
  return Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 'x' : 'y'
}

/**
 * The gap between neighbouring units along the axis they run along, when every gap is the same
 * (within `tolerance` scene units); null for fewer than two units, overlaps or uneven gaps.
 */
export function uniformGap(
  units: readonly SelectionUnit[],
  tolerance = 0.5
): { axis: DistributeAxis; gap: number | null } {
  const axis = unitsAxis(units)
  if (units.length < 2) {
    return { axis, gap: null }
  }
  const sorted = sortedAlong(units, axis)
  const gaps = sorted.slice(1).map((unit, index) => {
    const before = sorted[index].box
    return axis === 'x'
      ? unit.box.x - (before.x + before.width)
      : unit.box.y - (before.y + before.height)
  })
  const low = Math.min(...gaps)
  const high = Math.max(...gaps)
  return { axis, gap: low >= 0 && high - low <= tolerance ? (low + high) / 2 : null }
}

/** Sets every gap between neighbouring units to `gap` scene units, the first one staying. */
export function setUnitsGap(
  elements: readonly ExcalidrawElement[],
  units: readonly SelectionUnit[],
  gap: number
): ExcalidrawElement[] {
  return spaceEvenly(elements, units, Math.max(0, gap))
}
