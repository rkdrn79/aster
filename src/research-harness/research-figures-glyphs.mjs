// Data glyphs: what a method operates on, drawn instead of a box naming it. Token strips with
// real words and image patches, picture thumbnails, frames along time, masked patch grids,
// feature grids, attention masks, and frozen or trainable badges. Pure: pictures are returned
// as specs (`{ fileId, picture }`) for the kit to encode and embed.
import { figureElement } from './research-figures-model.mjs'
import { makeBox, makeText } from './research-figures-draw.mjs'
import { makeGrid } from './research-figures-shapes.mjs'
import { inkColor, paintValue } from './research-figures-style.mjs'
import {
  hasInlineMath,
  labelLines,
  makeLines,
  makeMath,
  measureLines,
  needsTex,
  styleOf
} from './research-figures-type.mjs'
import { measureText } from './research-figures-text.mjs'
import { castPaint, common, makePicture, outlineBox } from './research-figures-glyphs-picture.mjs'
import { patchPicture } from './research-figures-glyphs-crop.mjs'

export { makePicture }
export { makeFrames, makePatches } from './research-figures-glyphs-patches.mjs'

/**
 * A row of tokens: words (`'cat'`), special tokens (`'<BOI>'`), image patches
 * (`{ image: 'cat', view }`), small grids (`{ grid: { rows, cols, fills }, color }`), empty
 * slots (`{ text: '', dashed: true }`) or styled tokens (`{ text, color }`). `boxed: false` writes bare words. `groups: [{ from, to, color }]` rings a
 * range (an image's patches). Each token's id is `<id>-<index>`, for arrows.
 */
/** A cast of `tint` over a picture (a prediction), like image({ predicted }). */
function washBox(id, box, style, tint, spec, group) {
  const cast = castPaint(style, tint)
  return figureElement('rectangle', {
    id,
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    strokeColor: 'transparent',
    backgroundColor: cast.color,
    opacity: cast.opacity,
    ...common(spec, group)
  })
}

