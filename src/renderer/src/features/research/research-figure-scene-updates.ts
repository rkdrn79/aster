import { newElementWith } from '@excalidraw/excalidraw'
import type {
  ExcalidrawElement,
  ExcalidrawLinearElement
} from '@excalidraw/excalidraw/element/types'
import type { Point } from './research-figure-orthogonal-route'
import type { SettleUpdate } from './research-figure-settle-state'

type LocalPoint = ExcalidrawLinearElement['points'][number]

/** Points relative to a line's x/y, in the branded form Excalidraw's elements carry. */
export function localPoints(points: readonly Point[]): LocalPoint[] {
  return points.map(([x, y]) => {
    const point: [number, number] = [x, y]
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: LocalPoint is a plain [x, y] tuple with a compile-time brand; these are relative to the line's x/y.
    return point as LocalPoint
  })
}

/** A settled change as a new version of the element (one Excalidraw records and undoes). */
export function applySettleUpdate(
  element: ExcalidrawElement,
  update: SettleUpdate
): ExcalidrawElement {
  const { points, fontSize, ...rest } = update
  if (points && (element.type === 'arrow' || element.type === 'line')) {
    return newElementWith(element, { ...rest, points: localPoints(points) })
  }
  if (fontSize !== undefined && element.type === 'text') {
    return newElementWith(element, { ...rest, fontSize })
  }
  return newElementWith(element, rest)
}

/** The scene with these updates applied; untouched elements keep their identity. */
export function withSettleUpdates(
  elements: readonly ExcalidrawElement[],
  updates: ReadonlyMap<string, SettleUpdate>
): ExcalidrawElement[] {
  return elements.map((element) => {
    const update = updates.get(element.id)
    return update ? applySettleUpdate(element, update) : element
  })
}
