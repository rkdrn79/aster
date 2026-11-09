// Illustration glyphs for overview and teaser figures: a faded neural-network glyph with its name
// on top, a cycle of two curved arrows between modules, a coloured key phrase on a flow, and a
// speech bubble holding text lines. All editable shapes; each binds as one id.
import { makeArrow } from './research-figures-draw.mjs'
import { shadesOf } from './research-figures-glyphs-data.mjs'
import { figureElement } from './research-figures-model.mjs'
import { labelLines, makeLines, measureLines, texLabel } from './research-figures-type.mjs'
import { warnKit } from './research-figures-cards.mjs'
import { wrapLabel } from './research-figures-wrap.mjs'
import { styleColor } from './research-figures-style.mjs'
import { glyphBounds } from './research-figures-text.mjs'
import { elementBounds } from './research-figures-geometry.mjs'
import { oneOf } from './research-figures-options.mjs'

const inkOf = (element) => (element.type === 'text' ? glyphBounds(element) : elementBounds(element))

function union(boxes) {
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return { x, y, width: right - x, height: bottom - y, right, bottom }
}

/** An invisible box with the glyph's id, for arrows and badges to bind to. */
const outline = (id, box, kind) =>
  figureElement('rectangle', {
    id,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    strokeColor: 'transparent',
    backgroundColor: 'transparent',
    boundElements: [],
    customData: { asterGlyph: kind }
  })

