import { PAGE_FRAME_ID } from '../../../../research-harness/research-figures-model.mjs'
import { readAsterRole, type MetaElement } from './research-figure-element-meta'
import type {
  PanelFit,
  Seen,
  SettleElement,
  SettleMemory,
  SettleState
} from './research-figure-settle-state'

/** A background panel: the kit's `asterPanel` box, or a box a person gave the Panel role. */
export function isPanelElement(element: MetaElement): boolean {
  return Boolean(element.customData?.asterPanel) || readAsterRole(element) === 'panel'
}

/** The kit may name what a panel is around (`asterPanel.around`); then only those count. */
function aroundOf(element: MetaElement): string[] | null {
  const panel = element.customData?.asterPanel
  const around: unknown =
    typeof panel === 'object' && panel !== null ? Reflect.get(panel, 'around') : undefined
  return Array.isArray(around) && around.every((id) => typeof id === 'string') ? around : null
}

const CONTENT_TYPES = new Set(['rectangle', 'ellipse', 'diamond', 'image', 'text', 'freedraw'])
type Box = { x: number; y: number; right: number; bottom: number }
type Geometry = (id: string) => Seen | null | undefined

const boxOf = (seen: Seen): Box => ({
  x: seen.x,
  y: seen.y,
  right: seen.x + seen.width,
  bottom: seen.y + seen.height
})

function union(boxes: readonly Box[]): Box {
  return {
    x: Math.min(...boxes.map((box) => box.x)),
    y: Math.min(...boxes.map((box) => box.y)),
    right: Math.max(...boxes.map((box) => box.right)),
    bottom: Math.max(...boxes.map((box) => box.bottom))
  }
}

const inside = (inner: Box, outer: Box): boolean =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.right <= outer.right + 0.5 &&
  inner.bottom <= outer.bottom + 0.5

const overlaps = (a: Box, b: Box): boolean =>
  Math.min(a.right, b.right) > Math.max(a.x, b.x) &&
  Math.min(a.bottom, b.bottom) > Math.max(a.y, b.y)

/** What may sit on a panel: shapes, labels and pictures; arrows re-route, bound text follows. */
function contentCandidates(state: SettleState, panel: SettleElement): SettleElement[] {
  const group = panel.groupIds?.at(-1)
  return [...state.byId.values()].filter(
    (element) =>
      !element.isDeleted &&
      element.id !== panel.id &&
      element.id !== PAGE_FRAME_ID &&
      CONTENT_TYPES.has(element.type) &&
      !Reflect.get(element, 'containerId') &&
      !(group && element.groupIds?.includes(group))
  )
}

/** A panel's contents (what lies on it) and the room it keeps: its pad, more on a titled top. */
function learn(state: SettleState, panel: SettleElement, geometry: Geometry): PanelFit | null {
  const seen = geometry(panel.id)
  if (!seen || seen.isDeleted) {
    return null
  }
  const area = boxOf(seen)
  const around = aroundOf(panel)
  const contents = contentCandidates(state, panel).filter((element) => {
    const at = geometry(element.id)
    return at && !at.isDeleted && (around ? around.includes(element.id) : inside(boxOf(at), area))
  })
  const boxes = contents.flatMap((element) => {
    const at = geometry(element.id)
    return at ? [boxOf(at)] : []
  })
  if (!boxes.length) {
    return { contents: [], pad: { left: 0, right: 0, top: 0, bottom: 0 } }
  }
  const hull = union(boxes)
  const gaps = {
    left: Math.max(0, hull.x - area.x),
    right: Math.max(0, area.right - hull.right),
    top: Math.max(0, hull.y - area.y),
    bottom: Math.max(0, area.bottom - hull.bottom)
  }
  // Why capped at the middle gap: a panel drawn with room to spare on one side still hugs there
  // at its usual pad, while a side that sits closer (a badge poking out) keeps its own room.
  const usual = [gaps.left, gaps.right, gaps.bottom].toSorted((a, b) => a - b)[1]
  const pad = (gap: number): number => Math.min(gap, usual)
  const group = panel.groupIds?.at(-1)
  const titled = [...state.byId.values()].some(
    (element) =>
      element.type === 'text' && !element.isDeleted && group && element.groupIds?.includes(group)
  )
  return {
    contents: contents.map((element) => element.id),
    pad: {
      left: pad(gaps.left),
      right: pad(gaps.right),
      bottom: pad(gaps.bottom),
      top: titled ? gaps.top : pad(gaps.top)
    }
  }
}

