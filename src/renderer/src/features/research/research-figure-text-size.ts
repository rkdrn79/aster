import { newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { FIGURE_UNITS_PER_POINT } from '../../../../research-harness/research-figures-model.mjs'

/** Room kept between a box and its bound label when the box grows to hold a bigger label. */
const PAD_X = 5
const PAD_Y = 5
/** The canvas's text step (⌘⇧> / ⌘⇧< and the Inspector's buttons): half a point. */
export const FIGURE_TEXT_STEP_PT = 0.5
const MIN_PT = 4
const MAX_PT = 72

const live = (element: ExcalidrawElement): boolean => !element.isDeleted

/** A label's group: the kit's `<owner>-label-group`, holding its lines and math. */
function labelGroup(element: ExcalidrawElement): string | null {
  return element.groupIds.find((id) => id.endsWith('-label-group')) ?? null
}

/**
 * The texts a size change reaches: selected texts, the bound labels of selected boxes, and every
 * line of a label group something selected belongs to.
 */
export function figureTextTargets(
  selected: readonly ExcalidrawElement[],
  elements: readonly ExcalidrawElement[]
): ExcalidrawElement[] {
  const ids = new Set(selected.map((element) => element.id))
  const groups = new Set(selected.flatMap((element) => labelGroup(element) ?? []))
  return elements.filter(
    (element) =>
      live(element) &&
      element.type === 'text' &&
      (ids.has(element.id) ||
        (element.containerId !== null && ids.has(element.containerId)) ||
        element.groupIds.some((id) => groups.has(id)))
  )
}

const fontSizeOf = (element: ExcalidrawElement): number =>
  element.type === 'text' ? element.fontSize : 0

/** The targets' size in points when they share one (to 0.1 pt); null when mixed or empty. */
export function figureTextPt(targets: readonly ExcalidrawElement[]): number | null {
  const sizes = new Set(targets.map((element) => Math.round(fontSizeOf(element) * 10)))
  if (sizes.size !== 1) {
    return null
  }
  return Math.round((fontSizeOf(targets[0]) / FIGURE_UNITS_PER_POINT) * 10) / 10
}

type Cluster = { members: ExcalidrawElement[]; main: number; anchor: [number, number] }

function boundsOf(members: readonly ExcalidrawElement[]) {
  const x = Math.min(...members.map((member) => member.x))
  const y = Math.min(...members.map((member) => member.y))
  const right = Math.max(...members.map((member) => member.x + member.width))
  const bottom = Math.max(...members.map((member) => member.y + member.height))
  return { x, y, right, bottom }
}

/**
 * Where a label stays put as it grows. A label group (a box's or an arrow's lines and math) keeps
 * its centre: the kit writes its lines left/top-aligned but places them centred. A bound label
 * keeps the edge or centre it is aligned to; a free text (a panel title) keeps its corner.
 */
function anchorOf(members: readonly ExcalidrawElement[], grouped: boolean): [number, number] {
  const box = boundsOf(members)
  const centre: [number, number] = [(box.x + box.right) / 2, (box.y + box.bottom) / 2]
  const [first] = members
  if (grouped || first?.type !== 'text') {
    return centre
  }
  const x = first.textAlign === 'left' ? box.x : first.textAlign === 'right' ? box.right : centre[0]
  const bound = first.containerId !== null
  const y =
    !bound || first.verticalAlign === 'top'
      ? box.y
      : first.verticalAlign === 'bottom'
        ? box.bottom
        : centre[1]
  return [x, y]
}

/** Labels that scale as one: a label group's lines and math, or a lone text. */
function clustersOf(
  targets: readonly ExcalidrawElement[],
  elements: readonly ExcalidrawElement[]
): Cluster[] {
  const byGroup = new Map<string, ExcalidrawElement[]>()
  const singles: ExcalidrawElement[][] = []
  for (const target of targets) {
    const group = labelGroup(target)
    if (!group) {
      singles.push([target])
    } else if (!byGroup.has(group)) {
      byGroup.set(
        group,
        elements.filter((element) => live(element) && element.groupIds.includes(group))
      )
    }
  }
  const groups = [...byGroup.values()].map((members) => ({ members, grouped: true }))
  const lone = singles.map((members) => ({ members, grouped: false }))
  return [...groups, ...lone].map(({ members, grouped }) => ({
    members,
    main: Math.max(...members.map(fontSizeOf)),
    anchor: anchorOf(members, grouped)
  }))
}

function clampUnits(units: number): number {
  return Math.min(MAX_PT, Math.max(MIN_PT, units / FIGURE_UNITS_PER_POINT)) * FIGURE_UNITS_PER_POINT
}

/** A math image's recorded size follows its new height (the kit's string form has none). */
function scaledMath(element: ExcalidrawElement, ratio: number) {
  const math = element.customData?.asterMath
  if (!math || typeof math !== 'object' || Array.isArray(math)) {
    return {}
  }
  const size: unknown = Reflect.get(math, 'size')
  return typeof size === 'number'
    ? { customData: { ...element.customData, asterMath: { ...math, size: size * ratio } } }
    : {}
}

/** Grows a box around its centre so its bound label fits with a little room. */
function fitContainer(container: ExcalidrawElement, label: ExcalidrawElement): ExcalidrawElement {
  const width = Math.max(container.width, label.width + 2 * PAD_X)
  const height = Math.max(container.height, label.height + 2 * PAD_Y)
  if (width === container.width && height === container.height) {
    return container
  }
  return newElementWith(container, {
    x: container.x - (width - container.width) / 2,
    y: container.y - (height - container.height) / 2,
    width,
    height
  })
}

/**
 * The scene with the targets' labels resized: `size(main)` gives each label's new main size in
 * scene units. Lines and math in a label scale together about its anchor, so a box label stays
 * centred and a title keeps its corner; a box grows to hold a bigger bound label.
 */
function resizeLabels(
  elements: readonly ExcalidrawElement[],
  targets: readonly ExcalidrawElement[],
  size: (main: number, text: number) => { main: number; text: number }
): ExcalidrawElement[] {
  const changes = new Map<string, ExcalidrawElement>()
  for (const cluster of clustersOf(targets, elements)) {
    if (!cluster.main) {
      continue
    }
    const ratio = size(cluster.main, cluster.main).main / cluster.main
    if (Math.abs(ratio - 1) < 1e-6) {
      continue
    }
    const [ax, ay] = cluster.anchor
    for (const member of cluster.members) {
      const place = {
        x: ax + (member.x - ax) * ratio,
        y: ay + (member.y - ay) * ratio,
        width: member.width * ratio,
        height: member.height * ratio
      }
      changes.set(
        member.id,
        member.type === 'text'
          ? newElementWith(member, { ...place, fontSize: size(cluster.main, member.fontSize).text })
          : newElementWith(member, { ...place, ...scaledMath(member, ratio) })
      )
    }
  }
  const byId = new Map(elements.map((element) => [element.id, element]))
  const bound = [...changes.values()].flatMap((label) =>
    label.type === 'text' && label.containerId !== null ? [{ label, id: label.containerId }] : []
  )
  for (const { label, id } of bound) {
    const container = changes.get(id) ?? byId.get(id)
    if (container) {
      changes.set(container.id, fitContainer(container, label))
    }
  }
  return elements.map((element) => changes.get(element.id) ?? element)
}

/** Every targeted label at `pt` points; math in a label grows or shrinks with its lines. */
export function withFigureTextPt(
  elements: readonly ExcalidrawElement[],
  targets: readonly ExcalidrawElement[],
  pt: number
): ExcalidrawElement[] {
  const units = clampUnits(pt * FIGURE_UNITS_PER_POINT)
  return resizeLabels(elements, targets, () => ({ main: units, text: units }))
}

/**
 * Every targeted label `deltaPt` points bigger (or smaller), in half-point steps; a label's
 * smaller lines (a subscript line, a caption) keep their proportion to its main line.
 */
export function withFigureTextStep(
  elements: readonly ExcalidrawElement[],
  targets: readonly ExcalidrawElement[],
  deltaPt: number
): ExcalidrawElement[] {
  return resizeLabels(elements, targets, (main, text) => {
    const pt = Math.round((main / FIGURE_UNITS_PER_POINT + deltaPt) * 2) / 2
    const next = clampUnits(pt * FIGURE_UNITS_PER_POINT)
    return { main: next, text: (text * next) / main }
  })
}
