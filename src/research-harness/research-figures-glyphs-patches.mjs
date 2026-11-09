// Image patches (masked, predicted) and frames along a time axis, split from
// research-figures-glyphs.mjs to keep files short. Pure: pictures are returned as specs.
import { figureElement } from './research-figures-model.mjs'
import { ARROWHEAD_LENGTH, shapePaint } from './research-figures-draw.mjs'
import { makePolyline } from './research-figures-shapes.mjs'
import { styleColor } from './research-figures-style.mjs'
import { makeMath, styleOf } from './research-figures-type.mjs'
import { castPaint, common, makePicture, outlineBox } from './research-figures-glyphs-picture.mjs'

function maskedCells(spec, rows, cols) {
  const { masked } = spec
  if (Array.isArray(masked)) {
    return new Set(masked.map(([row, col]) => `${row}:${col}`))
  }
  if (masked === 'block') {
    const r0 = Math.floor(rows * 0.25)
    const c0 = Math.floor(cols * 0.25)
    const cells = []
    for (let row = r0; row < r0 + Math.ceil(rows / 2); row += 1) {
      for (let col = c0; col < c0 + Math.ceil(cols / 2); col += 1) {
        cells.push(`${row}:${col}`)
      }
    }
    return new Set(cells)
  }
  if (typeof masked === 'number') {
    const all = []
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        all.push(`${row}:${col}`)
      }
    }
    let state = (spec.seed ?? 1) * 9301 + 49297
    const shuffled = all
      .map((key) => {
        state = (state * 9301 + 49297) % 233280
        return { key, rank: state }
      })
      .toSorted((a, b) => a.rank - b.rank)
    return new Set(shuffled.slice(0, Math.round(all.length * masked)).map((entry) => entry.key))
  }
  return new Set()
}

/**
 * An image (or plain cells without `kind`) cut into `rows` × `cols` patches with white rules;
 * `masked` (a ratio, 'block', or [[row, col]]) greys patches out; with `predicted` the masked
 * patches are the prediction, filled in under the accent's cast. Arrows bind to the id.
 */
export function makePatches(spec, random = Math.random) {
  const style = styleOf(spec)
  const { x = 0, y = 0, rows = 4, cols = 4 } = spec
  const w = spec.w ?? 64
  const h = spec.h ?? 64
  const group = [`${spec.id}-glyph`]
  const elements = []
  const pictures = []
  if (spec.kind) {
    const glyph = makePicture(
      { ...spec, id: `${spec.id}-image`, x, y, w, h, groupIds: group },
      random
    )
    elements.push(...glyph.elements)
    pictures.push(...glyph.pictures)
  }
  const mask = maskedCells(spec, rows, cols)
  const maskFill = spec.maskColor ? styleColor(style, spec.maskColor).fill : style.strong
  // Why: a prediction with masked patches predicts those patches, so they are filled in (the
  // photo under the prediction's cast), not left as holes; without a mask the whole picture is.
  const predicts = Boolean(spec.predicted && mask.size)
  const cast = castPaint(style, spec.tint ?? 'accent')
  const shown = []
  const masked = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const hidden = mask.has(`${row}:${col}`)
      if (!hidden && spec.kind) {
        continue
      }
      const look = !hidden
        ? { backgroundColor: shapePaint(spec).fill }
        : !predicts
          ? { backgroundColor: maskFill }
          : spec.kind
            ? { backgroundColor: cast.color, opacity: cast.opacity }
            : { backgroundColor: styleColor(style, spec.tint ?? 'accent').fill }
      ;(hidden ? masked : shown).push(
        figureElement(
          'rectangle',
          {
            id: `${spec.id}-r${row}c${col}`,
            x: x + (col * w) / cols,
            y: y + (row * h) / rows,
            width: w / cols,
            height: h / rows,
            strokeColor: 'transparent',
            ...look,
            ...common(spec, group)
          },
          random
        )
      )
    }
  }
  elements.push(...shown)
  if ((spec.predicted && !predicts) || spec.wash) {
    elements.push(
      figureElement(
        'rectangle',
        {
          id: `${spec.id}-wash`,
          x,
          y,
          width: w,
          height: h,
          strokeColor: 'transparent',
          backgroundColor: cast.color,
          opacity: cast.opacity,
          ...common(spec, group)
        },
        random
      )
    )
  }
  elements.push(...masked)
  const rule = (id, points) =>
    makePolyline(
      {
        id,
        points,
        stroke: spec.ruleColor ?? '#ffffff',
        strokeWidth: 1.5,
        frame: spec.frame,
        groupIds: [...(spec.groupIds ?? []), ...group]
      },
      random
    )
  for (let row = 1; row < rows; row += 1) {
    elements.push(
      rule(`${spec.id}-h${row}`, [
        [x, y + (row * h) / rows],
        [x + w, y + (row * h) / rows]
      ])
    )
  }
  for (let col = 1; col < cols; col += 1) {
    elements.push(
      rule(`${spec.id}-v${col}`, [
        [x + (col * w) / cols, y],
        [x + (col * w) / cols, y + h]
      ])
    )
  }
  // Why on top: a red outline (compared, highlighted) must not hide under the picture.
  elements.push(outlineBox(spec, x, y, w, h, random, { asterGrid: { rows, cols } }))
  return { elements, pictures }
}

