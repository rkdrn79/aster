import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { PAGE_FRAME_ID } from '../../../../research-harness/research-figures-model.mjs'
import { isPanelElement } from './research-figure-panel-fit'
import type { SceneBox } from './ResearchFigureCanvasOverlays'

/** How close (screen px) a press may come to an outline or a line and still take it. */
const HIT_PX = 6
/**
 * A press this close to a panel's outline grabs the panel, as dragging its edge should. Small:
 * the empty middle of a panel often runs close to its edge, and a click selects the panel anyway.
 */
const EDGE_PX = 4
/** Room around a selection where Excalidraw's resize handles sit. */
const HANDLES_PX = 16
const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])

type Point = { x: number; y: number }
export type CanvasPick = {
  zoom: number
  selectedElementIds: Readonly<Record<string, boolean>>
  editingGroupId: string | null
}

const live = (element: ExcalidrawElement): boolean =>
  !element.isDeleted && !element.locked && element.id !== PAGE_FRAME_ID && element.type !== 'frame'

function within(point: Point, box: SceneBox, margin: number): boolean {
  return (
    point.x >= box.x - margin &&
    point.x <= box.x + box.width + margin &&
    point.y >= box.y - margin &&
    point.y <= box.y + box.height + margin
  )
}

function nearSegment(point: Point, a: Point, b: Point, reach: number): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t = length
    ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length))
    : 0
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)) <= reach
}

/** Whether a press at `point` takes `element`, as Excalidraw's hit test roughly does. */
function hits(element: ExcalidrawElement, point: Point, reach: number): boolean {
  if (element.type === 'arrow' || element.type === 'line') {
    const path = element.points.map(([px, py]) => ({ x: element.x + px, y: element.y + py }))
    const width = reach + element.strokeWidth / 2
    return path.slice(1).some((end, index) => nearSegment(point, path[index], end, width))
  }
  if (!within(point, element, reach)) {
    return false
  }
  if (SHAPES.has(element.type) && element.backgroundColor === 'transparent') {
    // Why: an unfilled shape takes clicks on its outline only.
    return !within(point, element, -reach)
  }
  return true
}

/** An element's box; a line's runs over its points, which may lie left of or above its origin. */
function boundsOf(element: ExcalidrawElement): SceneBox {
  if (element.type !== 'arrow' && element.type !== 'line') {
    return element
  }
  const xs = element.points.map(([px]) => element.x + px)
  const ys = element.points.map(([, py]) => element.y + py)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

function selectionBounds(
  elements: readonly ExcalidrawElement[],
  selected: Readonly<Record<string, boolean>>
): SceneBox | null {
  const chosen = elements
    .filter((element) => selected[element.id] && !element.isDeleted)
    .map(boundsOf)
  if (!chosen.length) {
    return null
  }
  const x = Math.min(...chosen.map((element) => element.x))
  const y = Math.min(...chosen.map((element) => element.y))
  const right = Math.max(...chosen.map((element) => element.x + element.width))
  const bottom = Math.max(...chosen.map((element) => element.y + element.height))
  return { x, y, width: right - x, height: bottom - y }
}

/**
 * The background panel a press lands on, when it should start a selection box instead of moving
 * the panel (Figma's frames): the panel is the topmost thing there, it is not selected, and the
 * press is in its empty middle, not on its outline. Null leaves the press to Excalidraw.
 */
export function panelUnderPress(
  elements: readonly ExcalidrawElement[],
  point: Point,
  pick: CanvasPick
): ExcalidrawElement | null {
  const reach = HIT_PX / pick.zoom
  const selection = selectionBounds(elements, pick.selectedElementIds)
  if (selection && within(point, selection, HANDLES_PX / pick.zoom)) {
    return null
  }
  const top = elements
    .filter(live)
    .toReversed()
    .find((element) => hits(element, point, reach))
  if (!top || !isPanelElement(top) || pick.selectedElementIds[top.id]) {
    return null
  }
  if (pick.editingGroupId && top.groupIds.includes(pick.editingGroupId)) {
    return null
  }
  return within(point, top, -EDGE_PX / pick.zoom) ? top : null
}

export type MarqueeSelection = {
  selectedElementIds: Record<string, true>
  selectedGroupIds: Record<string, true>
}

/** The group a click or box takes an element by: the outermost, or the one inside the edited. */
function groupFor(element: ExcalidrawElement, editingGroupId: string | null): string | null {
  if (editingGroupId) {
    const index = element.groupIds.indexOf(editingGroupId)
    return index > 0 ? element.groupIds[index - 1] : null
  }
  return element.groupIds.at(-1) ?? null
}

/** Selects these elements whole: a member of a group takes its group, as Excalidraw does. */
export function selectWhole(
  elements: readonly ExcalidrawElement[],
  picked: readonly ExcalidrawElement[],
  editingGroupId: string | null,
  base: MarqueeSelection = { selectedElementIds: {}, selectedGroupIds: {} }
): MarqueeSelection {
  const ids: Record<string, true> = { ...base.selectedElementIds }
  const groups: Record<string, true> = { ...base.selectedGroupIds }
  for (const element of picked) {
    const group = groupFor(element, editingGroupId)
    if (!group) {
      ids[element.id] = true
      continue
    }
    groups[group] = true
    for (const member of elements) {
      if (member.groupIds.includes(group) && live(member)) {
        ids[member.id] = true
      }
    }
  }
  return { selectedElementIds: ids, selectedGroupIds: groups }
}

/** What a selection box takes: everything wholly inside it, groups whole (Excalidraw's rule). */
export function marqueeSelection(
  elements: readonly ExcalidrawElement[],
  box: SceneBox,
  editingGroupId: string | null,
  base?: MarqueeSelection
): MarqueeSelection {
  const picked = elements.filter((element) => {
    if (!live(element) || (element.type === 'text' && element.containerId)) {
      return false
    }
    const at = boundsOf(element)
    return (
      at.x >= box.x &&
      at.y >= box.y &&
      at.x + at.width <= box.x + box.width &&
      at.y + at.height <= box.y + box.height
    )
  })
  return selectWhole(elements, picked, editingGroupId, base)
}