export function makeTokens(spec, random = Math.random) {
  const style = styleOf(spec)
  const size = spec.size ?? style.smallSize
  const h = spec.h ?? Math.round(size * 2)
  const gap = spec.gap ?? 4
  const boxed = spec.boxed !== false
  const x0 = spec.x ?? 0
  const y = spec.y ?? 0
  const group = [`${spec.id}-glyph`]
  const elements = []
  const pictures = []
  const cells = []
  const column = spec.direction === 'column'
  let x = x0
  let down = y
  // Why auto: a caption is TeX (x_1, t = 3) unless it reads as words.
  const caption = (id, tex, cx, top) =>
    makeMath(
      { id, tex: String(tex), auto: true, cx, y: top, size, style: spec.style, group: group[0] },
      random
    ).elements
  for (const [index, item] of (spec.items ?? []).entries()) {
    const token = typeof item === 'string' ? { text: item } : item
    const id = `${spec.id}-${index}`
    // Why per token: an action or pose chip may be shorter than the frame tokens beside it.
    const th = token.h ?? h
    const ty = column ? down : y + (h - th) / 2
    // Why explicit columns: a strip aligned with another strip's tokens (fig.tokens columnsOf).
    const place = (w) =>
      spec.centers?.[index] !== undefined
        ? spec.centers[index] - w / 2
        : (spec.positions?.[index] ?? (column ? x0 : x))
    if (token.grid) {
      // Why a grid token: a frame's patch latents beside an action token, in one strip.
      const rows = token.grid.rows ?? 2
      const cols = token.grid.cols ?? 2
      // Why w splits into columns: a token as wide as the frame tokens beside it fills them.
      const cellH = th / rows
      const w = token.w ?? spec.widths?.[index] ?? cellH * cols
      const cellW = token.w === undefined && spec.widths?.[index] === undefined ? cellH : w / cols
      x = place(w)
      elements.push(
        ...makeGrid(
          {
            ...token.grid,
            id,
            x,
            y: ty,
            rows,
            cols,
            cell: [cellW, cellH],
            color: token.color ?? spec.color ?? 'accent',
            strokeWidth: 1.5,
            style: spec.style,
            frame: spec.frame,
            groupIds: group
          },
          random
        )
      )
      if (token.caption !== undefined) {
        elements.push(...caption(`${id}-caption`, token.caption, x + w / 2, ty + th + 3))
      }
      cells.push({ id, x, y: ty, w, h: th })
      x += w + gap
      down = ty + th + gap
      continue
    }
    if (token.image || token.noise !== undefined || (token.patch && token.of)) {
      const w = token.w ?? spec.widths?.[index] ?? th
      x = place(w)
      // Why: a patch cut from a patches() grid shows the same crop as that grid's cell.
      const cut = token.patch && token.of ? patchPicture(token.of, token.patch) : {}
      const kind = cut.kind ?? token.image
      const noiseOnly = !kind
      // Why the colour: an accent noise cell is the prediction's noise; on a photo it tints
      // the noise laid over it, or washes a plain photo.
      const tint = token.tint ?? token.color ?? (noiseOnly ? spec.tint : undefined)
      const glyph = makePicture(
        {
          ...token,
          ...cut,
          id,
          kind: kind ?? 'noise',
          tint,
          // Why noise as intensity: a noise cell has no picture to blend, so 0.4 is fainter noise.
          intensity:
            token.intensity ??
            (noiseOnly && typeof token.noise === 'number' ? token.noise : undefined),
          x,
          y: ty,
          w,
          h: th,
          style: spec.style,
          frame: spec.frame,
          groupIds: group
        },
        random
      )
      elements.push(...glyph.elements)
      pictures.push(...glyph.pictures)
      if (tint && !noiseOnly && !token.noise) {
        elements.push(washBox(`${id}-tint`, { x, y: ty, w, h: th }, style, tint, spec, group))
      }
      // Why an edge: Excalidraw draws no outline on an image, so a stroke gets its own box.
      if (token.stroke || spec.stroke) {
        elements.push(
          figureElement(
            'rectangle',
            {
              id: `${id}-edge`,
              x,
              y: ty,
              width: w,
              height: th,
              strokeColor: paintValue(style, token.stroke ?? spec.stroke, 'ink'),
              backgroundColor: 'transparent',
              strokeWidth: 1.5,
              ...common(spec, group)
            },
            random
          )
        )
      }
      if (token.caption !== undefined) {
        elements.push(...caption(`${id}-caption`, token.caption, x + w / 2, ty + th + 3))
      }
      cells.push({ id, x, y: ty, w, h: th })
      x += w + gap
      down = ty + th + gap
      continue
    }
    const text = token.text ?? ''
    const label = token.tex !== undefined ? [{ tex: token.tex }] : text
    // Why lines for $…$: "score $r_t$" is words and math, not its source characters.
    const natural =
      token.tex !== undefined
        ? makeMath({ id, tex: token.tex, size, style: spec.style }).width
        : hasInlineMath(text) || needsTex(text, style)
          ? measureLines(labelLines(text, size, undefined, style), size, style).width
          : measureText(text, size, style.fontFamily).width
    const needed = Math.max(th * 0.8, Math.ceil(natural + 12))
    // Why the column's width: a strip under another keeps its cells as wide as the ones above,
    // empty cells too.
    const w = token.w ?? Math.max(spec.widths?.[index] ?? 0, needed)
    x = place(w)
    if (!boxed && (text || token.tex !== undefined)) {
      const common = { id, size, color: token.color, style: spec.style, frame: spec.frame }
      elements.push(
        ...(token.tex !== undefined
          ? makeMath(
              { ...common, tex: token.tex, cx: x + w / 2, cy: ty + th / 2, group: group[0] },
              random
            ).elements
          : makeText({ ...common, text, cx: x + w / 2, cy: ty + th / 2, groupIds: group }, random))
      )
    } else {
      const slot = token.dashed && !token.color
      elements.push(
        ...makeBox(
          {
            id,
            label,
            x,
            y: ty,
            w,
            h: th,
            exact: true,
            size,
            color: slot
              ? 'none'
              : (token.color ??
                spec.color ??
                (style.boxStroke === 'transparent' ? 'block' : 'white')),
            stroke: token.stroke ?? spec.stroke ?? (slot ? style.muted : undefined),
            dashed: token.dashed,
            labelColor: token.labelColor,
            style: spec.style,
            rounded: spec.rounded ?? 2,
            frame: spec.frame,
            groupIds: group
          },
          random
        )
      )
    }
    cells.push({ id, x, y: ty, w, h: th })
    x += w + gap
    down = ty + th + gap
  }
  // Why not x0 for placed tokens: a strip with positions (and no x) starts at its first token.
  const placed = (spec.centers || (spec.positions && spec.x === undefined)) && cells.length
  const start = placed ? Math.min(...cells.map((cell) => cell.x)) : x0
  if (spec.label && (spec.labelSide ?? 'left') === 'left') {
    // Why left of the strip: a row's name ("frame tokens") reads before the row, like an axis.
    const name = {
      id: `${spec.id}-name`,
      size,
      x: start - 8,
      align: 'right',
      cy: y + h / 2,
      // Why ink: a muted name was too faint at print beside ink labels elsewhere.
      color: spec.labelColor ?? 'ink',
      style: spec.style,
      frame: spec.frame
    }
    const mixed =
      Array.isArray(spec.label) || hasInlineMath(spec.label) || needsTex(spec.label, style)
    elements.push(
      ...(mixed
        ? makeLines(
            { ...name, group: group[0] },
            labelLines(spec.label, size, undefined, style),
            random
          ).elements
        : makeText({ ...name, text: spec.label, groupIds: group }, random))
    )
  }
  for (const [index, ring] of (spec.groups ?? []).entries()) {
    const span = cells.slice(ring.from, (ring.to ?? ring.from) + 1)
    if (!span.length) {
      continue
    }
    const left = span[0].x - 3
    const right = span.at(-1).x + span.at(-1).w + 3
    elements.push(
      figureElement(
        'rectangle',
        {
          id: `${spec.id}-ring${index + 1}`,
          x: left,
          y: y - 3,
          width: right - left,
          height: h + 6,
          strokeColor: inkColor(style, ring.color ?? 'accent'),
          backgroundColor: 'transparent',
          strokeWidth: 2,
          ...(ring.color === 'loss' ? { customData: { asterRole: 'compared' } } : {}),
          ...common(spec, group)
        },
        random
      )
    )
  }
  if (spec.centers || spec.positions) {
    // Why throw: a token wider than its column used to overlap its neighbour silently.
    const sorted = cells.toSorted((a, b) => a.x - b.x)
    for (const [index, cell] of sorted.slice(1).entries()) {
      const before = sorted[index]
      if (!column && before.x + before.w > cell.x + 0.5) {
        const [wide, other] = before.w >= cell.w ? [before, cell] : [cell, before]
        const apart = Math.round(cell.x + cell.w / 2 - (before.x + before.w / 2))
        throw new Error(
          `tokens ${spec.id}: ${wide.id} is ${Math.round(wide.w)} wide and runs into ${other.id}, whose centre is ${apart} away. Shorten its text, give a smaller size, or space the columns wider`
        )
      }
    }
  }
  const left = Math.min(start, ...cells.map((cell) => cell.x))
  const width = Math.max(0, ...cells.map((cell) => cell.x + cell.w)) - left
  const height = column ? Math.max(0, down - gap - y) : h
  // Why after: cx or align: 'right' moves the finished strip as a whole; a strip on another's
  // columns stays on them.
  const shift = spec.centers
    ? 0
    : spec.cx !== undefined
      ? spec.cx - (left + width / 2)
      : spec.align === 'right'
        ? x0 - (left + width)
        : spec.align === 'center'
          ? x0 - (left + width / 2)
          : 0
  if (shift) {
    for (const element of elements) {
      element.x += shift
    }
    for (const cell of cells) {
      cell.x += shift
    }
  }
  elements.unshift(
    outlineBox({ ...spec, outline: undefined }, left + shift, y, width, height, random)
  )
  return { elements, pictures, cells, width, height }
}
