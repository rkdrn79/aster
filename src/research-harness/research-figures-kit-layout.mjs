// The kit's layout helpers: titled panels around groups, and moving items into rows, columns,
// alignments and even spacing. Lay items out before drawing the arrows between them.
import { figureElement } from './research-figures-model.mjs'
import { labelLines, makeLines } from './research-figures-type.mjs'
import { oneOf } from './research-figures-options.mjs'

const EDGES = {
  left: (box) => box.x,
  right: (box) => box.right,
  cx: (box) => box.x + box.width / 2,
  top: (box) => box.y,
  bottom: (box) => box.bottom,
  cy: (box) => box.y + box.height / 2
}

export function layoutMethods(core) {
  const { styled } = core
  /** Shifts everything drawn under an id, its bound labels included. */
  const move = (id, dx, dy) => {
    const items = core.owned(id)
    // Why throw: a move that found nothing used to pass silently and leave the item behind.
    if (!items.length) {
      throw new Error(`fig.move: nothing is drawn under ${id}`)
    }
    const bound = new Set(
      items.flatMap((item) =>
        (item.boundElements ?? []).filter((entry) => entry.type === 'text').map((entry) => entry.id)
      )
    )
    const moving = new Set([...items, ...[...bound].map((boundId) => core.need(boundId))])
    for (const item of moving) {
      item.x += dx
      item.y += dy
    }
  }
  return {
    move,
    /**
     * A titled background panel around items (or at x, y, w, h): a group the reader should see
     * as one, like "DiT block ×N". `color` 'panel' (default) or another fill; `outline: true`
     * adds a dashed border; `title` is text or runs with `{ tex }`.
     */
    panel(spec) {
      const style = styled({}).style
      const pad = spec.pad ?? style.panelPad
      const size = spec.size ?? style.titleSize
      const position =
        oneOf('titlePosition', spec.titlePosition, [
          'top-left',
          'top-right',
          'bottom-left',
          'bottom-right'
        ]) ?? 'top-left'
      const lines = spec.title ? labelLines(spec.title, size, undefined, style) : []
      const titleSpace = lines.length ? size * 1.25 + pad * 0.4 : 0
      const atTop = position.startsWith('top')
      const inner = spec.around?.length
        ? spec.around.map((id) => core.bounds(id))
        : [{ x: spec.x, y: spec.y, right: spec.x + spec.w, bottom: spec.y + spec.h }]
      const margin = spec.around?.length ? pad : 0
      const x = Math.min(...inner.map((box) => box.x)) - margin
      const y =
        Math.min(...inner.map((box) => box.y)) - margin - (atTop && spec.around ? titleSpace : 0)
      const right = Math.max(...inner.map((box) => box.right)) + margin
      const bottom =
        Math.max(...inner.map((box) => box.bottom)) +
        margin +
        (!atTop && spec.around ? titleSpace : 0)
      // Why: panels compared side by side share their top and bottom.
      const twin = spec.same ? core.need(spec.same) : null
      const top = twin ? Math.min(y, twin.y) : y
      const low = twin ? Math.max(bottom, twin.y + twin.height) : bottom
      if (twin) {
        for (const item of core.owned(twin.id).filter((part) => part.id !== twin.id)) {
          item.y += top - twin.y
        }
        twin.y = top
        twin.height = low - top
      }
      const group = `${spec.id}-panel`
      const rect = figureElement('rectangle', {
        id: spec.id,
        x,
        y: top,
        width: right - x,
        height: low - top,
        strokeColor: spec.outline ? style.muted : 'transparent',
        strokeStyle: spec.outline ? 'dashed' : 'solid',
        strokeWidth: 1.5,
        backgroundColor: core.paint(spec.color ?? 'panel'),
        roundness: { type: 3, value: style.panelRadius ?? style.radius + 2 },
        boundElements: [],
        groupIds: [group],
        frameId: spec.frame ?? null,
        customData: { asterPanel: true }
      })
      const draw = (where) =>
        makeLines(
          styled({ id: `${spec.id}-title`, size, frame: spec.frame, group, ...where }),
          lines
        )
      const probe = lines.length ? draw({ x: 0, y: 0 }) : null
      const title = probe
        ? draw({
            x: position.endsWith('left') ? x + pad * 0.8 : right - pad * 0.8 - probe.width,
            y: atTop ? top + pad * 0.4 : low - pad * 0.4 - probe.height
          }).elements
        : []
      for (const element of title) {
        element.groupIds = [group]
      }
      core.claim(spec.id, [rect, ...title])
      // Why behind everything it overlaps: a panel is a background, never a lid.
      core.insert([rect], core.underBox(rect))
      core.insert(title)
      return rect
    },
    /** Places items left to right `gap` apart from `x` (default: the first's), centred on `cy`. */
    row(ids, { x, cy, gap = 16 } = {}) {
      let cursor = x ?? core.bounds(ids[0]).x
      const middle = cy ?? EDGES.cy(core.bounds(ids[0]))
      for (const id of ids) {
        const box = core.bounds(id)
        move(id, cursor - box.x, middle - EDGES.cy(box))
        cursor += box.width + gap
      }
      return ids.map((id) => core.bounds(id))
    },
    /** Places items top to bottom `gap` apart from `y`, centred on `cx`. */
    column(ids, { y, cx, gap = 16 } = {}) {
      let cursor = y ?? core.bounds(ids[0]).y
      const middle = cx ?? EDGES.cx(core.bounds(ids[0]))
      for (const id of ids) {
        const box = core.bounds(id)
        move(id, middle - EDGES.cx(box), cursor - box.y)
        cursor += box.height + gap
      }
      return ids.map((id) => core.bounds(id))
    },
    /** Lines items up on an edge (left, right, cx, top, bottom, cy) of the first, or `to`. */
    align(ids, edge, to = undefined) {
      const read = EDGES[edge]
      if (!read) {
        throw new Error(`align edge is one of ${Object.keys(EDGES).join(', ')}`)
      }
      const target = to ?? read(core.bounds(ids[0]))
      const horizontal = edge === 'left' || edge === 'right' || edge === 'cx'
      for (const id of ids) {
        const delta = target - read(core.bounds(id))
        move(id, horizontal ? delta : 0, horizontal ? 0 : delta)
      }
    },
    /** Spaces items evenly between the first and the last, along `axis` 'x' or 'y'. */
    distribute(ids, axis = 'x') {
      const boxes = ids.map((id) => core.bounds(id))
      const start = axis === 'x' ? boxes[0].x : boxes[0].y
      const end = axis === 'x' ? boxes.at(-1).right : boxes.at(-1).bottom
      const total = boxes.reduce((sum, box) => sum + (axis === 'x' ? box.width : box.height), 0)
      const gap = (end - start - total) / Math.max(1, ids.length - 1)
      let cursor = start
      for (const [index, id] of ids.entries()) {
        const box = boxes[index]
        move(id, axis === 'x' ? cursor - box.x : 0, axis === 'y' ? cursor - box.y : 0)
        cursor += (axis === 'x' ? box.width : box.height) + gap
      }
    }
  }
}