/**
 * `count` frames of a `kind` picture with its subject moving: stacked (`offset` [dx, dy] per
 * frame, the first in front) or in a `row`, over a time axis with a tick per frame (`ticks`:
 * (index) → tex or a list; t_0… by default; `axis: false` hides it) and an optional
 * `axisLabel` at its end. `views` gives each frame its own view; otherwise the view pans across
 * the photo. `mask` ({ masked, rows, cols }) patches every frame the same way (tubes).
 */
export function makeFrames(spec, random = Math.random) {
  const { x = 0, y = 0, count = 4 } = spec
  const w = spec.w ?? 56
  const h = spec.h ?? 42
  // Why positions: frames placed under token columns (one frame per column) line up exactly.
  const positions = spec.positions ?? null
  const row = spec.layout === 'row' || Boolean(positions)
  const [dx, dy] = row ? [w + (spec.gap ?? 6), 0] : (spec.offset ?? [10, -8])
  const frameX = (index) => (positions ? positions[index] : x + dx * index)
  const top = y
  const elements = []
  const pictures = []
  const total = positions ? positions.length : count
  const order = Array.from({ length: total }, (_, index) => (row ? index : total - 1 - index))
  for (const index of order) {
    const fx = frameX(index)
    const fy = y + (row ? 0 : dy * index) - Math.min(0, dy * (total - 1))
    const t = total > 1 ? index / (total - 1) : 0
    // Why a wider pan than image({ t }): frames of a busy photo (the robot) that pan a little
    // look identical at thumbnail size.
    const view = spec.views?.[index] ?? spec.view ?? { x: 0.45 * t, y: 0.04 * t, w: 0.55, h: 0.92 }
    const frame = spec.mask
      ? makePatches(
          {
            ...spec,
            ...spec.mask,
            id: `${spec.id}-f${index}`,
            x: fx,
            y: fy,
            w,
            h,
            t,
            view,
            outline: undefined,
            predicted: false
          },
          random
        )
      : makePicture({ ...spec, id: `${spec.id}-f${index}`, x: fx, y: fy, w, h, t, view }, random)
    elements.push(...frame.elements)
    pictures.push(...frame.pictures)
    elements.push(
      figureElement(
        'rectangle',
        {
          id: `${spec.id}-edge${index}`,
          x: fx,
          y: fy,
          width: w,
          height: h,
          strokeColor: '#ffffff',
          backgroundColor: 'transparent',
          strokeWidth: 1.5,
          ...common(spec, [`${spec.id}-glyph`])
        },
        random
      )
    )
  }
  const left = positions ? Math.min(...positions) : x
  const width = positions ? Math.max(...positions) + w - left : w + Math.abs(dx) * (total - 1)
  const height = h + Math.abs(row ? 0 : dy) * (total - 1)
  if (spec.axis !== false) {
    elements.push(
      ...timeAxis(spec, { left, width, axisY: top + height + 8, total, row, frameX, w }, random)
    )
  }
  elements.unshift(outlineBox({ ...spec, outline: undefined }, left, top, width, height, random))
  return { elements, pictures, width, height }
}

/** The tick label of frame `index`: `ticks` as a function or a list, t_<index> by default. */
function tickTex(spec, index) {
  if (typeof spec.ticks === 'function') {
    return String(spec.ticks(index))
  }
  return String(spec.ticks?.[index] ?? `t_${index}`)
}

/**
 * The time axis under the frames: a tick label per frame, then the arrow run past the last
 * label by a head and a gap, so its head never touches the label (label-on-head).
 */
function timeAxis(spec, { left, width, axisY, total, row, frameX, w }, random) {
  const style = styleOf(spec)
  const size = spec.size ?? style.smallSize
  const group = (elements) => {
    for (const element of elements) {
      element.groupIds = [...element.groupIds, `${spec.id}-glyph`, ...(spec.groupIds ?? [])]
    }
    return elements
  }
  const labels = []
  let reach = left + width
  for (let index = 0; index < total; index += 1) {
    // Why spread over the axis: stacked frames sit closer than their labels are wide.
    const tick = row
      ? frameX(index) + w / 2
      : left + 6 + ((width - 30) * index) / Math.max(1, total - 1)
    const label = makeMath(
      {
        id: `${spec.id}-t${index}`,
        tex: tickTex(spec, index),
        auto: spec.ticks !== undefined,
        size,
        cx: tick,
        y: axisY + 3,
        style: spec.style,
        frame: spec.frame
      },
      random
    )
    labels.push(...group(label.elements))
    if (index === total - 1) {
      // Why: the head (15 units, ARROWHEAD_LENGTH) starts past the last label with room to
      // spare, so the lint's label-on-head never fires on the glyph's own tick.
      reach = Math.max(reach, label.x + label.width + ARROWHEAD_LENGTH.triangle + 8)
    }
  }
  const length = reach - left
  const axis = figureElement(
    'arrow',
    {
      id: `${spec.id}-time`,
      x: left,
      y: axisY,
      width: length,
      height: 0,
      points: [
        [0, 0],
        [length, 0]
      ],
      strokeColor: style.line,
      strokeWidth: 1.5,
      endArrowhead: 'triangle',
      ...common(spec, [`${spec.id}-glyph`])
    },
    random
  )
  const name =
    spec.axisLabel === undefined
      ? []
      : group(
          makeMath(
            {
              id: `${spec.id}-axis-label`,
              tex: String(spec.axisLabel),
              auto: true,
              size,
              x: left + length + 4,
              cy: axisY,
              style: spec.style,
              frame: spec.frame
            },
            random
          ).elements
        )
  return [axis, ...labels, ...name]
}
