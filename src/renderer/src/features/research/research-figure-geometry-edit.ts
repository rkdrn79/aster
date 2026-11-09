import { getCommonBounds, newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { attachmentOf } from './research-figure-element-meta'
import type { SceneBox } from './ResearchFigureCanvasOverlays'

/** One thing in a selection: a group (outermost) or a lone element, with its main shape. */
export type SelectionUnit = {
  key: string
  members: ExcalidrawElement[]
  primary: ExcalidrawElement
  box: SceneBox
}

const SIZED = new Set(['rectangle', 'ellipse', 'diamond', 'image', 'frame', 'text'])

function boxOf(elements: readonly ExcalidrawElement[]): SceneBox {
  const [minX, minY, maxX, maxY] = getCommonBounds(elements)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * The selection as units. Badges and arrow labels ride with their owners and do not count;
 * a unit's box is its shapes' bounds.
 */
export function selectionUnits(
  selected: readonly ExcalidrawElement[],
  elements: readonly ExcalidrawElement[]
): SelectionUnit[] {
  const byId = new Map(elements.map((element) => [element.id, element]))
  const groups = new Map<string, ExcalidrawElement[]>()
  for (const element of selected) {
    const attachment = attachmentOf(element, byId)
    if (attachment && attachment.kind !== 'box-label' && attachment.kind !== 'title') {
      continue
    }
    const key = element.groupIds.at(-1) ?? element.id
    groups.set(key, [...(groups.get(key) ?? []), element])
  }
  return [...groups.entries()].map(([key, members]) => {
    const shapes = members.filter(
      (member) =>
        SIZED.has(member.type) && !member.groupIds.some((id) => id.endsWith('-label-group'))
    )
    const primary = (shapes.length ? shapes : members).toSorted(
      (a, b) => b.width * b.height - a.width * a.height
    )[0]
    return { key, members, primary, box: boxOf(shapes.length ? shapes : members) }
  })
}

export function translate(
  elements: readonly ExcalidrawElement[],
  ids: ReadonlySet<string>,
  dx: number,
  dy: number
): ExcalidrawElement[] {
  if (!dx && !dy) {
    return [...elements]
  }
  return elements.map((element) =>
    ids.has(element.id)
      ? newElementWith(element, { x: element.x + dx, y: element.y + dy })
      : element
  )
}

/** Sets a unit's place and size: X/Y move all of it, W/H size its main shape (labels follow). */
export function setUnitBox(
  elements: readonly ExcalidrawElement[],
  unit: SelectionUnit,
  next: Partial<SceneBox>
): ExcalidrawElement[] {
  const ids = new Set(unit.members.map((member) => member.id))
  const moved = translate(
    elements,
    ids,
    next.x === undefined ? 0 : next.x - unit.box.x,
    next.y === undefined ? 0 : next.y - unit.box.y
  )
  if (next.width === undefined && next.height === undefined) {
    return moved
  }
  return moved.map((element) =>
    element.id === unit.primary.id
      ? newElementWith(element, {
          width: Math.max(1, next.width ?? element.width),
          height: Math.max(1, next.height ?? element.height)
        })
      : element
  )
}

/** Every unit's main shape takes the widest (or tallest) one's size, keeping its centre. */
export function matchSize(
  elements: readonly ExcalidrawElement[],
  units: readonly SelectionUnit[],
  axis: 'width' | 'height'
): ExcalidrawElement[] {
  const size = Math.max(...units.map((unit) => unit.primary[axis]))
  const primaries = new Set(units.map((unit) => unit.primary.id))
  return elements.map((element) => {
    if (!primaries.has(element.id)) {
      return element
    }
    return axis === 'width'
      ? newElementWith(element, { x: element.x + (element.width - size) / 2, width: size })
      : newElementWith(element, { y: element.y + (element.height - size) / 2, height: size })
  })
}

/** Lays units out along their longer spread with the same gap between each, the first fixed. */
export function spaceEvenly(
  elements: readonly ExcalidrawElement[],
  units: readonly SelectionUnit[],
  gap: number
): ExcalidrawElement[] {
  if (units.length < 2) {
    return [...elements]
  }
  const xs = units.map((unit) => unit.box.x + unit.box.width / 2)
  const ys = units.map((unit) => unit.box.y + unit.box.height / 2)
  const across = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys)
  const sorted = units.toSorted((a, b) => (across ? a.box.x - b.box.x : a.box.y - b.box.y))
  let next = [...elements]
  let edge = across ? sorted[0].box.x + sorted[0].box.width : sorted[0].box.y + sorted[0].box.height
  for (const unit of sorted.slice(1)) {
    const ids = new Set(unit.members.map((member) => member.id))
    const delta = edge + gap - (across ? unit.box.x : unit.box.y)
    next = translate(next, ids, across ? delta : 0, across ? 0 : delta)
    edge += gap + (across ? unit.box.width : unit.box.height)
  }
  return next
}
