// The kit's objective marks: the loss in one of several forms (a name, a short symbol, the full
// formula, a link between prediction and target, or nothing but the marks), the frames around
// what a loss compares, and highlighted cells. Ink by default, as papers draw it; colour is
// opt-in (`tone`). Predictions and targets are framed apart and meet only at the loss.
import { makeArrow, makeBox, makeLines } from './research-figures-draw.mjs'
import { makePolyline } from './research-figures-shapes.mjs'
import { figureElement } from './research-figures-model.mjs'
import { ROUTES, oneOf } from './research-figures-options.mjs'
import { absolutePoints, inkBox } from './research-figures-labels.mjs'
import { elementBounds } from './research-figures-geometry.mjs'
import { labelLines } from './research-figures-type.mjs'
import { LOSS_TONES, lossColors } from './research-figures-style.mjs'
import {
  DASHED_GAP,
  GAP,
  MIN_LINK,
  MIN_STUB,
  RINGABLE,
  clampToPage,
  layoutAround,
  localLimit,
  lossForm,
  lossLabel,
  lossNodeSize,
  pathLength,
  placements,
  routeBetween,
  union
} from './research-figures-loss-place.mjs'
import { lossLinks, pathsCross } from './research-figures-loss-links.mjs'

export { LOSS_FORMS, lossForm, lossNodeSize } from './research-figures-loss-place.mjs'

