import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { PAGE_FRAME_ID } from '../../../../research-harness/research-figures-model.mjs'
import { BADGES } from './research-figure-badges'
import type { SceneBox } from './ResearchFigureCanvasOverlays'

/** Excalidraw's own duplicate offset (half its default grid), which a smart duplicate replaces. */
export const EXCALIDRAW_DUPLICATE_OFFSET = 10
/** The gap the first copy keeps when nothing nearby says what the spacing is: 8 pt. */
const DEFAULT_GAP = 16
const SHAPES = new Set(['rectangle', 'ellipse', 'diamond', 'image'])

export type Offset = { dx: number; dy: number }

export function boundsOf(elements: readonly ExcalidrawElement[]): SceneBox {
  const x = Math.min(...elements.map((element) => element.x))
  const y = Math.min(...elements.map((element) => element.y))
  const right = Math.max(...elements.map((element) => element.x + element.width))
  const bottom = Math.max(...elements.map((element) => element.y + element.height))
  return { x, y, width: right - x, height: bottom - y }
}

const overlap = (a0: number, a1: number, b0: number, b1: number): boolean =>
  Math.min(a1, b1) - Math.max(a0, b0) > 0.5

/**
 * Where the first copy goes: one box-height plus the gap to the nearest neighbour above or below
 * (a column), or one box-width plus the gap to the nearest neighbour beside it (a row); the other
 * way when that one is taken or off the page.
 */
export function firstDuplicateOffset(
  source: SceneBox,
  selectedIds: ReadonlySet<string>,
  elements: readonly ExcalidrawElement[]
): Offset {
  const others = elements.filter(
    (element) =>
      !element.isDeleted &&
      SHAPES.has(element.type) &&
      element.id !== PAGE_FRAME_ID &&
      !selectedIds.has(element.id) &&
      !element.customData?.asterPanel &&
      element.customData?.asterRole !== 'panel'
  )
  let column: number | null = null
  let row: number | null = null
  for (const other of others) {
    if (overlap(source.x, source.x + source.width, other.x, other.x + other.width)) {
      const gap = Math.max(
        other.y - (source.y + source.height),
        source.y - (other.y + other.height)
      )
      if (gap >= 0 && (column === null || gap < column)) {
        column = gap
      }
    }
    if (overlap(source.y, source.y + source.height, other.y, other.y + other.height)) {
      const gap = Math.max(other.x - (source.x + source.width), source.x - (other.x + other.width))
      if (gap >= 0 && (row === null || gap < row)) {
        row = gap
      }
    }
  }
  const across = { dx: source.width + (row ?? DEFAULT_GAP), dy: 0 }
  const down = { dx: 0, dy: source.height + (column ?? DEFAULT_GAP) }
  const ordered =
    row !== null && (column === null || row < column) ? [across, down] : [down, across]
  const page = elements.find((element) => element.id === PAGE_FRAME_ID && !element.isDeleted)
  // Why: the spacing the neighbours show wins, unless that copy would land on another box or off
  // the page while the other way is clear.
  const free = ordered.find((offset) => {
    const box = { ...source, x: source.x + offset.dx, y: source.y + offset.dy }
    const onPage =
      !page ||
      (box.x >= page.x &&
        box.y >= page.y &&
        box.x + box.width <= page.x + page.width &&
        box.y + box.height <= page.y + page.height)
    return (
      onPage &&
      !others.some(
        (other) =>
          overlap(box.x, box.x + box.width, other.x, other.x + other.width) &&
          overlap(box.y, box.y + box.height, other.y, other.y + other.height)
      )
    )
  })
  return free ?? ordered[0]
}

/** The copies Excalidraw made (ids not in the scene before), moved from its offset to ours. */
export function placeDuplicates(
  next: readonly ExcalidrawElement[],
  previous: readonly ExcalidrawElement[],
  offset: Offset
): { elements: ExcalidrawElement[]; copies: ExcalidrawElement[] } {
  const known = new Set(previous.map((element) => element.id))
  const shift = {
    dx: offset.dx - EXCALIDRAW_DUPLICATE_OFFSET,
    dy: offset.dy - EXCALIDRAW_DUPLICATE_OFFSET
  }
  const copies: ExcalidrawElement[] = []
  const elements = next.map((element) => {
    if (known.has(element.id)) {
      return element
    }
    // Why plain spreads: these are new elements Excalidraw has not committed yet.
    const moved = { ...element, x: element.x + shift.dx, y: element.y + shift.dy }
    copies.push(moved)
    return moved
  })
  return { elements, copies }
}

const randomInt = (): number => Math.floor(Math.random() * 2 ** 31)

/**
 * Badge copies for copied boxes: a box's snowflake or flame is not grouped with it, so
 * Excalidraw's duplicate leaves it behind. Each copy is matched to its original by shape and
 * place, and gets the same badge attached to its corner.
 */
export function duplicateBadges(
  elements: readonly ExcalidrawElement[],
  sources: readonly ExcalidrawElement[],
  copies: readonly ExcalidrawElement[],
  offset: Offset
): ExcalidrawElement[] {
  const byId = new Map(elements.map((element) => [element.id, element]))
  const added: ExcalidrawElement[] = []
  for (const source of sources) {
    const copy = copies.find(
      (candidate) =>
        candidate.type === source.type &&
        Math.abs(candidate.width - source.width) < 0.01 &&
        Math.abs(candidate.height - source.height) < 0.01 &&
        Math.abs(candidate.x - source.x - offset.dx) < 0.01 &&
        Math.abs(candidate.y - source.y - offset.dy) < 0.01
    )
    const badge = BADGES.map((entry) => byId.get(`${source.id}-${entry.kind}`)).find(
      (element) => element && !element.isDeleted
    )
    if (!copy || !badge) {
      continue
    }
    const kind = badge.id.slice(source.id.length + 1)
    const attach = badge.customData?.asterAttach
    added.push({
      ...badge,
      id: `${copy.id}-${kind}`,
      x: badge.x + offset.dx,
      y: badge.y + offset.dy,
      index: null,
      version: 1,
      versionNonce: randomInt(),
      seed: randomInt(),
      groupIds: [],
      boundElements: null,
      updated: Date.now(),
      customData: {
        ...badge.customData,
        asterAttach: {
          ...(typeof attach === 'object' && attach
            ? attach
            : { anchor: 'top-right', dx: -2, dy: 2 }),
          to: copy.id
        }
      }
    })
  }
  return added
}
