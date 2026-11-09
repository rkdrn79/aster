// A small legend for a figure's colour roles or line styles: each item a swatch (a filled box, a
// dot, a line sample or an icon) and a label, in a row or a column. It returns its bounds, so the
// figure can be laid out around it; the lint knows it as a legend the agent meant to draw.
import { makeContainer } from './research-figures-kit-arrow.mjs'
import { figureElement } from './research-figures-model.mjs'
import { makePolyline } from './research-figures-shapes.mjs'
import { measureText } from './research-figures-text.mjs'
import { inkColor, styleColor } from './research-figures-style.mjs'
import { makeText } from './research-figures-type.mjs'
import { oneOf } from './research-figures-options.mjs'

const KINDS = ['box', 'dot', 'line', 'icon']

/** The swatch kind of an item: an icon, a line style, or a filled box by default. */
const kindOf = (item) =>
  oneOf('swatch', item.swatch, KINDS) ??
  (item.icon ? 'icon' : item.dashed || item.dotted || item.line ? 'line' : 'box')

export function legendMethods(core, figure) {
  const { styled } = core
  return {
    /**
     * A legend: `items` of `{ label, color, swatch: 'box' | 'dot' | 'line' | 'icon', dashed,
     * dotted, icon }` in a `direction` row or column; returns its bounds and each item's.
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
      const swatchWidth = (kind) =>
        kind === 'line' ? Math.max(swatchW, 22) : kind === 'box' ? swatchW : swatchH
      // Why one width in a column: the labels then start on one vertical line.
      const column = Math.max(...spec.items.map((item) => swatchWidth(kindOf(item))))
      for (const [index, item] of spec.items.entries()) {
        const kind = kindOf(item)
        const wide = swatchWidth(kind)
        const slot = direction === 'column' ? column : wide
        const label = String(item.label ?? '')
        const textW = measureText(label, size, style.fontFamily).width
        const cy = cursorY + rowH / 2
        const common = { frameId: spec.frame ?? null, customData: { asterLegend: spec.id } }
        const color = item.color ?? 'accent'
        if (kind === 'box' || kind === 'dot') {
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
                dashed: item.dashed,
                dotted: item.dotted,
                strokeWidth: item.strokeWidth,
                frame: spec.frame,
                customData: common.customData
              })
            )
          )
        } else {
          icons.push({ name: item.icon, cx: cursorX + wide / 2, cy, index, color: item.color })
        }
        const [text] = makeText(
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
        text.customData = common.customData
        elements.push(text)
        const width = slot + 6 + textW
        items.push({ id: `${spec.id}-s${index}`, x: cursorX, y: cursorY, width, height: rowH })
        if (direction === 'row') {
          cursorX += width + gap
        } else {
          cursorY += rowH + gap
        }
      }
      const width =
        direction === 'row' ? cursorX - gap - x0 : Math.max(...items.map((item) => item.width))
      const height = direction === 'row' ? rowH : cursorY - gap - y0
      // Why a container with the id: arrows, bounds() and fig.get find the legend as one item.
      const frame = makeContainer(
        { id: spec.id, pad: 0, frame: spec.frame },
        { x: x0, y: y0, width, height }
      )
      frame.customData = { ...frame.customData, asterLegend: spec.id }
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
