// A small legend for a figure's colour roles or line styles: each item a swatch (a filled box, a
// dot, a line sample or an icon) and a label, in a row or a column. It returns its bounds, so the
// figure can be laid out around it; the lint knows it as a legend the agent meant to draw.
import { makeContainer } from './research-figures-kit-arrow.mjs'
import { makeOpNode, makeSwitch } from './research-figures-kit-ops.mjs'
import { makeArrow, makeLines } from './research-figures-draw.mjs'
import { flowLabel, inkBox } from './research-figures-labels.mjs'
import { figureElement } from './research-figures-model.mjs'
import { makePolyline } from './research-figures-shapes.mjs'
import { measureText } from './research-figures-text.mjs'
import { ARROW_ROLES, inkColor, styleColor } from './research-figures-style.mjs'
import { labelLines, makeText } from './research-figures-type.mjs'
import { oneOf } from './research-figures-options.mjs'

const KINDS = ['box', 'dot', 'line', 'arrow', 'icon', 'switch', 'node']

/**
 * Arrow roles that are no box colour: named as a colour (`color: 'cond'`) the legend draws that
 * arrow. good, bad, data and loss are box colours too, so they stay boxes unless given as role.
 */
const ARROW_ONLY = new Set(['main', 'side', 'aux', 'cond', 'grad', 'feedback', 'skip'])

/** An arrow role given as `role`, or an arrow-only role named as the colour. */
const roleOf = (item) => item.role ?? (ARROW_ONLY.has(item.color ?? '') ? item.color : null)

/** The swatch kind of an item: an arrow role, an icon, a line style, or a filled box by default. */
const kindOf = (item) =>
  oneOf('swatch', item.swatch, KINDS) ??
  (roleOf(item)
    ? 'arrow'
    : item.icon
      ? 'icon'
      : item.symbol
        ? 'node'
        : item.dashed || item.dotted || item.line
          ? 'line'
          : 'box')

