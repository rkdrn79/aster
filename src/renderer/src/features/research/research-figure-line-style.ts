import { newElementWith } from '@excalidraw/excalidraw'
import type { Arrowhead, ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { FIGURE_UNITS_PER_POINT } from '../../../../research-harness/research-figures-model.mjs'

/** A line end as PowerPoint names them, and the Excalidraw arrowhead it draws. */
export type LineEnd = 'none' | 'triangle' | 'open' | 'bar' | 'dot'
export const LINE_ENDS: readonly { end: LineEnd; head: Arrowhead | null; label: string }[] = [
  { end: 'none', head: null, label: 'No head' },
  { end: 'triangle', head: 'triangle', label: 'Triangle head' },
  { end: 'open', head: 'arrow', label: 'Open head' },
  { end: 'bar', head: 'bar', label: 'Bar' },
  { end: 'dot', head: 'dot', label: 'Dot' }
]

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])
const LINES = new Set(['arrow', 'line'])

export const isShape = (element: ExcalidrawElement): boolean => SHAPES.has(element.type)
export const isLine = (element: ExcalidrawElement): boolean => LINES.has(element.type)

function shared<T>(values: readonly T[]): T | null {
  return values.length && values.every((value) => value === values[0]) ? values[0] : null
}

/** The arrows' shared end at one side; null when they differ or there are none. */
export function lineEndOf(
  selected: readonly ExcalidrawElement[],
  side: 'start' | 'end'
): LineEnd | null {
  const heads = selected.flatMap((element) =>
    element.type === 'arrow'
      ? [side === 'start' ? element.startArrowhead : element.endArrowhead]
      : []
  )
  const distinct = new Set(heads)
  if (distinct.size !== 1) {
    return null
  }
  const [head] = distinct
  return LINE_ENDS.find((entry) => entry.head === head)?.end ?? null
}

/** Every selected arrow with `end` at one side (Format Shape › Line › Begin / End type). */
export function withLineEnd(
  elements: readonly ExcalidrawElement[],
  ids: ReadonlySet<string>,
  side: 'start' | 'end',
  end: LineEnd
): ExcalidrawElement[] {
  const head = LINE_ENDS.find((entry) => entry.end === end)?.head ?? null
  return elements.map((element) =>
    ids.has(element.id) && element.type === 'arrow'
      ? newElementWith(
          element,
          side === 'start' ? { startArrowhead: head } : { endArrowhead: head }
        )
      : element
  )
}

/** The outlines' and lines' shared width in points; null when mixed or none. */
export function lineWidthPt(selected: readonly ExcalidrawElement[]): number | null {
  const widths = selected.filter((element) => isShape(element) || isLine(element))
  const width = shared(widths.map((element) => element.strokeWidth))
  return width === null ? null : width / FIGURE_UNITS_PER_POINT
}

/**
 * Lines and outlines `pt` points wide. A line whose role draws another width loses the role mark,
 * so Select same and the role chips stop calling it what it no longer looks like.
 */
export function withLineWidth(
  elements: readonly ExcalidrawElement[],
  ids: ReadonlySet<string>,
  pt: number,
  roleWidth: (element: ExcalidrawElement) => number | null
): ExcalidrawElement[] {
  const strokeWidth = Math.min(8, Math.max(0.25, pt)) * FIGURE_UNITS_PER_POINT
  return elements.map((element) => {
    if (!ids.has(element.id) || !(isShape(element) || isLine(element))) {
      return element
    }
    const role = isLine(element) ? roleWidth(element) : null
    if (role === null || Math.abs(role - strokeWidth) < 0.01) {
      return newElementWith(element, { strokeWidth })
    }
    const { asterRole: _role, asterLine: _line, ...customData } = element.customData ?? {}
    return newElementWith(element, { strokeWidth, customData })
  })
}

export type Paint = Partial<{
  strokeStyle: 'solid' | 'dashed' | 'dotted'
  strokeColor: string
  backgroundColor: string
  opacity: number
}>

/**
 * Paint for the selection as a person means it: a fill goes to shapes only (never the label lines
 * and math grouped with a box), an outline and a dash to shapes and lines, opacity to everything.
 */
export function withPaint(
  elements: readonly ExcalidrawElement[],
  ids: ReadonlySet<string>,
  paint: Paint
): ExcalidrawElement[] {
  return elements.map((element) => {
    if (!ids.has(element.id)) {
      return element
    }
    const outlined = isShape(element) || isLine(element)
    const update = {
      ...(paint.backgroundColor !== undefined && isShape(element)
        ? { backgroundColor: paint.backgroundColor }
        : {}),
      ...(paint.strokeColor !== undefined && outlined ? { strokeColor: paint.strokeColor } : {}),
      ...(paint.strokeStyle !== undefined && outlined ? { strokeStyle: paint.strokeStyle } : {}),
      ...(paint.opacity === undefined ? {} : { opacity: paint.opacity })
    }
    return Object.keys(update).length ? newElementWith(element, update) : element
  })
}
