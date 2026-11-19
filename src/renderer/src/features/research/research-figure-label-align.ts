import { newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { attachmentOf } from './research-figure-element-meta'

export type LabelHAlign = 'left' | 'center' | 'right'
export type LabelVAlign = 'top' | 'middle' | 'bottom'

/** Excalidraw's room between a box and its bound text (its `BOUND_TEXT_PADDING`). */
const BOUND_PAD = 5
/** The room the canvas keeps around a kit label when a box grows to fit it (settling's pad). */
const GROUP_PAD_X = 8
const GROUP_PAD_Y = 6
const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])

/**
 * A label inside a box: Excalidraw's bound text (a label a person typed, a kit name without
 * math), or the kit's free lines and math that follow the box (a name with a math line).
 */
export type BoxedLabel =
  | { kind: 'bound'; box: ExcalidrawElement; members: [ExcalidrawElement] }
  | { kind: 'free'; box: ExcalidrawElement; members: ExcalidrawElement[] }

type Rect = { x: number; y: number; right: number; bottom: number }

function rectOf(members: readonly ExcalidrawElement[]): Rect {
  return {
    x: Math.min(...members.map((member) => member.x)),
    y: Math.min(...members.map((member) => member.y)),
    right: Math.max(...members.map((member) => member.x + member.width)),
    bottom: Math.max(...members.map((member) => member.y + member.height))
  }
}

/** Where a box's label may sit: Excalidraw's text area for bound text, the kit's pad otherwise. */
function innerOf(box: ExcalidrawElement, kind: BoxedLabel['kind']): Rect {
  if (kind === 'free') {
    return {
      x: box.x + GROUP_PAD_X,
      y: box.y + GROUP_PAD_Y,
      right: box.x + box.width - GROUP_PAD_X,
      bottom: box.y + box.height - GROUP_PAD_Y
    }
  }
  // Why the shape offsets: Excalidraw keeps bound text inside an ellipse's or diamond's outline.
  const inset =
    box.type === 'ellipse'
      ? [(box.width / 2) * (1 - Math.SQRT1_2), (box.height / 2) * (1 - Math.SQRT1_2)]
      : box.type === 'diamond'
        ? [box.width / 4, box.height / 4]
        : [0, 0]
  const width =
    box.type === 'ellipse'
      ? Math.round((box.width / 2) * Math.SQRT2)
      : box.type === 'diamond'
        ? Math.round(box.width / 2)
        : box.width
  const height =
    box.type === 'ellipse'
      ? Math.round((box.height / 2) * Math.SQRT2)
      : box.type === 'diamond'
        ? Math.round(box.height / 2)
        : box.height
  const x = box.x + inset[0] + BOUND_PAD
  const y = box.y + inset[1] + BOUND_PAD
  return { x, y, right: x + width - 2 * BOUND_PAD, bottom: y + height - 2 * BOUND_PAD }
}

/**
 * The labels inside boxes the selection reaches: the bound text of a selected box (or the text
 * itself while it is selected), and the free label of a selected box or of a selected line.
 */
export function boxedLabels(
  selected: readonly ExcalidrawElement[],
  elements: readonly ExcalidrawElement[]
): BoxedLabel[] {
  const live = elements.filter((element) => !element.isDeleted)
  const byId = new Map(live.map((element) => [element.id, element]))
  const owners = new Set<string>()
  for (const element of selected) {
    if (SHAPES.has(element.type)) {
      owners.add(element.id)
    }
    if (element.type === 'text' && element.containerId) {
      owners.add(element.containerId)
    }
    const attachment = attachmentOf(element, byId)
    if (attachment?.kind === 'box-label') {
      owners.add(attachment.to)
    }
  }
  const labels: BoxedLabel[] = []
  for (const id of owners) {
    const box = byId.get(id)
    if (!box || !SHAPES.has(box.type)) {
      continue
    }
    const bound = live.find((element) => element.type === 'text' && element.containerId === id)
    if (bound) {
      labels.push({ kind: 'bound', box, members: [bound] })
      continue
    }
    const free = live.filter((element) => {
      const attachment = attachmentOf(element, byId)
      return attachment?.kind === 'box-label' && attachment.to === id
    })
    if (free.length) {
      labels.push({ kind: 'free', box, members: free })
    }
  }
  return labels
}