export function legendMethods(core, figure) {
  const { styled } = core
  return {
    /**
     * A legend: `items` of `{ label, color, swatch: 'box' | 'dot' | 'line' | 'arrow' | 'icon' |
     * 'switch' | 'node', role, symbol, dashed, dotted, icon }` in a `direction` row or column;
     * `role` (or an arrow role as colour: cond, grad, skip…) draws that arrow. Returns its
     * bounds and each item's.
     */
    legend(spec) {
      if (!spec?.id || !Array.isArray(spec.items) || !spec.items.length) {
        throw new Error('legend({ id, x, y, items: [{ label, color }] }) needs an id and items')
      }
      const style = styled({}).style
      const direction = oneOf('direction', spec.direction, ['row', 'column']) ?? 'row'
      const size = spec.size ?? style.smallSize
      const swatchW = spec.swatchWidth ?? 16
      const swatchH = spec.swatchHeight ?? 10
      const gap = spec.gap ?? (direction === 'row' ? 16 : 6)
      const rowH = Math.max(swatchH, size * 1.25)
      const x0 = spec.x ?? 0
      const y0 = spec.y ?? 0
      const elements = []
      const icons = []
      const items = []
      let cursorX = x0
      let cursorY = y0
      let right = x0
      // Why wrap: a row of five keys outgrew a single-column page; it breaks onto more rows at
      // maxWidth (default: up to the page's right margin), never past the page.
      const page = core.page?.() ?? null
      const maxWidth =
        spec.maxWidth ??
        (page ? Math.max(80, page.x + page.width - 12 - x0) : Number.POSITIVE_INFINITY)
      const swatchWidth = (kind) =>
        kind === 'line' || kind === 'arrow'
          ? Math.max(swatchW, 24)
          : kind === 'switch'
            ? 20
            : kind === 'node'
              ? 14
              : kind === 'box'
                ? swatchW
                : swatchH
      // Why one width in a column: the labels then start on one vertical line.
      const column = Math.max(...spec.items.map((item) => swatchWidth(kindOf(item))))
      for (const [index, item] of spec.items.entries()) {
        const kind = kindOf(item)
        const wide = swatchWidth(kind)
        const slot = direction === 'column' ? column : wide
        const label = String(item.label ?? '')
        // Why typeset: a key such as 'relative pose $(R_i, T_i)$' mixes words and math; plain
        // text printed the TeX source (round 14: a hand-made legend instead).
        const mixed = /[$\\_^]/.test(label)
        const labelOf = (where) =>
          makeLines(
            styled({
              id: `${spec.id}-t${index}`,
              size,
              color: item.labelColor ?? 'ink',
              frame: spec.frame,
              ...where
            }),
            labelLines(flowLabel(label), size, undefined, style)
          ).elements
        const ink = mixed ? inkBox(labelOf({ x: 0, y: 0 })) : null
        const textW = ink ? ink.width : measureText(label, size, style.fontFamily).width
        if (direction === 'row' && cursorX > x0 && cursorX + slot + 6 + textW > x0 + maxWidth) {
          cursorX = x0
          cursorY += rowH + 6
        }
        const cy = cursorY + rowH / 2
        const common = { frameId: spec.frame ?? null, customData: { asterLegend: spec.id } }
        const role = roleOf(item)
        const roles = style.arrowRoles ?? ARROW_ROLES
        // Why the role's colour: a box or line keyed to an arrow role takes that arrow's hue.
        const color = role
          ? item.role
            ? (item.color ?? roles[role].color)
            : roles[role].color
          : (item.color ?? 'accent')
        const mark = (parts) => {
          for (const part of parts) {
            part.customData = { ...part.customData, asterLegend: spec.id }
            part.frameId = spec.frame ?? null
          }
          elements.push(...parts)
        }
        if (kind === 'arrow') {
          const look = roles[role ?? 'data']
          mark([
            makeArrow(
              styled({
                id: `${spec.id}-s${index}`,
                points: [
                  [cursorX, cy],
                  [cursorX + wide, cy]
                ],
                role: role ?? 'data',
                ...(item.color && item.role ? { color: item.color } : {}),
                dashed: item.dashed ?? look.dashed,
                headSize: 6
              }),
              () => null
            )
          ])
        } else if (kind === 'switch') {
          mark(
            makeSwitch(
              styled({ id: `${spec.id}-s${index}`, x: cursorX, y: cy - 7, w: wide, h: 14, r: 2 })
            )
          )
        } else if (kind === 'node') {
          mark(
            makeOpNode(
              styled({ id: `${spec.id}-s${index}`, cx: cursorX + 7, cy, r: 7, symbol: item.symbol })
            )
          )
        } else if (kind === 'box' || kind === 'dot') {
          const paint = styleColor(style, color)
          elements.push(
            figureElement(kind === 'box' ? 'rectangle' : 'ellipse', {
              id: `${spec.id}-s${index}`,
              x: cursorX,
              y: cy - swatchH / 2,
              width: wide,
              height: swatchH,
              strokeColor: item.stroke ? inkColor(style, item.stroke) : paint.stroke,
              backgroundColor: paint.fill,
              strokeWidth: 1,
              roundness: kind === 'box' && style.radius > 0 ? { type: 3, value: 2 } : null,
              ...common
            })
          )
        } else if (kind === 'line') {
          elements.push(
            makePolyline(
              styled({
                id: `${spec.id}-s${index}`,
                points: [
                  [cursorX, cy],
                  [cursorX + wide, cy]
                ],
                color,
                dashed: item.dashed ?? (role ? roles[role].dashed : undefined),
                dotted: item.dotted,
                strokeWidth: item.strokeWidth ?? (role ? roles[role].strokeWidth : undefined),
                frame: spec.frame,
                customData: common.customData
              })
            )
          )
        } else {
          icons.push({ name: item.icon, cx: cursorX + wide / 2, cy, index, color: item.color })
        }
        const texts = ink
          ? labelOf({ x: cursorX + slot + 6 - ink.x, y: cy - ink.height / 2 - ink.y })
          : makeText(
              styled({
                id: `${spec.id}-t${index}`,
                text: label,
                size,
                color: item.labelColor ?? 'ink',
                x: cursorX + slot + 6,
                cy,
                frame: spec.frame
              })
            )
        for (const text of texts) {
          text.customData = { ...text.customData, ...common.customData }
        }
        elements.push(...texts)
        const width = slot + 6 + textW
        items.push({ id: `${spec.id}-s${index}`, x: cursorX, y: cursorY, width, height: rowH })
        right = Math.max(right, cursorX + width)
        if (direction === 'row') {
          cursorX += width + gap
        } else {
          cursorY += rowH + gap
        }
      }
      const width = direction === 'row' ? right - x0 : Math.max(...items.map((item) => item.width))
      const height = direction === 'row' ? cursorY - y0 + rowH : cursorY - gap - y0
      // Why a container with the id: arrows, bounds() and fig.get find the legend as one item.
      const frame = makeContainer(
        { id: spec.id, pad: 0, frame: spec.frame },
        { x: x0, y: y0, width, height }
      )
      frame.customData = {
        ...frame.customData,
        asterLegend: spec.id,
        ...(spec.asked ? { asterLegendAsked: true } : {})
      }
      core.claim(spec.id, [frame, ...elements])
      core.insert([frame, ...elements])
      for (const icon of icons) {
        figure().icon(icon.name, {
          id: `${spec.id}-i${icon.index}`,
          cx: icon.cx,
          cy: icon.cy,
          size: swatchH + 4,
          color: icon.color
        })
      }
      return {
        id: spec.id,
        x: x0,
        y: y0,
        width,
        height,
        right: x0 + width,
        bottom: y0 + height,
        items
      }
    }
  }
}