export function illustrateMethods(core) {
  const { styled } = core
  const styleNow = () => styled({}).style
  /** Text lines of a label, centred on (cx, cy) or from (x, y). */
  const words = (spec, text, size, where) =>
    makeLines(
      styled({ id: spec.id, size, color: spec.color, frame: spec.frame, ...where }),
      labelLines(text, size, undefined, styleNow())
    )
  return {
    /**
     * A neural network drawn as nodes and edges with its name (`label`) above it (`labelSide`
     * above | center | below; `size` 16): what papers draw for "reward model", "LM policy".
     * `highlight: [layer, node]` tints one node; a gray `color` stays visible on a panel.
     */
    nn(spec) {
      const style = styleNow()
      const { id, x = 0, y = 0, w = 150, h = 90 } = spec
      const layers = spec.layers ?? [3, 4, 4, 3]
      const faded = spec.faded !== false
      const side = oneOf('labelSide', spec.labelSide, ['above', 'center', 'below']) ?? 'above'
      // Why fainter under a name: a label over the edges reads only on a quiet glyph.
      const behind = spec.label !== undefined && side === 'center'
      const color = spec.color ?? 'accent'
      // Why mid tones: pale tints vanish at this size, solid ones shout.
      const nodeFill = shadesOf(style, color).strong
      const most = Math.max(...layers)
      const r = Math.max(3, Math.min(6, h / (most * 3.2)))
      const step = layers.length > 1 ? (w - 2 * r) / (layers.length - 1) : 0
      const nodes = layers.map((count, layer) =>
        Array.from({ length: count }, (_, index) => [
          x + r + layer * step,
          y + h / 2 + (index - (count - 1) / 2) * ((h - 2 * r) / Math.max(1, most - 1))
        ])
      )
      const edges = []
      for (let layer = 1; layer < nodes.length; layer += 1) {
        for (const [ax, ay] of nodes[layer - 1]) {
          for (const [bx, by] of nodes[layer]) {
            edges.push(
              figureElement('line', {
                id: `${id}-e${edges.length}`,
                x: ax,
                y: ay,
                width: bx - ax,
                height: Math.abs(by - ay),
                points: [
                  [0, 0],
                  [bx - ax, by - ay]
                ],
                strokeColor: style.muted,
                strokeWidth: 1,
                opacity: behind ? 20 : faded ? 30 : 60
              })
            )
          }
        }
      }
      const [hl, hn] = Array.isArray(spec.highlight)
        ? spec.highlight
        : spec.highlight
          ? [spec.highlight.layer, spec.highlight.node]
          : [null, null]
      const dots = nodes.flatMap((layer, li) =>
        layer.map(([cx, cy], ni) => {
          const lit = li === hl && ni === hn
          return figureElement('ellipse', {
            id: `${id}-n${li}-${ni}`,
            x: cx - r,
            y: cy - r,
            width: r * 2,
            height: r * 2,
            strokeColor: 'transparent',
            backgroundColor: lit
              ? styleColor(style, spec.highlightColor ?? 'accent-ink').fill
              : nodeFill,
            opacity: lit ? 100 : behind ? 45 : faded ? 55 : 90,
            boundElements: []
          })
        })
      )
      const box = { x, y, width: w, height: h }
      const items = [outline(id, box, 'nn'), ...edges, ...dots]
      if (spec.label !== undefined) {
        // Why 16 and above: every label is 8 pt, and a name over the edges hides them.
        const size = spec.size ?? style.textSize
        const probe = words({ id: 'probe' }, spec.label, size, { x: 0, y: 0 })
        const label = words(
          { id: `${id}-label`, color: spec.labelColor },
          spec.label,
          size,
          side === 'center'
            ? { cx: x + w / 2, cy: y + h / 2 }
            : side === 'above'
              ? { cx: x + w / 2, y: y - 4 - probe.height }
              : { cx: x + w / 2, y: y + h + 4 }
        )
        // Why a pill only in the middle: a name over the edges needs a backing to read.
        if (spec.pill ?? side === 'center') {
          const ink = union(label.elements.map(inkOf))
          items.push(
            figureElement('rectangle', {
              id: `${id}-pill`,
              x: ink.x - 6,
              y: ink.y - 4,
              width: ink.width + 12,
              height: ink.height + 8,
              strokeColor: 'transparent',
              backgroundColor: '#ffffff',
              opacity: 85,
              roundness: { type: 3, value: 8 }
            })
          )
        }
        items.push(...label.elements)
        if (side !== 'center') {
          // Why the label inside the bound box: an arrow from the label's side ends on the
          // name, as one item, instead of detouring round it to reach the nodes.
          const ink = union(label.elements.map(inkOf))
          const top = Math.min(y, ink.y - 2)
          Object.assign(items[0], {
            y: top,
            height: Math.max(y + h, ink.bottom + 2) - top,
            customData: { ...items[0].customData, asterBody: { x, y, width: w, height: h } }
          })
        }
      }
      core.add(items, id)
      return { id, x, y, width: w, height: h, nodes }
    },
    /**
     * Two curved arrows between modules, as a loop: the top one toward `between[1]`, the bottom
     * one back (left and right ones when the modules are stacked), with a phrase beside each.
     */
    cycle(spec) {
      const [first, second] = spec.between ?? []
      if (!first || !second) {
        throw new Error('cycle({ id, between: [a, b] }) needs two ids')
      }
      const a = core.bounds(first)
      const b = core.bounds(second)
      const style = styleNow()
      const across = a.right <= b.x || b.right <= a.x
      const items = []
      /** The bend that bulges toward `side`: an arc bends left of travel, so flip it if inward. */
      const outward = (from, to, side) => {
        const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1
        const bend =
          spec.curve === undefined || spec.curve === 'arc' ? length / 4 : Number(spec.curve)
        const normal = [(to[1] - from[1]) / length, -(to[0] - from[0]) / length]
        const away = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }[side]
        return normal[0] * away[0] + normal[1] * away[1] >= 0 ? Math.abs(bend) : -Math.abs(bend)
      }
      const arc = (suffix, from, to, label, side) => {
        const arrow = makeArrow(
          styled({
            id: `${spec.id}-${suffix}`,
            from,
            to,
            curve: outward(from, to, side),
            color: spec.color,
            role: spec.role,
            strokeWidth: spec.strokeWidth ?? 2
          }),
          core.lookup
        )
        items.push(arrow)
        if (label) {
          const xs = arrow.points.map(([px]) => arrow.x + px)
          const ys = arrow.points.map(([, py]) => arrow.y + py)
          const size = spec.size ?? style.textSize
          const probe = words({ id: 'probe' }, label, size, { x: 0, y: 0 })
          const ink = union(probe.elements.map(inkOf))
          const cx = (Math.min(...xs) + Math.max(...xs)) / 2
          const cy = (Math.min(...ys) + Math.max(...ys)) / 2
          const where =
            side === 'top'
              ? { cx, y: Math.min(...ys) - 6 - ink.height - (ink.y - probe.elements[0].y) }
              : side === 'bottom'
                ? { cx, y: Math.max(...ys) + 6 - (ink.y - probe.elements[0].y) }
                : side === 'left'
                  ? { x: Math.min(...xs) - 6 - ink.width, cy }
                  : { x: Math.max(...xs) + 6, cy }
          items.push(...words({ id: `${spec.id}-${suffix}-label` }, label, size, where).elements)
        }
      }
      const labels = spec.labels ?? {}
      // Why a title inside: the loop's name ("RL") sits between the arcs, which part for it.
      const titleSize = spec.titleSize ?? style.textSize
      const title =
        spec.title !== undefined
          ? words({ id: 'probe' }, spec.title, titleSize, { x: 0, y: 0 })
          : null
      const warnings = []
      const drawTitle = (cx, cy, room) => {
        if (title.width > room) {
          warnings.push(
            `cycle ${spec.id}: its title is ${Math.round(title.width)} wide but the arcs leave ${Math.round(room)}; move the modules apart or shorten it`
          )
        }
        items.push(
          ...words(
            { id: `${spec.id}-title`, color: spec.titleColor ?? 'accent-ink' },
            spec.title,
            titleSize,
            { cx, cy }
          ).elements
        )
      }
      if (across) {
        const [left, right] = a.x < b.x ? [a, b] : [b, a]
        const forward = a.x < b.x
        const lo = left.right + 8
        const hi = right.x - 8
        const cy = (Math.max(left.y, right.y) + Math.min(left.bottom, right.bottom)) / 2
        const dy = Math.max(
          Math.min(left.height, right.height) * 0.22,
          title ? title.height / 2 + 6 : 0
        )
        if (title) {
          drawTitle((lo + hi) / 2, cy, hi - lo - 8)
        }
        const top = forward
          ? [
              [lo, cy - dy],
              [hi, cy - dy]
            ]
          : [
              [hi, cy - dy],
              [lo, cy - dy]
            ]
        const bottom = forward
          ? [
              [hi, cy + dy],
              [lo, cy + dy]
            ]
          : [
              [lo, cy + dy],
              [hi, cy + dy]
            ]
        // Why outward: both arcs bulge away from each other, whichever way each one runs.
        arc('top', ...top, labels.top, 'top')
        arc('bottom', ...bottom, labels.bottom, 'bottom')
      } else {
        const [upper, lower] = a.y < b.y ? [a, b] : [b, a]
        const lo = upper.bottom + 8
        const hi = lower.y - 8
        const cx = (Math.max(upper.x, lower.x) + Math.min(upper.right, lower.right)) / 2
        const dx = Math.max(
          Math.min(upper.width, lower.width) * 0.22,
          title ? title.width / 2 + 8 : 0
        )
        if (title) {
          drawTitle(cx, (lo + hi) / 2, 2 * dx - 8)
          if (title.height > hi - lo - 8) {
            warnings.push(`cycle ${spec.id}: its title is taller than the gap between the modules`)
          }
        }
        arc(
          'left',
          [cx - dx, a.y < b.y ? lo : hi],
          [cx - dx, a.y < b.y ? hi : lo],
          labels.left ?? labels.top,
          'left'
        )
        arc(
          'right',
          [cx + dx, a.y < b.y ? hi : lo],
          [cx + dx, a.y < b.y ? lo : hi],
          labels.right ?? labels.bottom,
          'right'
        )
      }
      core.claim(spec.id, items)
      core.insert(items)
      warnKit(warnings)
      return items
    },
    /**
     * A key phrase in colour (`color: 'accent-ink'`, `'panel-2-ink'`, or `'red'` when asked for
     * the RL step), under or over an arrow, under an item, or at x, y / cx, cy.
     */
    callout(spec) {
      const style = styleNow()
      const size = spec.size ?? style.calloutSize
      const color = spec.color ?? 'accent-ink'
      const probe = words({ id: 'probe', color }, spec.text, size, { x: 0, y: 0 })
      const ink = union(probe.elements.map(inkOf))
      const lead = ink.y - probe.elements[0].y
      const anchorId = spec.under ?? spec.over ?? spec.at
      let where = { x: spec.x, y: spec.y, cx: spec.cx, cy: spec.cy }
      if (anchorId) {
        const box = core.bounds(anchorId)
        const cx = box.x + box.width / 2
        where = spec.over
          ? { cx, y: box.y - (spec.gap ?? 6) - ink.height - lead }
          : { cx, y: box.bottom + (spec.gap ?? 6) - lead }
      }
      const drawn = words({ id: spec.id, color }, spec.text, size, where)
      for (const element of drawn.elements) {
        element.customData = {
          ...element.customData,
          asterCallout: true,
          ...(color === 'loss' ? { asterRole: 'loss' } : {})
        }
      }
      core.claim(spec.id, drawn.elements)
      core.insert(drawn.elements)
      return drawn
    },
    /**
     * A speech bubble (a prompt, a completion): `text` (words, or runs with { tex }) inside it,
     * or `lines` placeholder text lines (fewer when the bubble is short), with an optional TeX
     * `label` at the end of the last line (y_w). The tail hangs `tailSize` (12) below the body
     * on the bottom-left (`tail: 'right'` flips it, 'none' drops it): bounds(id) include it,
     * bounds(id, { own: true }) is the body alone.
     */
    bubble(spec) {
      const style = styleNow()
      const { id, x = 0, y = 0 } = spec
      const ink = styleColor(style, spec.color ?? 'ink').ink
      const fill = styleColor(style, spec.fill ?? 'white').fill
      // Why 1.5: a 2.5 outline at bubble size reads heavier than the arrows beside it.
      const stroke = spec.strokeWidth ?? 1.5
      const size = spec.size ?? style.smallSize
      const labelSize = spec.labelSize ?? style.smallSize
      const tex = spec.label !== undefined ? texLabel(spec.label) : null
      const labelWidth = tex ? words({ id: 'probe' }, tex, labelSize, { x: 0, y: 0 }).width : 0
      // Why room for the label: it ends the last line (y_w), so the text stops short of it.
      const labelRoom = tex && spec.text !== undefined ? labelWidth + 6 : 0
      const warnings = []
      let text = spec.text
      if (text !== undefined && spec.w !== undefined) {
        // Why wrap: a fixed width (a column of bubbles) must hold the words, never spill them.
        const wrapped = wrapLabel(text, spec.w - 16 - labelRoom, size, style)
        text = wrapped.label
        if (wrapped.overflow) {
          warnings.push(
            `bubble ${id}: a word is wider than w ${spec.w} allows; widen it or set a smaller size`
          )
        }
      }
      const content = text !== undefined ? words({ id: 'probe' }, text, size, { x: 0, y: 0 }) : null
      const w = spec.w ?? (content ? Math.max(60, Math.ceil(content.width + 16 + labelRoom)) : 60)
      let h = spec.h ?? (content ? Math.ceil(content.height + 12) : 46)
      const fitW = content ? Math.ceil(content.width + 16 + labelRoom) : 0
      if (content && (w - fitW >= 48 || h - content.height - 12 >= 40)) {
        // Why: an empty half of a bubble reads as content that is missing.
        warnings.push(
          `bubble ${id}: ${w} × ${h} is far bigger than its text (${fitW} × ${Math.ceil(content.height + 12)}); drop w and h to fit it`
        )
      }
      if (content && content.height + 6 > h) {
        h = Math.ceil(content.height + 6)
        warnings.push(
          `bubble ${id}: its text needs ${h} units but h is ${spec.h}, so the bubble grew; widen w or shorten the text`
        )
      }
      const tail = oneOf('tail', spec.tail, ['left', 'right', 'none']) ?? 'left'
      const body = figureElement('rectangle', {
        id,
        x,
        y,
        width: w,
        height: h,
        strokeColor: ink,
        backgroundColor: fill,
        strokeWidth: stroke,
        roundness: { type: 3, value: Math.min(8, h / 4) },
        boundElements: [],
        // Why: its words are data (a prompt, a completion), so the prose lint lets them be.
        customData: { asterContent: true }
      })
      const items = [body]
      if (tail !== 'none') {
        const right = tail === 'right'
        const reach = spec.tailSize ?? 12
        const base = right ? [x + w - 26, x + w - 12] : [x + 12, x + 26]
        const tip = right ? [x + w - 4, y + h + reach] : [x + 4, y + h + reach]
        items.push(
          figureElement('line', {
            id: `${id}-tailfill`,
            x: base[0],
            y: y + h - 2,
            width: 14,
            height: reach + 2,
            points: [
              [0, 0],
              [tip[0] - base[0], tip[1] - (y + h - 2)],
              [base[1] - base[0], 0],
              [0, 0]
            ],
            strokeColor: 'transparent',
            backgroundColor: fill
          }),
          figureElement('line', {
            id: `${id}-tail`,
            x: base[0],
            y: y + h,
            width: 14,
            height: reach,
            points: [
              [0, 0],
              [tip[0] - base[0], tip[1] - (y + h)],
              [base[1] - base[0], 0]
            ],
            strokeColor: ink,
            strokeWidth: stroke
          })
        )
      }
      // Why the last line's middle: the label ends the text's last line, beside it.
      let lastLine = y + h / 2
      if (content) {
        items.push(
          ...words({ id: `${id}-text`, color: spec.textColor }, text, size, {
            x: x + 8,
            cy: y + h / 2
          }).elements
        )
        const { heights } = measureLines(labelLines(text, size, undefined, style), size, style)
        lastLine = y + h / 2 + content.height / 2 - (heights.at(-1) ?? 0) / 2
      }
      // Why fewer lines when short: rows closer than 6 units merge into one gray band.
      const pad = Math.min(10, Math.max(6, h * 0.22))
      const fit = Math.max(1, Math.floor((h - 2 * pad) / 6) + 1)
      const count = content ? 0 : Math.min(spec.lines ?? 3, fit)
      const lengths = [0.62, 0.5, 0.36, 0.5]
      const rowY = (index) =>
        count === 1 ? y + h / 2 : y + pad + (index * (h - 2 * pad)) / Math.max(1, count - 1)
      for (let index = 0; index < count; index += 1) {
        // Why shorter: the last line stops short of the label at its end (y_w in DPO).
        const last = index === count - 1 && tex
        const room = w - 20 - (last ? labelWidth + 6 : 0)
        const length = Math.max(0, Math.min(room, w * lengths[index % lengths.length]))
        if (length < 4) {
          continue
        }
        items.push(
          figureElement('line', {
            id: `${id}-line${index}`,
            x: x + 10,
            y: rowY(index),
            width: length,
            height: 0,
            points: [
              [0, 0],
              [length, 0]
            ],
            strokeColor: ink,
            // Why thinner when tight: thick rows close together read as one band; never under
            // 1.5, or the placeholder text fades at print.
            strokeWidth: Math.min(2, Math.max(1.5, (h - 2 * pad) / (3 * Math.max(1, count))))
          })
        )
      }
      if (tex) {
        items.push(
          ...words({ id: `${id}-label`, color: spec.color }, tex, labelSize, {
            x: x + w - 6,
            cy: count ? rowY(count - 1) : lastLine,
            align: 'right'
          }).elements
        )
      }
      core.add(items, id)
      // Why core.warn first: measure() runs this on a core that keeps the warnings to itself.
      const warn = core.warn ?? warnKit
      warn(warnings)
      return body
    }
  }
}
