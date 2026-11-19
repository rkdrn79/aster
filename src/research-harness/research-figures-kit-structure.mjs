// Key structure, drawn rather than boxed: a U-Net or encoder–decoder with resolution levels and
// skip connections, a ring for a loop, a cylinder for a store, and fig.structure, the motifs
// listed before drawing that `figures check` verifies are drawn (the bus and rails are in
// research-figures-kit-wiring.mjs).
import { PAGE_FRAME_ID, figureElement } from './research-figures-model.mjs'
import { makeBox, shapePaint } from './research-figures-draw.mjs'
import { makePolyline } from './research-figures-shapes.mjs'
import { oneOf } from './research-figures-options.mjs'
import { warnKit } from './research-figures-cards.mjs'

const ids = (value) => (Array.isArray(value) ? value : [value])

/** Elliptical arc points from angle a to b (radians), for a cylinder's ends. */
const arc = (cx, cy, rx, ry, a, b, steps = 12) =>
  Array.from({ length: steps + 1 }, (_, index) => {
    const t = a + ((b - a) * index) / steps
    return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)]
  })

/** The width of one hourglass half that fits its cards at 7 pt (side by side, or stacked). */
function hourglassHalf(kit, spec, given, bodyH) {
  const blocks = spec.blocks ?? 0
  const items = Array.isArray(blocks)
    ? [blocks.slice(0, Math.ceil(blocks.length / 2)), blocks.slice(Math.ceil(blocks.length / 2))]
    : blocks && typeof blocks === 'object'
      ? [blocks.enc ?? [], blocks.dec ?? []]
      : [[], []]
  const labels = items
    .flat()
    .map((item) => (item && typeof item === 'object' ? item.label : item))
    .filter(Boolean)
  if (!labels.length || spec.grow === false) {
    return given
  }
  const most = Math.max(...items.map((list) => list.length))
  const widest = Math.max(
    ...labels.map((label) => kit.measure('box', { label, size: 14, w: 8, h: 8 }).width)
  )
  const stacked = most > 1 && (bodyH * 0.72 - (most - 1) * 4) / most >= 14 * 1.25 + 4
  const need = Math.ceil(((widest + 2) * (stacked ? 1 : most)) / 0.8)
  if (given >= need) {
    return given
  }
  warnKit([
    `unet ${spec.id}: grew from w ${spec.w ?? 240} to ${2 * need + 16} so its cards fit (a card label needs ${Math.ceil(widest)} units at 7 pt); give that w, or grow: false to keep yours`
  ])
  return need
}

