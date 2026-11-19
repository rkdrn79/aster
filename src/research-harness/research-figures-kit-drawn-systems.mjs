// The drawn glyphs of systems and structure (research-figures-drawn): a memory-hierarchy pyramid,
// a tiled matrix with highlighted blocks and loop arrows (FlashAttention), curved skip arcs
// coloured by their source (DenseNet) and token pills (RT-2); the voxel grid is in -drawn-voxels.
import { PAPER_STROKE } from './research-figures-paper.mjs'
import { adopt, boxOf, drawnParts, roleTones, shade } from './research-figures-drawn.mjs'
import { shiftAll } from './research-figures-drawn-parts.mjs'
import { contrast } from './research-figures-color-space.mjs'

const num = (value, fallback) => (Number.isFinite(value) ? value : fallback)
/** The roles the family cycles through when a glyph colours its parts by a dimension. */
export const DIMENSION_ROLES = ['a', 'd', 'c', 'b']

/** A role name the current style knows, else the next fallback (a preset without a–d). */
export function knownRole(style, role, fallbacks = ['accent', 'strong']) {
  for (const name of [role, ...fallbacks]) {
    try {
      roleTones(style, name)
      return name
    } catch {
      // Why: graphite has no a–d; the accent and grays stand in.
    }
  }
  return 'strong'
}