const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1
const H_ALIGNS: readonly LabelHAlign[] = ['left', 'center', 'right']
const V_ALIGNS: readonly LabelVAlign[] = ['top', 'middle', 'bottom']
const hAlign = (value: string): LabelHAlign | null =>
  H_ALIGNS.find((align) => align === value) ?? null
const vAlign = (value: string): LabelVAlign | null =>
  V_ALIGNS.find((align) => align === value) ?? null

/** How a label sits in its box now; null where it is neither at an edge nor centred. */
function alignOf(label: BoxedLabel): { h: LabelHAlign | null; v: LabelVAlign | null } {
  const [first] = label.members
  if (label.kind === 'bound' && first.type === 'text') {
    return { h: hAlign(first.textAlign), v: vAlign(first.verticalAlign) }
  }
  const inner = innerOf(label.box, label.kind)
  const block = rectOf(label.members)
  const lines = label.members
  const h = lines.every((line) => near(line.x, inner.x))
    ? 'left'
    : lines.every((line) => near(line.x + line.width, inner.right))
      ? 'right'
      : near((block.x + block.right) / 2, (inner.x + inner.right) / 2)
        ? 'center'
        : null
  const v = near(block.y, inner.y)
    ? 'top'
    : near(block.bottom, inner.bottom)
      ? 'bottom'
      : near((block.y + block.bottom) / 2, (inner.y + inner.bottom) / 2)
        ? 'middle'
        : null
  return { h, v }
}

/** The labels' shared alignment, each axis null when they differ. */
export function labelAlignment(labels: readonly BoxedLabel[]): {
  h: LabelHAlign | null
  v: LabelVAlign | null
} {
  const all = labels.map(alignOf)
  const same = <T>(values: readonly (T | null)[]): T | null =>
    values.length && values.every((value) => value === values[0]) ? values[0] : null
  return { h: same(all.map((entry) => entry.h)), v: same(all.map((entry) => entry.v)) }
}

function placeAlong(start: number, end: number, size: number, align: string): number {
  if (align === 'left' || align === 'top') {
    return start
  }
  if (align === 'right' || align === 'bottom') {
    return end - size
  }
  return (start + end) / 2 - size / 2
}

/**
 * The scene with each label aligned in its box (PowerPoint's text box alignment): bound text
 * takes Excalidraw's `textAlign` / `verticalAlign` and the place Excalidraw would give it; a kit
 * label's lines line up on the edge or centre, and the block moves up or down as one.
 */
export function withLabelAlign(
  elements: readonly ExcalidrawElement[],
  labels: readonly BoxedLabel[],
  align: { h?: LabelHAlign; v?: LabelVAlign }
): ExcalidrawElement[] {
  const changes = new Map<string, ExcalidrawElement>()
  for (const label of labels) {
    const inner = innerOf(label.box, label.kind)
    const [first] = label.members
    if (label.kind === 'bound' && first.type === 'text') {
      const h = align.h ?? first.textAlign
      const v = align.v ?? first.verticalAlign
      changes.set(
        first.id,
        newElementWith(first, {
          textAlign: h,
          verticalAlign: v,
          x: placeAlong(inner.x, inner.right, first.width, h),
          y: placeAlong(inner.y, inner.bottom, first.height, v)
        })
      )
      continue
    }
    const block = rectOf(label.members)
    const dy =
      align.v === undefined
        ? 0
        : placeAlong(inner.y, inner.bottom, block.bottom - block.y, align.v) - block.y
    for (const member of label.members) {
      const x =
        align.h === undefined ? member.x : placeAlong(inner.x, inner.right, member.width, align.h)
      if (x !== member.x || dy !== 0) {
        changes.set(member.id, newElementWith(member, { x, y: member.y + dy }))
      }
    }
  }
  return elements.map((element) => changes.get(element.id) ?? element)
}
