// The kit's layout helpers: titled panels around groups, and moving items into rows, columns,
// alignments and even spacing. Lay items out before drawing the arrows between them.
import { figureElement } from './research-figures-model.mjs'
import { labelLines, makeLines } from './research-figures-type.mjs'
import { oneOf } from './research-figures-options.mjs'
import { teaserMethods } from './research-figures-kit-teaser.mjs'
import { paperPanel } from './research-figures-kit-paper-panel.mjs'

/** Panel outlines: a light solid line by default, the old heavy dash only when asked. */
export const PANEL_OUTLINES = ['solid', 'hairline', 'dashed', 'tint', 'none']

/**
 * How a panel's edge and fill look: `outline` true picks the quiet line that fits the preset (a
 * hairline in ink for the outlined and mono presets, a light gray 0.5 pt line otherwise);
 * 'tint' fills with the panel tint and draws no line; 'none' (or false) draws no line.
 */
export function panelLook(style, outline, color) {
  const name =
    outline === true
      ? ['outline', 'print-mono'].includes(style.name)
        ? 'hairline'
        : 'solid'
      : outline === false || outline === undefined || outline === null
        ? 'none'
        : oneOf('panel outline', outline, PANEL_OUTLINES)
  const line = {
    solid: { strokeColor: style.mid, strokeWidth: 1, strokeStyle: 'solid' },
    hairline: { strokeColor: style.line, strokeWidth: 0.6, strokeStyle: 'solid' },
    // Why kept: a dashed edge still says "optional" or "repeated N times" when that is meant.
    dashed: { strokeColor: style.muted, strokeWidth: 1.5, strokeStyle: 'dashed' }
  }[name] ?? { strokeColor: 'transparent', strokeWidth: 1, strokeStyle: 'solid' }
  const fill =
    name === 'tint' && (color === undefined || color === 'none') ? 'panel' : (color ?? 'panel')
  return { name, fill, ...line }
}

const EDGES = {
  left: (box) => box.x,
  right: (box) => box.right,
  cx: (box) => box.x + box.width / 2,
  top: (box) => box.y,
  bottom: (box) => box.bottom,
  cy: (box) => box.y + box.height / 2
}

export function layoutMethods(core, figOf) {
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
    ...teaserMethods(core, figOf),
    move,
    /**
     * A titled background panel around items (or at x, y, w, h): a group the reader should see
     * as one, like "DiT block ×N". `color` 'panel' (default), another fill or 'none'; `outline`
     * true (the preset's quiet line) | 'solid' | 'hairline' | 'dashed' | 'tint' | 'none';
     * `title` is text or runs with `{ tex }`; around items its row adds size × 1.25 + pad × 0.4
     * (24 units at 16 with pad 10) over them, or nothing with `titleRow: false`.
     */
    panel(spec) {
      const style = styled({}).style
      if (style.look === 'paper') {
        return paperPanel(core, spec)
      }
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
      // Why titleRow false: on a crowded page the added row pushed panels off the page and under
      // arrows; the title then sits in a corner of the padding over nothing it holds.
      const titleSpace = lines.length && spec.titleRow !== false ? size * 1.25 + pad * 0.4 : 0
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
      const look = panelLook(style, spec.outline, spec.color)
      const rect = figureElement('rectangle', {
        id: spec.id,
        x,
        y: top,
        width: right - x,
        height: low - top,
        strokeColor: look.strokeColor,
        strokeStyle: look.strokeStyle,
        strokeWidth: look.strokeWidth,
        backgroundColor: core.paint(look.fill),
        roundness: { type: 3, value: style.panelRadius ?? style.radius + 2 },
        boundElements: [],
        groupIds: [group],
        frameId: spec.frame ?? null,
        customData: { asterPanel: true, asterOutline: look.name }
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