export function drawnSystemMethods(core, context) {
  const style = () => core.styled({}).style
  const fig = () => context().fig
  const finish = (spec, elements, box, extra = {}) => {
    const parts = drawnParts(spec, style())
    core.add([parts.holder(box), ...elements], spec.id)
    return { id: spec.id, ...box, ...extra }
  }
  /** A kit arrow or curve drawn as part of this glyph. */
  const nested = (owner, call, arrow, meaning = null) => {
    fig()[call](arrow)
    adopt(core, owner, [arrow.id])
    if (meaning) {
      // Why: a loop's or a token's colour names what it is, so the design layer keeps it.
      for (const element of core.elements.filter((item) => item.id.startsWith(arrow.id))) {
        element.customData = { ...element.customData, asterMeaning: meaning }
      }
    }
  }
  return {
    /**
     * A memory hierarchy as a pyramid: tiers top (fast, small) to bottom (slow, large), each in
     * its own colour with its name inside and a note beside it ("SRAM: 19 TB/s (20 MB)"), the
     * note's lead word in the tier's colour.
     */
    pyramid(spec) {
      const s = style()
      const parts = drawnParts(spec, s)
      const tiers = spec.tiers ?? []
      if (!tiers.length) {
        throw new Error('pyramid needs tiers: [{ label, note, role }], top first')
      }
      const w = num(spec.w, 150)
      const h = num(spec.h, 110)
      const x = num(spec.x, 0)
      const y = num(spec.y, 0)
      const given = spec.weights ?? tiers.map((_, index) => (index === 0 ? 1.4 : 1))
      // Why the apex grows to its name: the name sits where the triangle is wider than it.
      const apexName = tiers[0].label
        ? parts.words(`${spec.id}-probe`, tiers[0].label, { x: 0, y: 0 }, { size: s.smallSize })
        : null
      const apexNeed = apexName ? ((apexName.width + 8) * h) / w + apexName.height + 3 : 0
      const share = given[0] / given.reduce((sum, value) => sum + value, 0)
      const apex = Math.min(0.62, Math.max(share, apexNeed / h))
      const restWeights = given.slice(1)
      const restTotal = restWeights.reduce((sum, value) => sum + value, 0) || 1
      const weights = spec.weights ?? [
        apex,
        ...restWeights.map((value) => ((1 - apex) * value) / restTotal)
      ]
      const total = weights.reduce((sum, value) => sum + value, 0)
      const half = (yy) => ((yy - y) / h) * (w / 2)
      const cx = x + w / 2
      const elements = []
      const placed = []
      let top = y
      for (const [index, tier] of tiers.entries()) {
        const bottom = top + (h * weights[index]) / total
        const role = knownRole(s, tier.role ?? DIMENSION_ROLES[index % DIMENSION_ROLES.length])
        const tones = roleTones(s, role)
        const fill =
          spec.tone === 'fill' ? tones.fill : spec.tone === 'solid' ? tones.solid : tones.strong
        const corners =
          index === 0
            ? [
                [cx, top],
                [cx + half(bottom), bottom],
                [cx - half(bottom), bottom]
              ]
            : [
                [cx - half(top), top],
                [cx + half(top), top],
                [cx + half(bottom), bottom],
                [cx - half(bottom), bottom]
              ]
        elements.push(
          parts.poly(`${spec.id}-t${index}`, corners, { fill, stroke: s.line, meaning: 'tier' })
        )
        // Why the better of white and ink: the name must read on the tier at print.
        const name = contrast('#ffffff', fill) >= 4.5 ? '#ffffff' : s.ink
        if (tier.label) {
          const label = parts.words(
            `${spec.id}-t${index}-label`,
            tier.label,
            { cx, cy: (top + bottom) / 2 },
            { size: index === 0 ? s.smallSize : s.textSize, color: name, meaning: 'tier' }
          )
          // Why low in the apex: the triangle is widest at its base; the name's top must be where
          // the apex is already wider than the name.
          const fits = y + ((label.width + 8) / w) * h
          const lift = index === 0 ? Math.max(fits - label.y, bottom - 3 - label.bottom) : 0
          elements.push(...shiftAll(label.elements, 0, lift))
        }
        if (tier.note && spec.notes !== false) {
          const yy = (top + bottom) / 2
          // Why the text's lower edge: the slanted side is widest there, so the note clears it.
          const edge = half(Math.min(bottom, yy + s.textSize * 0.7))
          const nx = spec.notes === 'left' ? cx - edge - 8 : cx + edge + 8
          const text = String(tier.note)
          const split = text.indexOf(': ')
          const lead = split > 0 ? text.slice(0, split + 1) : ''
          const rest = split > 0 ? text.slice(split + 2) : text
          const align = spec.notes === 'left' ? 'right' : 'left'
          const leadLabel = lead
            ? parts.words(
                `${spec.id}-t${index}-lead`,
                lead,
                { x: nx, cy: yy, align },
                { size: s.textSize, color: tones.ink, meaning: 'tier' }
              )
            : null
          const restX = leadLabel ? (align === 'left' ? leadLabel.right + 3 : leadLabel.x - 3) : nx
          elements.push(
            ...(leadLabel?.elements ?? []),
            ...parts.words(
              `${spec.id}-t${index}-note`,
              rest,
              { x: restX, cy: yy, align },
              { size: s.textSize }
            ).elements
          )
        }
        placed.push({ id: `${spec.id}-t${index}`, top, bottom, center: [cx, (top + bottom) / 2] })
        top = bottom
      }
      return finish(
        spec,
        elements,
        { x, y, width: w, height: h, right: x + w, bottom: y + h },
        { tiers: placed }
      )
    },
    /**
     * A matrix cut into tiles (FlashAttention's Q, Kᵀ, V): rows × cols cells, highlighted blocks,
     * dashed block outlines, a name, and loop arrows along its sides ("Outer Loop").
     */
    tiledMatrix(spec) {
      const s = style()
      const parts = drawnParts(spec, s)
      const rows = num(spec.rows, 8)
      const cols = num(spec.cols, 1)
      const [cw, ch] = Array.isArray(spec.cell)
        ? spec.cell
        : [num(spec.cell, 14), num(spec.cell, 14)]
      const x = num(spec.x, 0)
      const y = num(spec.y, 0)
      const role = knownRole(s, spec.role ?? 'd', ['strong'])
      const tones = roleTones(s, role)
      const fill =
        spec.tone === 'fill' ? tones.fill : spec.tone === 'solid' ? tones.solid : tones.strong
      const hot = roleTones(s, knownRole(s, spec.highlightRole ?? 'accent'))
      const lit = new Set()
      for (const block of spec.highlight ?? []) {
        const [r0, r1] = block.rows ?? [block.row ?? 0, block.row ?? 0]
        const [c0, c1] = block.cols ?? [block.col ?? 0, block.col ?? 0]
        for (let r = r0; r <= r1; r += 1) {
          for (let c = c0; c <= c1; c += 1) {
            lit.add(`${r},${c}`)
          }
        }
      }
      const elements = []
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const on = lit.has(`${r},${c}`)
          elements.push(
            parts.rect(`${spec.id}-r${r}c${c}`, x + c * cw, y + r * ch, cw, ch, {
              fill: on ? hot.solid : fill,
              stroke: s.ink,
              width: PAPER_STROKE,
              meaning: on ? 'highlight' : 'tile'
            })
          )
        }
      }
      for (const [index, block] of (spec.blocks ?? []).entries()) {
        const [r0, r1] = block.rows ?? [0, rows - 1]
        const [c0, c1] = block.cols ?? [0, cols - 1]
        elements.push(
          parts.rect(
            `${spec.id}-block${index}`,
            x + c0 * cw - 3,
            y + r0 * ch - 3,
            (c1 - c0 + 1) * cw + 6,
            (r1 - r0 + 1) * ch + 6,
            { stroke: s.line, dashed: true }
          )
        )
      }
      const W = cols * cw
      const H = rows * ch
      if (spec.label) {
        const side = spec.labelSide ?? (cols > rows ? 'left' : 'top')
        const place =
          side === 'left'
            ? { x: x - 5, cy: y + H / 2, align: 'right' }
            : side === 'right'
              ? { x: x + W + 5, cy: y + H / 2 }
              : side === 'bottom'
                ? { cx: x + W / 2, y: y + H + 4 }
                : { cx: x + W / 2, y: 0 }
        const label = parts.words(`${spec.id}-label`, spec.label, place, { size: s.textSize })
        elements.push(
          ...(side === 'top'
            ? shiftAll(label.elements, 0, y - 4 - label.height - label.y)
            : label.elements)
        )
      }
      const box = { x, y, width: W, height: H, right: x + W, bottom: y + H }
      const result = finish(spec, elements, box, { cell: [cw, ch] })
      for (const [index, loop] of (spec.loops ?? []).entries()) {
        const gap = num(loop.gap, 10)
        const loopRole = knownRole(s, loop.role ?? (index ? 'c' : 'a'))
        const color = roleTones(s, loopRole).solid
        const along = {
          top: [
            [x, y - gap],
            [x + W, y - gap]
          ],
          bottom: [
            [x, y + H + gap],
            [x + W, y + H + gap]
          ],
          left: [
            [x - gap, y],
            [x - gap, y + H]
          ],
          right: [
            [x + W + gap, y],
            [x + W + gap, y + H]
          ]
        }[loop.side ?? 'top']
        const [from, to] = loop.reverse ? along.toReversed() : along
        const id = `${spec.id}-loop${index}`
        nested(
          spec.id,
          'arrow',
          { id, from, to, color, strokeWidth: PAPER_STROKE, head: 'triangle' },
          'loop'
        )
        if (loop.label) {
          const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
          const side = loop.side ?? 'top'
          const place =
            side === 'top'
              ? { cx: mid[0], y: 0 }
              : side === 'bottom'
                ? { cx: mid[0], y: mid[1] + 3 }
                : side === 'left'
                  ? { x: mid[0] - 4, cy: mid[1], align: 'right' }
                  : { x: mid[0] + 4, cy: mid[1] }
          const label = parts.words(`${id}-label`, loop.label, place, {
            size: s.smallSize,
            color: roleTones(s, loopRole).ink,
            meaning: 'loop'
          })
          const items =
            side === 'top'
              ? shiftAll(label.elements, 0, mid[1] - 3 - label.height - label.y)
              : label.elements
          core.add(items, `${id}-label`)
          adopt(core, spec.id, [`${id}-label`])
        }
      }
      return result
    },
    /**
     * Curved skip arcs between stacked items (DenseNet's dense connections): every earlier item to
     * every later one (pairs 'dense'), or the given pairs, each arc in its source's colour, bulging
     * to one side.
     */
    skipArcs(spec) {
      const s = style()
      const points = (spec.points ?? spec.between ?? []).map((item) => {
        if (Array.isArray(item)) {
          return item
        }
        const box = core.bounds(item)
        return [box.x + box.width / 2, box.y + box.height / 2]
      })
      if (points.length < 2) {
        throw new Error('skipArcs needs points: two or more [x, y] or ids, in stack order')
      }
      const pairs = Array.isArray(spec.pairs)
        ? spec.pairs
        : spec.pairs === 'next'
          ? points.slice(1).map((_, index) => [index, index + 1])
          : points.flatMap((_, a) =>
              points
                .map((__, b) => [a, b])
                .filter(([i, j]) => j > i + (spec.pairs === 'skip' ? 1 : 0))
            )
      const roles =
        spec.roles ?? points.map((_, index) => DIMENSION_ROLES[index % DIMENSION_ROLES.length])
      const ids = []
      core.add([drawnParts(spec, s).holder(boxOf(points))], spec.id)
      for (const [i, j] of pairs) {
        // Why apart: an arc leaves a stack's centre and lands left of it, so no head sits on
        // the start of the next stack's arcs.
        const [from, to] = [points[i], [points[j][0] - 8 - 2 * i, points[j][1] + 5 + 3 * i]]
        const length = Math.hypot(to[0] - from[0], to[1] - from[1])
        // Why capped: the lowest arc stays on the page, however long the stack.
        const page = core.page()
        const room = page
          ? spec.side === 'above'
            ? Math.min(from[1], to[1]) - page.y - 14
            : page.y + page.height - 14 - Math.max(from[1], to[1])
          : Infinity
        const reach = Math.min(
          Math.max(8, room),
          num(spec.bend, 0.22) * length * (1 + 0.15 * (j - i - 1))
        )
        const bend = (spec.side === 'above' ? 1 : -1) * reach
        const color = roleTones(s, knownRole(s, roles[i] ?? 'accent')).solid
        const id = `${spec.id}-${i}to${j}`
        nested(spec.id, 'curve', {
          id,
          from,
          to,
          bend,
          color,
          strokeWidth: PAPER_STROKE,
          heads: spec.heads ?? 'end'
        })
        for (const element of core.owned(spec.id).filter((item) => item.id.startsWith(id))) {
          const link =
            element.type === 'arrow'
              ? { asterLink: { ...element.customData?.asterLink, skipArcs: true } }
              : {}
          element.customData = { ...element.customData, asterMeaning: 'source', ...link }
        }
        ids.push(id)
      }
      return { id: spec.id, arcs: ids }
    },
    /**
     * Token pills (RT-2): one row of small ovals in groups, each group in its colour (a text
     * prompt, image tokens, action tokens), with short arrows into or out of them and a brace
     * under one group.
     */
    pills(spec) {
      const s = style()
      const parts = drawnParts(spec, s)
      const groups = spec.groups ?? [{ n: num(spec.count, 6), role: spec.role ?? 'accent' }]
      const w = num(spec.w, 18)
      const h = num(spec.h, 8)
      const gap = num(spec.gap, 4)
      const x0 = num(spec.x, 0)
      const y0 = num(spec.y, 0)
      const reach = num(spec.arrowLength, 16)
      const arrowsAbove = spec.arrows === 'down' || spec.arrows === 'both' || spec.arrows === 'into'
      const arrowsBelow = spec.arrows === 'out' || spec.arrows === 'both' || spec.arrows === 'below'
      const top = y0 + (arrowsAbove ? reach + 2 : 0)
      const elements = []
      const cells = []
      let x = x0
      for (const [g, group] of groups.entries()) {
        const role =
          group.role === 'plain' || group.role === 'gray'
            ? 'strong'
            : knownRole(s, group.role ?? 'accent')
        const tones = roleTones(s, role)
        const plain = role === 'strong'
        for (let index = 0; index < num(group.n, 1); index += 1) {
          const id = `${spec.id}-${cells.length}`
          // Why white with a coloured rim, or a tint with a neutral rim: a tint outlined in its own
          // darker hue reads as generated.
          const tint = (group.fill ?? spec.fill) === 'tint'
          const fill = plain ? shade(tones.fill, 0.06) : tint ? tones.fill : '#ffffff'
          const stroke = plain ? s.muted : tint ? s.line : tones.solid
          elements.push(
            parts.oval(id, x + w / 2, top + h / 2, w, h, {
              fill,
              stroke,
              width: PAPER_STROKE,
              meaning: 'token'
            })
          )
          cells.push({ id, x, y: top, w, h, cx: x + w / 2, cy: top + h / 2, group: g })
          x += w + gap
        }
        x += num(spec.groupGap, 0)
      }
      const right = x - gap - num(spec.groupGap, 0)
      const box = { x: x0, y: top, width: right - x0, height: h, right, bottom: top + h }
      const result = finish(spec, elements, box, { cells })
      const arrowColor = spec.arrowColor ? roleTones(s, spec.arrowColor).solid : null
      for (const cell of cells) {
        const color =
          arrowColor ?? roleTones(s, knownRole(s, groups[cell.group].role ?? 'accent')).solid
        if (arrowsAbove) {
          nested(
            spec.id,
            'arrow',
            {
              id: `${cell.id}-in`,
              from: [cell.cx, top - reach - 2],
              to: [cell.cx, top - 1],
              color,
              strokeWidth: PAPER_STROKE,
              head: 'triangle'
            },
            'token'
          )
        }
        if (arrowsBelow) {
          nested(
            spec.id,
            'arrow',
            {
              id: `${cell.id}-out`,
              from: [cell.cx, top + h + 1],
              to: [cell.cx, top + h + reach + 2],
              color,
              strokeWidth: PAPER_STROKE,
              head: 'triangle'
            },
            'token'
          )
        }
      }
      if (spec.brace) {
        const members = cells.filter(
          (cell) => cell.group === num(spec.brace.group, groups.length - 1)
        )
        const brace = `${spec.id}-brace`
        nested(spec.id, 'brace', {
          id: brace,
          around: members.map((cell) => cell.id),
          side: spec.brace.side ?? 'bottom',
          label: spec.brace.label,
          color: spec.brace.color
        })
      }
      return result
    }
  }
}
