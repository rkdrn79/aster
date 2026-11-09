import {
  PAGE_FRAME_ID,
  type FigureElement
} from '../../../../research-harness/research-figures-model.mjs'
import { figureElementLabel } from './research-figure-diff'

/** One thing a person sees as selected: a group, a box with its label and badges, an arrow. */
export type FigureSelectionItem = { key: string; label: string; ids: string[] }

const ATTACHMENT = /^(.+?)-(trainable|frozen|label-group|label(?:-.+)?)$/

/** The element an attached badge or label belongs to (`customData.asterAttach`, else its id). */
export function attachedTo(element: FigureElement): string | null {
  const attach = element.customData?.asterAttach
  if (attach && typeof attach === 'object') {
    const to: unknown = Reflect.get(attach, 'to')
    if (typeof to === 'string') {
      return to
    }
  }
  return ATTACHMENT.exec(element.id)?.[1] ?? null
}

function outermostGroup(element: FigureElement): string | null {
  const groups = Array.isArray(element.groupIds) ? element.groupIds : []
  const last: unknown = groups.at(-1)
  return typeof last === 'string' ? last : null
}

/**
 * The selection as a person counts it: a group is one item, a label bound to a box goes with the
 * box, and a badge or arrow label goes with what it is attached to when that is selected too.
 */
export function figureSelectionItems(
  elements: readonly FigureElement[],
  selectedIds: Readonly<Record<string, boolean | undefined>>
): FigureSelectionItem[] {
  const selected = elements.filter(
    (element) => selectedIds[element.id] && !element.isDeleted && element.id !== PAGE_FRAME_ID
  )
  const keyOf = new Map<string, string>()
  for (const element of selected) {
    const container = typeof element.containerId === 'string' ? element.containerId : null
    keyOf.set(element.id, outermostGroup(element) ?? container ?? element.id)
  }
  for (const element of selected) {
    const owner = attachedTo(element)
    const ownerKey = owner ? keyOf.get(owner) : undefined
    if (ownerKey) {
      keyOf.set(element.id, ownerKey)
    }
  }
  const items = new Map<string, string[]>()
  for (const element of selected) {
    const key = keyOf.get(element.id) ?? element.id
    items.set(key, [...(items.get(key) ?? []), element.id])
  }
  const byId = new Map(selected.map((element) => [element.id, element]))
  return [...items].map(([key, ids]) => {
    const members = ids.flatMap((id) => byId.get(id) ?? [])
    const main = members.find((element) => element.type !== 'text') ?? members[0]
    return { key, ids, label: main ? figureElementLabel(main, elements) : key }
  })
}

/** "2 selected — predictor, target encoder" (at most three names). */
export function figureSelectionText(items: readonly FigureSelectionItem[]): string {
  const names = items.slice(0, 3).map((item) => item.label)
  const more = items.length > 3 ? `, +${items.length - 3}` : ''
  return items.length ? `${items.length} selected — ${names.join(', ')}${more}` : 'nothing selected'
}

export type FigureBox = { x: number; y: number; width: number; height: number }

/** An element's box in scene units, lines and arrows by their points. */
export function figureElementBox(element: FigureElement): FigureBox {
  const points = Array.isArray(element.points) ? element.points : null
  if (points?.length) {
    const xs = points.map((point: unknown) => (Array.isArray(point) ? Number(point[0]) : 0))
    const ys = points.map((point: unknown) => (Array.isArray(point) ? Number(point[1]) : 0))
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    return {
      x: element.x + minX,
      y: element.y + minY,
      width: Math.max(...xs) - minX,
      height: Math.max(...ys) - minY
    }
  }
  return { x: element.x, y: element.y, width: element.width, height: element.height }
}

/** The box around the selected elements, in scene units. */
export function figureSelectionBounds(
  elements: readonly FigureElement[],
  selectedIds: Readonly<Record<string, boolean | undefined>>
): FigureBox | null {
  const boxes = elements
    .filter(
      (element) => selectedIds[element.id] && !element.isDeleted && element.id !== PAGE_FRAME_ID
    )
    .map(figureElementBox)
  if (!boxes.length) {
    return null
  }
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  return {
    x,
    y,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - y
  }
}