export function structureMethods(core, figOf) {
  const fig = () => figOf()
  return {
    /**
     * The key structural motifs, listed before drawing (from the method's text): `loops` (each
     * a list of ids in order, the last leading back to the first), `fanouts` ({ from, to: [ids] }),
     * `skips` and `feedback` ([from, to] pairs), and `text` (the sentence that names them).
     * `figures check` warns about each one the drawing does not connect.
     */
    structure(spec = {}) {
      const page = core.need(core.page()?.id ?? PAGE_FRAME_ID)
      const pairs = (name) =>
        (spec[name] ?? []).map((pair) => {
          if (!Array.isArray(pair) || pair.length !== 2) {
            throw new Error(`structure ${name} are [from, to] pairs, not ${JSON.stringify(pair)}`)
          }
          return pair
        })
      const motifs = {
        loops: (spec.loops ?? []).map((loop) => {
          if (!Array.isArray(loop) || loop.length < 2) {
            throw new Error(`structure loops are lists of two or more ids in order`)
          }
          return loop
        }),
        fanouts: (spec.fanouts ?? []).map(({ from, to }) => ({ from, to: ids(to) })),
        skips: pairs('skips'),
        feedback: pairs('feedback'),
        ...(spec.text ? { text: String(spec.text) } : {})
      }
      page.customData = { ...page.customData, asterStructure: motifs }
      return motifs
    },
    /**
     * A U-Net or encoder–decoder with its levels drawn: `shape` 'u' (down blocks stepping lower
     * per level, a bottleneck, up blocks rising back, skip arrows across each level) or
     * 'hourglass' (an encoder trapezoid narrowing into a decoder widening out, skips over the
     * top, `blocks` cards inside each half: LDM's Q K V). `levels`, `direction` 'right' | 'left'
     * (the way data flows), `resolutions` (a label under each level), `label` above it,
     * `color` (the halves), `blockColor`, `skips` (true, false or 'both' sides for hourglass).
     * Returns the ids to wire in and out: `{ in, out, down, up, mid, skips }`.
     */
    unet(spec) {
      const { id, x = 0, y = 0, w = 240, h = 120 } = spec
      if (!id) {
        throw new Error('unet({ id, x, y, w, h }) needs an id')
      }
      const kit = fig()
      const shape = oneOf('unet shape', spec.shape ?? 'u', ['u', 'hourglass'])
      const levels = Math.max(1, spec.levels ?? 3)
      const leftward = oneOf('direction', spec.direction ?? 'right', ['right', 'left']) === 'left'
      const color = spec.color ?? 'c'
      const skipRole = spec.skipRole ?? 'skip'
      const skipIds = []
      const top = spec.label ? y + 22 : y
      if (spec.label) {
        kit.text({ id: `${id}-title`, text: spec.label, cx: x + w / 2, y, size: spec.labelSize })
      }
      const span = y + h - top
      if (shape === 'hourglass') {
        // Why a thin band: on a small page the halves keep most of the height (LDM in 1.6 in).
        const skipCount = spec.skips === false ? 0 : (spec.skipCount ?? levels)
        const pitch = Math.max(4, Math.min(7, (span * 0.25) / Math.max(1, skipCount)))
        const reserved = skipCount ? 6 + skipCount * pitch : 0
        const bodyY = top + reserved
        const bodyH = y + h - bodyY - (spec.skips === 'both' ? reserved : 0)
        // Why the halves grow: round 13 and 14 agents gave LDM's hourglass 120 units and its
        // Q K V cards overflowed (an ERROR each); the halves now take the width their cards need
        // at 7 pt, side by side or stacked, and the kit says by how much it grew.
        const half = hourglassHalf(kit, spec, (w - 16) / 2, bodyH)
        const [encX, decX] = leftward ? [x + half + 16, x] : [x, x + half + 16]
        kit.trapezoid({
          id: `${id}-enc`,
          x: encX,
          y: bodyY,
          w: half,
          h: bodyH,
          narrow: leftward ? 'left' : 'right',
          ratio: 0.55,
          color
        })
        kit.trapezoid({
          id: `${id}-dec`,
          x: decX,
          y: bodyY,
          w: half,
          h: bodyH,
          narrow: leftward ? 'right' : 'left',
          ratio: 0.55,
          color
        })
        // Why a plain line: the two halves meet at the bottleneck; no head, no stub.
        kit.polyline({
          id: `${id}-mid`,
          points: [
            [x + half, bodyY + bodyH / 2],
            [x + half + 16, bodyY + bodyH / 2]
          ],
          color: 'line'
        })
        // Why per half: { enc, dec, mid } puts each card where it belongs; a list splits evenly.
        const given = spec.blocks ?? 0
        const list = Array.isArray(given)
          ? given
          : Array.from({ length: Number(given) || 0 }, () => '')
        const split = Math.ceil(list.length / 2)
        const halves =
          given && typeof given === 'object' && !Array.isArray(given)
            ? { enc: given.enc ?? [], dec: given.dec ?? [], mid: given.mid ?? [] }
            : { enc: list.slice(0, split), dec: list.slice(split), mid: [] }
        const most = Math.max(1, halves.enc.length, halves.dec.length)
        // Why measured: a card fits its label ('QKV' needs about 44 units at 8 pt), up to its slot.
        const entry = (item) => (item && typeof item === 'object' ? item : { label: item })
        // Why tried twice: at 8 pt the cards of a small hourglass overflow side by side and
        // stacked; at 7 pt (the floor) they fit stacked. cardLayout 'row' | 'column' chooses.
        const layoutAt = (size) => {
          const needs = [...halves.enc, ...halves.dec, ...halves.mid].map((item) => {
            const label = entry(item).label
            return label ? kit.measure('box', { label, size, w: 8, h: 8 }).width : 0
          })
          const slot = (half * 0.8) / most - 2
          const widest = Math.max(0, ...needs)
          const labelH = (size ?? 16) * 1.25 + 4
          const stackH = (bodyH * 0.72 - (most - 1) * 4) / most
          const column =
            spec.cardLayout === 'column' ||
            (spec.cardLayout !== 'row' && most > 1 && widest > slot + 0.5 && stackH >= labelH)
          const room = column ? half * 0.8 - 2 : slot
          return {
            size,
            needs,
            widest,
            room,
            column,
            labelH,
            stackH,
            slot,
            fits: widest <= room + 0.5 && (!column || stackH >= labelH)
          }
        }
        let layout = layoutAt(spec.cardSize)
        if (!layout.fits && spec.cardSize === undefined) {
          const small = layoutAt(14)
          layout = small.fits ? small : layout
        }
        const { size, needs, widest, room, column, labelH, stackH, slot } = layout
        const cardW = column
          ? Math.min(room, Math.max(36, widest))
          : Math.max(14, Math.min(slot, Math.max(36, ...needs)))
        if (widest > room + 0.5) {
          ;(core.warn ?? warnKit)([
            `unet ${id}: a card label needs ${Math.ceil(widest)} units but each slot holds ${Math.floor(room)}; widen the unet (w), give fewer cards per half, or a shorter label`
          ])
        }
        const cardH =
          spec.cardH ??
          (column
            ? Math.max(labelH, Math.min(32, stackH))
            : Math.max(14, Math.min(bodyH * 0.5, 44)))
        let count = 0
        const cards = { enc: [], dec: [], mid: [] }
        const card = (item, cx, name, cy = bodyY + bodyH / 2) => {
          count += 1
          const { label, color: own } = entry(item)
          const width = name === 'mid' ? Math.max(cardW, needs[count - 1] ?? 0) : cardW
          kit.box({
            id: `${id}-b${count}`,
            label,
            x: cx - width / 2,
            y: cy - cardH / 2,
            w: width,
            h: cardH,
            size,
            color: own ?? spec.blockColor ?? 'a',
            exact: true
          })
          cards[name].push(`${id}-b${count}`)
        }
        for (const [name, baseX] of [
          ['enc', encX],
          ['dec', decX]
        ]) {
          const n = halves[name].length
          halves[name].forEach((item, place) =>
            column
              ? card(
                  item,
                  baseX + half / 2,
                  name,
                  bodyY + bodyH / 2 + (place - (n - 1) / 2) * (cardH + 4)
                )
              : card(item, baseX + half * 0.1 + (half * 0.8 * (place + 0.5)) / n, name)
          )
        }
        halves.mid.forEach((item) => card(item, x + half + 8, 'mid'))
        const encOuter = leftward ? encX + half : encX
        const decOuter = leftward ? decX : decX + half
        const sides =
          spec.skips === 'both'
            ? ['above', 'below']
            : spec.skips === false
              ? []
              : spec.skips === 'below'
                ? ['below']
                : ['above']
        for (const where of sides) {
          for (let level = 0; level < skipCount; level += 1) {
            const inset = half * (0.12 + (0.3 * level) / skipCount)
            const yy =
              where === 'above'
                ? bodyY - 6 - (skipCount - 1 - level) * pitch
                : bodyY + bodyH + 6 + (skipCount - 1 - level) * pitch
            const from = leftward ? encOuter - inset : encOuter + inset
            const to = leftward ? decOuter + inset : decOuter - inset
            // Why legs: a skip that leaves one half's edge and lands on the other's reads as a
            // connection; a dash floating over the halves does not. The edges slope to the waist.
            const edge = (at) => {
              const slope = ((bodyH * (1 - 0.55)) / 2) * (at / half)
              return where === 'above' ? bodyY + slope - 2 : bodyY + bodyH - slope + 2
            }
            const skip = `${id}-skip-${where}${level}`
            const drawn = kit.arrow({
              id: skip,
              from: [from, edge(inset)],
              to: [to, edge(inset)],
              points: [
                [from, edge(inset)],
                [from, yy],
                [to, yy],
                [to, edge(inset)]
              ],
              role: skipRole,
              gap: 0
            })
            // Why recorded: the skip ends on the drawn halves, unbound, so fig.structure learns
            // what it joins.
            drawn.customData = {
              ...drawn.customData,
              asterLink: { from: `${id}-enc`, to: `${id}-dec`, unet: id }
            }
            skipIds.push(skip)
          }
        }
        return {
          in: `${id}-enc`,
          out: `${id}-dec`,
          down: [`${id}-enc`],
          up: [`${id}-dec`],
          mid: `${id}-mid`,
          skips: skipIds,
          cards
        }
      }
      const columns = 2 * levels + 1
      const step = w / columns
      const blockW = Math.min(spec.blockW ?? step * 0.45, 64)
      // Why these steps: tops fall by `drop`, heights by half of it, so tops, bottoms and
      // centres of neighbouring levels differ by 6 units or more (no near-miss alignment).
      const drop = Math.max(12, Math.min((0.6 * span) / levels, 28))
      const tallest = span - (levels * drop) / 2
      const column = (index) =>
        (leftward ? x + w - (index + 1) * step : x + index * step) + (step - blockW) / 2
      const down = []
      const up = []
      const blockLabel = (side, level) =>
        typeof spec.blocks === 'function'
          ? spec.blocks(side, level)
          : (spec.blocks?.[side]?.[level] ?? '')
      for (let level = 0; level < levels; level += 1) {
        const height = tallest - (level * drop) / 2
        const by = top + level * drop
        down.push(
          kit.box({
            id: `${id}-d${level}`,
            label: blockLabel('down', level),
            x: column(level),
            y: by,
            w: blockW,
            h: height,
            color,
            exact: true
          }).id
        )
        up.push(
          kit.box({
            id: `${id}-u${level}`,
            label: blockLabel('up', level),
            x: column(columns - 1 - level),
            y: by,
            w: blockW,
            h: height,
            color,
            exact: true
          }).id
        )
        if (spec.resolutions?.[level] !== undefined) {
          kit.text({
            id: `${id}-res${level}`,
            text: String(spec.resolutions[level]),
            cx: column(level) + blockW / 2,
            y: by + height + 3,
            size: spec.resolutionSize
          })
        }
      }
      const mid = kit.box({
        id: `${id}-mid`,
        label: spec.bottleneck ?? '',
        x: column(levels),
        y: top + levels * drop,
        w: blockW,
        h: tallest - (levels * drop) / 2,
        color: spec.midColor ?? color,
        exact: true
      }).id
      const chain = [...down, mid, ...up.toReversed()]
      chain.slice(1).forEach((item, index) => {
        kit.arrow({
          id: `${id}-step${index + 1}`,
          from: chain[index],
          to: item,
          route: 'hv',
          role: spec.role
        })
      })
      if (spec.skips !== false) {
        for (let level = 0; level < levels; level += 1) {
          const box = core.bounds(down[level])
          const yy = box.y + Math.min(10, box.height / 4)
          const skip = `${id}-skip${level}`
          const drawn = kit.arrow({
            id: skip,
            from: down[level],
            to: up[level],
            fromAt: { y: yy },
            toAt: { y: yy },
            role: skipRole
          })
          drawn.customData = {
            ...drawn.customData,
            asterLink: { from: down[level], to: up[level], unet: id }
          }
          skipIds.push(skip)
        }
      }
      return { in: down[0], out: up[0], down, up, mid, skips: skipIds }
    },
    /**
     * A loop drawn as a loop: moves `items` onto a ring round (cx, cy) of radius `r` (`rx`, `ry`
     * for an ellipse), the first at `start` degrees (-90, the top), clockwise unless
     * `clockwise: false`, and joins each to the next with an outward arc (`<id>-<n>`), the
     * last back to the first unless `open: true`. `labels`, `role`, `color` style the arcs.
     */
    ring(spec) {
      const { id, items, cx, cy } = spec
      if (!id || !Array.isArray(items) || items.length < 2 || ![cx, cy].every(Number.isFinite)) {
        throw new Error(
          'ring({ id, items: [ids], cx, cy, r }) needs an id, two or more items and a centre'
        )
      }
      const kit = fig()
      const rx = spec.rx ?? spec.r ?? 80
      const ry = spec.ry ?? spec.r ?? 80
      const sign = spec.clockwise === false ? -1 : 1
      const start = ((spec.start ?? -90) * Math.PI) / 180
      items.forEach((item, index) => {
        const angle = start + (sign * 2 * Math.PI * index) / items.length
        const box = core.bounds(item)
        kit.move(
          item,
          cx + rx * Math.cos(angle) - (box.x + box.width / 2),
          cy + ry * Math.sin(angle) - (box.y + box.height / 2)
        )
      })
      const frame = core.page() ? core.need(core.page().id) : null
      const off = frame
        ? items.filter((item) => {
            const box = core.bounds(item)
            return (
              box.x < frame.x + 4 ||
              box.y < frame.y + 4 ||
              box.right > frame.x + frame.width - 4 ||
              box.bottom > frame.y + frame.height - 4
            )
          })
        : []
      if (off.length) {
        ;(core.warn ?? warnKit)([
          `ring ${id}: ${off.join(', ')} ${off.length > 1 ? 'leave' : 'leaves'} the page; give a smaller rx / ry or move cx, cy (the items' centres sit on the ring)`
        ])
      }
      const count = spec.open ? items.length - 1 : items.length
      const arcs = Array.from({ length: count }, (_, index) => {
        const from = items[index]
        const to = items[(index + 1) % items.length]
        const a = core.bounds(from)
        const b = core.bounds(to)
        const chord = Math.hypot(b.x - a.x, b.y - a.y)
        return kit.curve({
          id: `${id}-${index + 1}`,
          from,
          to,
          bend: sign * (spec.bend ?? chord / 6),
          role: spec.role,
          color: spec.color,
          dashed: spec.dashed?.[index] ?? (spec.dashed === true ? true : undefined),
          ...(spec.labels?.[index] !== undefined ? { label: spec.labels[index] } : {})
        })
      })
      return { arcs }
    },
    /** A store (a memory, a library, a database, a replay buffer): a cylinder that binds as a box. */
    cylinder(spec) {
      const { id, x = 0, y = 0, w = 72, h = 56 } = spec
      if (!id) {
        throw new Error('cylinder({ id, x, y, w, h, label }) needs an id')
      }
      const styled = core.styled(spec)
      const paint = shapePaint(styled)
      // Why at most 14: a tall store's lid stays a lid, leaving the body for its label or items.
      const cap = Math.min(spec.cap ?? Math.min(h * 0.18, 14), h / 3)
      const [cx, rx, ry] = [x + w / 2, w / 2, cap / 2]
      const body = [
        ...arc(cx, y + ry, rx, ry, Math.PI, 0),
        ...arc(cx, y + h - ry, rx, ry, 0, Math.PI)
      ]
      const outline = makePolyline({
        ...styled,
        id: `${id}-body`,
        points: body,
        closed: true,
        fill: paint.fill,
        stroke: paint.stroke === 'transparent' ? undefined : paint.stroke
      })
      outline.customData = { ...outline.customData, asterShape: 'cylinder' }
      const lid = figureElement('ellipse', {
        id: `${id}-cap`,
        x,
        y,
        width: w,
        height: cap,
        strokeColor: outline.strokeColor,
        backgroundColor: paint.fill,
        strokeWidth: outline.strokeWidth,
        frameId: spec.frame ?? null
      })
      const parts = makeBox(
        core.styled({
          ...spec,
          x,
          y: y + cap / 2,
          w,
          h: h - cap / 2,
          exact: true,
          stroke: 'transparent',
          fill: 'transparent',
          rounded: false
        })
      )
      return core.add([outline, lid, ...parts], id)
    }
  }
}