export function lossMethods(core, figure) {
  const { styled } = core
  const colorsOf = (tone) => lossColors(styled({}).style, oneOf('tone', tone, LOSS_TONES) ?? 'ink')
  const ringBox = (id, bounds, pad, tone) =>
    figureElement('rectangle', {
      id,
      x: bounds.x - pad,
      y: bounds.y - pad,
      width: bounds.width + pad * 2,
      height: bounds.height + pad * 2,
      strokeColor: colorsOf(tone).ring,
      backgroundColor: 'transparent',
      strokeWidth: 1.5,
      boundElements: [],
      customData: { asterRole: 'compared' }
    })
  /** What an item shows, without its name or label (a ring around an image leaves its label out). */
  const subject = (id) => {
    const parts = core
      .owned(id)
      .filter(
        (element) =>
          element.id === id ||
          !(element.id.startsWith(`${id}-label`) || element.id.startsWith(`${id}-name`))
      )
      .map(elementBounds)
    return parts.length ? union(parts) : core.bounds(id)
  }
  /**
   * The pad a ring around `box` can take without reaching its nearest neighbour in a row or
   * column (a token two cells along): half the gap, never more than asked.
   */
  const roomFor = (id, box, pad) => {
    let gap = Infinity
    // Why its label counts: a ring must stop short of the name under an image.
    const own = new Set(
      core
        .owned(id)
        .filter(
          (element) => !element.id.startsWith(`${id}-label`) && !element.id.startsWith(`${id}-name`)
        )
        .map((element) => element.id)
    )
    for (const element of core.elements) {
      if (
        element.isDeleted ||
        own.has(element.id) ||
        !['rectangle', 'ellipse', 'diamond', 'image', 'text'].includes(element.type) ||
        element.customData?.asterPanel ||
        element.customData?.asterRole === 'compared' ||
        (!['image', 'text'].includes(element.type) &&
          element.strokeColor === 'transparent' &&
          element.backgroundColor === 'transparent')
      ) {
        continue
      }
      const other = elementBounds(element)
      const rows = Math.min(other.bottom, box.bottom) - Math.max(other.y, box.y) > 0
      const columns = Math.min(other.right, box.right) - Math.max(other.x, box.x) > 0
      if (rows && other.right <= box.x + 0.5) {
        gap = Math.min(gap, box.x - other.right)
      } else if (rows && other.x >= box.right - 0.5) {
        gap = Math.min(gap, other.x - box.right)
      } else if (columns && other.bottom <= box.y + 0.5) {
        gap = Math.min(gap, box.y - other.bottom)
      } else if (columns && other.y >= box.bottom - 0.5) {
        gap = Math.min(gap, other.y - box.bottom)
      }
    }
    return Math.max(1.5, Math.min(pad, (gap - 1) / 2))
  }
  /** One box around compared ids, on top of them; arrows bind to it. */
  const ring = (id, ids, owner = id, pad = 6, tone = 'ink') => {
    const around = union(ids.map((item) => subject(item)))
    const room = ids.length === 1 ? roomFor(ids[0], around, pad) : pad
    const box = ringBox(id, around, room, tone)
    if (owner === id) {
      core.claim(id, [box])
    } else {
      box.customData = { ...box.customData, asterKit: owner }
    }
    core.insert([box])
    return box
  }
  /** Outlines a shape in the loss's ring colour; anything without an outline (an image) gets a ring. */
  const mark = (id, owner, pad, tone) => {
    const element = core.need(id)
    if (RINGABLE.has(element.type)) {
      Object.assign(element, {
        strokeColor: colorsOf(tone).ring,
        strokeWidth: 1.5,
        customData: { ...element.customData, asterRole: 'compared' }
      })
      return id
    }
    // Why a ring: Excalidraw draws no outline on an image, a text or a line.
    return ring(`${owner}-ring-${id}`, [id], owner, pad, tone).id
  }
  /**
   * A link from a set (or a merge point) into the loss node, routed like an arrow: `routes[i]`
   * or `route` when given, else the way the two lie; a link that would cross a solid arrow
   * takes another route that does not, when one does.
   */
  const link = (spec, from, index, node) => {
    const target = { ...node, right: node.x + node.width, bottom: node.y + node.height }
    const dashed = spec.links === 'dashed' || spec.dashed === true
    const asked = oneOf('route', spec.routes?.[index] ?? spec.route, ROUTES)
    const draw = (route) => {
      const arrow = makeArrow(
        styled({
          id: `${spec.id}-in${index + 1}`,
          from,
          to: spec.id,
          role: 'loss',
          color: colorsOf(spec.tone).link,
          dashed,
          strokeWidth: dashed ? 1.5 : 2,
          headSize: dashed ? 8 : 10,
          route,
          gap: spec.gap
        }),
        core.lookup,
        { elements: core.elements }
      )
      arrow.customData = { ...arrow.customData, asterKit: spec.id }
      return arrow
    }
    const first = draw(
      asked ?? (Array.isArray(from) ? undefined : routeBetween(core.bounds(from), target))
    )
    if (asked) {
      return first
    }
    const solid = core.elements.filter(
      (element) =>
        element.type === 'arrow' &&
        !element.isDeleted &&
        element.strokeStyle === 'solid' &&
        element.customData?.asterKit !== spec.id
    )
    const clear = (arrow) =>
      !solid.some((other) => pathsCross(absolutePoints(arrow), absolutePoints(other)))
    return clear(first) ? first : (['hv', 'vh'].map(draw).find(clear) ?? first)
  }
  const { joined, separate, noteFor, wiringProblem, busRoom } = lossLinks(core, { colorsOf, link })
  /** Whether items cover under two thirds of the strip they span (along its longer side). */
  const spreadOut = (ids) => {
    const boxes = ids.map((id) => core.bounds(id))
    const all = union(boxes)
    const row = all.width >= all.height
    const covered = boxes.reduce((sum, box) => sum + (row ? box.width : box.height), 0)
    return covered < (row ? all.width : all.height) * (2 / 3)
  }
  /** Marks predictions and targets; with `link: 'bracket'` joins them with a labelled bracket. */
  const compareLink = (spec, sources, label) => {
    const [first, second] = sources
    if (!first || !second) {
      throw new Error(
        "loss({ form: 'compare' }) needs predictions and targets (or compare: [a, b])"
      )
    }
    const colors = colorsOf(spec.tone)
    const size = spec.size ?? styled({}).style.smallSize
    const dashed = spec.links === 'dashed' || spec.dashed === true
    if (spec.link !== 'bracket') {
      const runs = label.length ? { label } : {}
      return figure().arrow({
        id: spec.id,
        from: first,
        to: second,
        heads: 'both',
        role: 'loss',
        color: colors.link,
        dashed,
        strokeWidth: dashed ? 1.5 : 2,
        headSize: 8,
        labelSize: size,
        labelColor: colors.text,
        labelSide: spec.labelSide,
        route: spec.route,
        ...runs
      })
    }
    // Why a bracket: two items in one column (or row) joined on their outer side, the label at
    // its middle, reads as "these two are compared" without a node.
    const a = core.bounds(first)
    const b = core.bounds(second)
    const stacked = Math.min(a.right, b.right) - Math.max(a.x, b.x) > 0
    const reach = spec.reach ?? 12
    const points = stacked
      ? (() => {
          const x = Math.max(a.right, b.right) + reach
          const ya = a.y + a.height / 2
          const yb = b.y + b.height / 2
          return [
            [a.right + 4, ya],
            [x, ya],
            [x, yb],
            [b.right + 4, yb]
          ]
        })()
      : (() => {
          const y = Math.max(a.bottom, b.bottom) + reach
          const xa = a.x + a.width / 2
          const xb = b.x + b.width / 2
          return [
            [xa, a.bottom + 4],
            [xa, y],
            [xb, y],
            [xb, b.bottom + 4]
          ]
        })()
    const line = makePolyline(
      styled({
        id: spec.id,
        points,
        stroke: colors.link,
        strokeWidth: 1.5,
        dashed,
        customData: { asterRole: 'loss-link' }
      })
    )
    const items = [line]
    if (label.length) {
      const lines = labelLines(label, size, undefined, styled({}).style)
      const draw = (where) =>
        makeLines(styled({ id: `${spec.id}-label`, size, color: colors.text, ...where }), lines)
      const ink = inkBox(draw({ x: 0, y: 0 }).elements)
      const middle = stacked
        ? { x: points[1][0] + 6, y: (points[1][1] + points[2][1]) / 2 - ink.height / 2 }
        : { x: (points[1][0] + points[2][0]) / 2 - ink.width / 2, y: points[1][1] + 4 }
      items.push(...draw({ x: middle.x - ink.x, y: middle.y - ink.y }).elements)
    }
    core.claim(spec.id, items)
    core.insert(items)
    return line
  }
  return {
    /**
     * The objective, in one of several forms (`form`): a plain `name` ("L1 loss"), a short
     * `symbol` (\mathcal{L}_{DPO}), the full `formula` (only when the equation is the point),
     * `compare` (no node: a two-headed link or a bracket between prediction and target, with a
     * small label) or `none` (the caption carries it; predictions and targets are still
     * marked). Ink by default with no frame (`boxed: true` adds a thin one), ordinary links
     * (`links: 'dashed'` for dashed ones), colour only with `tone: 'accent' | 'red'`.
     * `predictions` and `targets` (an id or a list) are framed apart; `compare` adds entries;
     * `inputs` link without a frame; `group: 'rings'` rings each target (and each prediction
     * when they lie apart with a side free for the bus) and joins each strip in one link. Without x or cx the node sits where its
     * links are shortest and cross least, on the page and on nothing (`cy` or `y` fixes its row).
     */
    loss(spec) {
      const form = lossForm(spec)
      const tone = oneOf('tone', spec.tone, LOSS_TONES) ?? 'ink'
      const colors = colorsOf(tone)
      const dashed = spec.links === 'dashed' || spec.dashed === true
      oneOf('links', spec.links, ['solid', 'dashed'])
      const rung = spec.group === 'rings'
      // Why apart only: predictions spread over a strip framed as one set beside targets ringed
      // one by one read unlike; a run of touching cells reads best in one frame.
      const strip = rung ? [spec.predictions ?? []].flat() : []
      const scatteredPredictions =
        strip.length > 1 && spreadOut(strip) && busRoom(spec.id, strip) ? strip : []
      const entries = [
        ...(spec.predictions && !scatteredPredictions.length ? [spec.predictions] : []),
        ...(spec.targets && !rung ? [spec.targets] : []),
        ...(spec.compare ?? [])
      ]
      const scattered = rung ? [spec.targets].flat().filter(Boolean) : []
      const inputs = [spec.inputs ?? []].flat()
      const pad = spec.pad ?? 6
      const marked = (entry, index) =>
        Array.isArray(entry) && entry.length > 1
          ? ring(`${spec.id}-set${index + 1}`, entry, spec.id, pad, tone).id
          : spec.outline === false
            ? [entry].flat()[0]
            : mark([entry].flat()[0], spec.id, pad, tone)
      if (form === 'compare') {
        const label = lossLabel(form, spec)
        const ends = entries.map((entry) => [entry].flat()[0])
        if (spec.outline === true) {
          entries.forEach(marked)
        }
        return compareLink({ ...spec, tone }, ends, label)
      }
      if (form === 'none') {
        const ids = [
          ...entries.map(marked),
          ...[...scatteredPredictions, ...scattered].map(
            (id) => ring(`${spec.id}-ring-${id}`, [id], spec.id, pad, tone).id
          )
        ]
        return ids.map((id) => core.need(id))
      }
      // Why sized to the label: a loss node is a name or a short formula, not a block.
      const framed = spec.boxed === true
      const { label, width: w, height: h } = lossNodeSize(styled({ id: spec.id }), spec, form)
      // Why the rings as one set: scattered targets of one loss sit in one strip.
      const sets = [
        ...entries,
        ...(scatteredPredictions.length ? [scatteredPredictions] : []),
        ...(scattered.length ? [scattered] : []),
        ...inputs
      ].map((entry) => union([entry].flat().map((id) => core.bounds(id))))
      const given = spec.x !== undefined || spec.cx !== undefined
      const gap = spec.distance ?? (dashed ? DASHED_GAP : GAP)
      const page = core.page()
      const automatic = !given && sets.length > 0
      const spots = automatic
        ? placements(
            spec,
            sets,
            [w, h],
            page,
            gap,
            layoutAround(core.elements, spec.id, sets),
            dashed ? MIN_LINK : MIN_STUB
          )
        : [{}]
      const draw = (where) =>
        makeBox(
          styled({
            ...spec,
            // Why cy kept: a script may fix the row (cy) and let the kit pick the spot along it.
            ...(where.x !== undefined ? { x: where.x, y: where.y, cx: undefined } : {}),
            color: 'loss',
            fill: framed ? colors.fill : 'transparent',
            stroke: framed ? colors.stroke : 'transparent',
            role: 'loss',
            label,
            labelColor: colors.text,
            w,
            h,
            size: spec.size,
            exact: true,
            strokeWidth: spec.strokeWidth ?? 1.5
          })
        )
      const box = draw(spots[0])
      box[0].customData = { ...box[0].customData, asterLossForm: form, asterLossTone: tone }
      core.claim(spec.id, box)
      core.insert(box)
      const node = box[0]
      const moveBy = (kx, ky) => {
        for (const element of box) {
          element.x += kx
          element.y += ky
        }
      }
      const sources = [...entries.map(marked), ...inputs]
      const ringed = (ids) =>
        ids.map((id) => ring(`${spec.id}-ring-${id}`, [id], spec.id, pad, tone).id)
      const predictionRings = ringed(scatteredPredictions)
      const rings = ringed(scattered)
      const linkSpec = { ...spec, tone, links: dashed ? 'dashed' : 'solid' }
      const linksFor = () => {
        const links = separate(
          linkSpec,
          sources.map((from, index) => link(linkSpec, from, index, node)),
          sources,
          node
        )
        if (predictionRings.length) {
          links.push(...joined(linkSpec, predictionRings, node, sources.length, 'predictions'))
        }
        if (rings.length) {
          const offset = sources.length + (predictionRings.length ? 1 : 0)
          links.push(...joined(linkSpec, rings, node, offset))
        }
        return links
      }
      // Why only a placed node: a dashed link under 40 units prints solid, so an automatic spot
      // moves out by what is missing (kept on the page); a spot the script gave stays put.
      const settle = () => {
        const links = linksFor()
        const short = links.length ? Math.min(...links.map(pathLength)) : Infinity
        if (!(dashed && short < MIN_LINK && automatic && spec.nudge !== false)) {
          return links
        }
        const all = union(sets)
        const dx = node.x + node.width / 2 - (all.x + all.right) / 2
        const dy = node.y + node.height / 2 - (all.y + all.bottom) / 2
        const missing = MIN_LINK - short + 2
        const [mx, my] =
          Math.abs(dx) >= Math.abs(dy)
            ? [Math.sign(dx || 1) * missing, 0]
            : [0, Math.sign(dy || 1) * missing]
        const moved = clampToPage({ x: node.x + mx, y: node.y + my }, [w, h], page)
        moveBy(moved.x - node.x, moved.y - node.y)
        return linksFor()
      }
      let links = settle()
      // Why checked: the loss's wiring stays local, takes at most two bends and never crosses a
      // solid arrow; an automatic spot that cannot keep that is a script error, not a drawing.
      if (automatic) {
        const limit = localLimit(sets, gap)
        let first = null
        for (const [index, spot] of spots.entries()) {
          if (index) {
            moveBy(spot.x - node.x, spot.y - node.y)
            links = settle()
          }
          const problem = spot.free
            ? wiringProblem(spec.id, node, links, sets, limit)
            : 'every spot beside its sets lands on another item'
          if (!problem) {
            first = null
            break
          }
          first ??= { problem, cx: node.x + node.width / 2, cy: node.y + node.height / 2 }
        }
        if (first) {
          throw new Error(
            `loss ${spec.id}: no automatic spot keeps its wiring local (beside what it compares, at most two bends a link, clear of solid arrows); at the best one ${first.problem}. Give it cx and cy (try cx: ${Math.round(first.cx)}, cy: ${Math.round(first.cy)}), or use form: 'compare' (a link with the name on it) or 'none'`
          )
        }
      }
      // Why one head: links that still meet the node at one point read as a bracket.
      for (const [index, arrow] of links.entries()) {
        const tip = absolutePoints(arrow).at(-1)
        const earlier = links.slice(0, index).some((other) => {
          const end = absolutePoints(other).at(-1)
          return other.endArrowhead && Math.hypot(end[0] - tip[0], end[1] - tip[1]) < 6
        })
        if (earlier) {
          arrow.endArrowhead = null
        }
      }
      const note = spec.note ? noteFor(spec, box[0], links) : []
      core.insert(links, core.under([...sources, ...predictionRings, ...rings, spec.id]))
      core.insert(note)
      return box[0]
    },
    /**
     * Marks tensors a loss compares (in the loss's tone, ink by default): each one's outline (a
     * ring for images), or with `group: true` one box around them all (returned, to link once).
     */
    compared(ids, spec = {}) {
      if (spec.group) {
        return ring(spec.id ?? `${ids[0]}-compared`, ids, undefined, spec.pad ?? 6, spec.tone)
      }
      return ids.map((id) =>
        core.need(mark(id, spec.id ?? `${id}-compared`, spec.pad ?? 6, spec.tone))
      )
    },
    /** Rings the same cell (`cell: [row, col]`) of grids or patch glyphs: what is aligned. */
    highlight(ids, spec = {}) {
      const id = spec.id ?? `${ids[0]}-highlight`
      const rings = ids.map((glyph, index) => {
        const outline = core.need(glyph)
        const grid = outline.customData?.asterGrid
        if (!grid) {
          // Why: a token strip or any single element is ringed whole, or its n-th token.
          const target = typeof spec.cell === 'number' ? `${glyph}-${spec.cell}` : glyph
          return ringBox(`${id}-${index + 1}`, core.bounds(target), 2, spec.tone)
        }
        const [row, col] = Array.isArray(spec.cell) ? spec.cell : [0, 0]
        // Why the cell itself first: a matrix with an ellipsis band or a grid with gaps is not
        // an even split of its outline.
        const drawn = core.elements.find(
          (element) => element.id === `${glyph}-r${row}c${col}` && !element.isDeleted
        )
        const cellW = outline.width / grid.cols
        const cellH = outline.height / grid.rows
        return ringBox(
          `${id}-${index + 1}`,
          drawn
            ? { x: drawn.x, y: drawn.y, width: drawn.width, height: drawn.height }
            : {
                x: outline.x + col * cellW,
                y: outline.y + row * cellH,
                width: cellW,
                height: cellH
              },
          0,
          spec.tone
        )
      })
      return core.add(rings, id)
    }
  }
}