/**
 * Keeps each panel's contents current: new panels are learned (from `geometry`, the scene as it
 * was before an edit when settling one), a panel the person moved or resized is learned again,
 * and anything now lying on a panel joins it while what left it entirely drops out.
 */
export function refreshPanels(
  memory: SettleMemory,
  state: SettleState,
  personMoved: (id: string) => boolean,
  options: { geometry?: Geometry; gesture?: boolean } = {}
): void {
  const geometry = options.geometry ?? ((id: string) => state.get(id))
  const panels = [...state.byId.values()].filter(
    (element) => !element.isDeleted && isPanelElement(element)
  )
  const live = new Set(panels.map((panel) => panel.id))
  for (const id of memory.panels.keys()) {
    if (!live.has(id)) {
      memory.panels.delete(id)
    }
  }
  for (const panel of panels) {
    const known = memory.panels.get(panel.id)
    if (!known || personMoved(panel.id)) {
      const fit = learn(state, panel, known ? (id) => state.get(id) : geometry)
      if (fit) {
        memory.panels.set(panel.id, fit)
      }
      continue
    }
    const at = state.get(panel.id)
    // Why not mid-gesture: a box resized past the panel takes its badge out of it for a moment;
    // the badge still belongs to the panel when the panel grows at the end.
    if (!at || aroundOf(panel) || options.gesture) {
      continue
    }
    const area = boxOf(at)
    const kept = known.contents.filter((id) => {
      const seen = state.get(id)
      return seen && !seen.isDeleted && overlaps(boxOf(seen), area)
    })
    const joined = contentCandidates(state, panel)
      .filter((element) => !kept.includes(element.id))
      .filter((element) => {
        const seen = state.get(element.id)
        return seen && inside(boxOf(seen), area)
      })
      .map((element) => element.id)
    memory.panels.set(panel.id, { ...known, contents: [...kept, ...joined] })
  }
}

/**
 * Figma's hug, for background panels: a panel grows so what lies on it keeps the panel's pad
 * (a box resized or nudged towards its edge, a bigger label). It never shrinks, and leaves alone
 * a panel the person moved or sized. Returns the panels that grew.
 */
export function fitPanels(
  memory: SettleMemory,
  state: SettleState,
  personMoved: (id: string) => boolean
): string[] {
  const grown: string[] = []
  for (const [id, fit] of memory.panels) {
    const at = state.get(id)
    if (!at || at.isDeleted || personMoved(id) || !fit.contents.length) {
      continue
    }
    const area = boxOf(at)
    const on = new Set(
      fit.contents.filter((content) => {
        const seen = state.get(content)
        return seen && !seen.isDeleted && overlaps(boxOf(seen), area)
      })
    )
    // Why followers too: a badge or label rides with a box still on the panel, even where it
    // pokes past the panel's edge after the box grew.
    for (const [follower, link] of memory.links) {
      if (on.has(link.to) && fit.contents.includes(follower)) {
        on.add(follower)
      }
    }
    const boxes = [...on].flatMap((content) => {
      const seen = state.get(content)
      return seen && !seen.isDeleted ? [boxOf(seen)] : []
    })
    if (!boxes.length) {
      continue
    }
    const around = union(boxes)
    const next = {
      x: Math.min(area.x, around.x - fit.pad.left),
      y: Math.min(area.y, around.y - fit.pad.top),
      right: Math.max(area.right, around.right + fit.pad.right),
      bottom: Math.max(area.bottom, around.bottom + fit.pad.bottom)
    }
    const grows =
      area.x - next.x > 0.5 ||
      area.y - next.y > 0.5 ||
      next.right - area.right > 0.5 ||
      next.bottom - area.bottom > 0.5
    if (grows) {
      state.update(id, {
        x: next.x,
        y: next.y,
        width: next.right - next.x,
        height: next.bottom - next.y
      })
      grown.push(id)
    }
  }
  return grown
}
