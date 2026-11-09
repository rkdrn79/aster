// Shapes that recur in ML figures and Excalidraw lacks: trapezoids, half-rounded blocks, token
// grids, card stacks, ⊕/⊗ nodes, stop-grad marks and photo placeholders. Pure, like the draw module.
import { figureElement } from './research-figures-model.mjs'
import { makeBox, makeText, shapePaint } from './research-figures-draw.mjs'
import { FIGURE_LINE_WIDTH, inkColor, paintValue } from './research-figures-style.mjs'
import { styleOf } from './research-figures-type.mjs'

const ARC_STEPS = 10

function common(spec) {
  return { frameId: spec.frame ?? null, groupIds: [...(spec.groupIds ?? []), `${spec.id}-shape`] }
}

/**
 * A `line` through absolute points: open, or `closed` (Excalidraw fills a line whose ends meet)
 * with `fill`. Lines cannot take arrow bindings.
 */
export function makePolyline(spec, random = Math.random) {
  const corners = spec.points
  const [x0, y0] = corners[0]
  const path = spec.closed ? [...corners, corners[0]] : corners
  const points = path.map(([px, py]) => [px - x0, py - y0])
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  const style = styleOf(spec)
  return figureElement(
    'line',
    {
      id: spec.id,
      x: x0,
      y: y0,
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      points,
      strokeColor: paintValue(style, spec.stroke, 'ink') ?? inkColor(style, spec.color, 'line'),
      backgroundColor: spec.closed
        ? (paintValue(style, spec.fill, 'fill') ?? inkColor(style, spec.color, 'line'))
        : 'transparent',
      strokeWidth: spec.strokeWidth ?? FIGURE_LINE_WIDTH,
      strokeStyle: spec.dashed ? 'dashed' : spec.dotted ? 'dotted' : 'solid',
      endArrowhead: null,
      // Why: a closed shape over a photo (a region, a mask) shows the photo through it.
      ...(spec.opacity !== undefined ? { opacity: spec.opacity } : {}),
      frameId: spec.frame ?? null,
      groupIds: spec.groupIds ?? [],
      ...(spec.customData ? { customData: spec.customData } : {})
    },
    random
  )
}

/** A filled dot (e.g. a time step on a timeline); binds arrows like any ellipse. */
export function makeDot(spec, random = Math.random) {
  const r = spec.r ?? 3
  const style = styleOf(spec)
  const ink = inkColor(style, spec.color, 'line')
  return [
    figureElement(
      'ellipse',
      {
        id: spec.id,
        x: (spec.cx ?? 0) - r,
        y: (spec.cy ?? 0) - r,
        width: r * 2,
        height: r * 2,
        // Why a rim: a dot on a photo (a prompt point) needs a white edge to show.
        strokeColor: paintValue(style, spec.stroke, 'ink') ?? ink,
        ...(spec.stroke ? { strokeWidth: 1.5 } : {}),
        backgroundColor: ink,
        boundElements: [],
        frameId: spec.frame ?? null,
        groupIds: spec.groupIds ?? []
      },
      random
    )
  ]
}

function makePolygon(spec, corners, random) {
  const paint = shapePaint(spec)
  return makePolyline(
    {
      ...spec,
      id: `${spec.id}-outline`,
      points: corners,
      closed: true,
      stroke: paint.stroke,
      fill: paint.fill,
      groupIds: common(spec).groupIds
    },
    random
  )
}

/**
 * The drawn outline plus an invisible box of the same bounds that carries the label and takes
 * arrow bindings (lines cannot), under the given id. Label options are the box's.
 */
function outlinedBox(spec, corners, random) {
  const xs = corners.map((corner) => corner[0])
  const ys = corners.map((corner) => corner[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const parts = makeBox(
    {
      ...spec,
      x,
      y,
      w: Math.max(...xs) - x,
      h: Math.max(...ys) - y,
      exact: true,
      stroke: 'transparent',
      fill: 'transparent',
      rounded: false,
      groupIds: common(spec).groupIds
    },
    random
  )
  return [makePolygon(spec, corners, random), ...parts]
}

/**
 * `narrow`: the short side (top, bottom, left, right); `ratio`: its length over the long side.
 * `corners` (four absolute points, clockwise) draws a lopsided one instead.
 */
export function makeTrapezoid(spec, random = Math.random) {
  if (spec.corners) {
    return outlinedBox(spec, spec.corners, random)
  }
  const { x = 0, y = 0, w = 160, h = 48 } = spec
  const ratio = spec.ratio ?? 0.6
  const narrow = spec.narrow ?? spec.side ?? 'top'
  const inset = ((narrow === 'top' || narrow === 'bottom' ? w : h) * (1 - ratio)) / 2
  const corners = {
    top: [
      [x + inset, y],
      [x + w - inset, y],
      [x + w, y + h],
      [x, y + h]
    ],
    bottom: [
      [x, y],
      [x + w, y],
      [x + w - inset, y + h],
      [x + inset, y + h]
    ],
    left: [
      [x, y + inset],
      [x + w, y],
      [x + w, y + h],
      [x, y + h - inset]
    ],
    right: [
      [x, y],
      [x + w, y + inset],
      [x + w, y + h - inset],
      [x, y + h]
    ]
  }[narrow]
  if (!corners) {
    throw new Error('narrow is top, bottom, left or right')
  }
  return outlinedBox({ ...spec, x, y, w, h }, corners, random)
}

function arc(cx, cy, radius, from, to) {
  return Array.from({ length: ARC_STEPS + 1 }, (_, index) => {
    const angle = from + ((to - from) * index) / ARC_STEPS
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]
  })
}

/** A block with one rounded end (`side`), like an encoder drawn as an arch or a D. */
export function makeRoundedEnd(spec, random = Math.random) {
  const { x = 0, y = 0, w = 120, h = 96 } = spec
  const side = spec.side ?? 'top'
  const across = side === 'top' || side === 'bottom' ? w : h
  const along = side === 'top' || side === 'bottom' ? h : w
  const r = Math.min(spec.radius ?? across / 2, across / 2, along)
  const pi = Math.PI
  const corners = {
    top: [
      [x, y + h],
      ...arc(x + r, y + r, r, pi, 1.5 * pi),
      ...arc(x + w - r, y + r, r, 1.5 * pi, 2 * pi),
      [x + w, y + h]
    ],
    bottom: [
      [x, y],
      [x + w, y],
      ...arc(x + w - r, y + h - r, r, 0, 0.5 * pi),
      ...arc(x + r, y + h - r, r, 0.5 * pi, pi)
    ],
    left: [
      [x + w, y],
      [x + w, y + h],
      ...arc(x + r, y + h - r, r, 0.5 * pi, pi),
      ...arc(x + r, y + r, r, pi, 1.5 * pi)
    ],
    right: [
      [x, y],
      ...arc(x + w - r, y + r, r, 1.5 * pi, 2 * pi),
      ...arc(x + w - r, y + h - r, r, 0, 0.5 * pi),
      [x, y + h]
    ]
  }[side]
  if (!corners) {
    throw new Error('side is top, bottom, left or right')
  }
  return outlinedBox({ ...spec, x, y, w, h }, corners, random)
}

/** A gray that parts white cells: strong, or mid where strong is near white. */
function separator(style) {
  const light = Number.parseInt(String(style.strong).slice(1, 3), 16) > 0xdc
  return light ? (style.mid ?? style.strong) : style.strong
}

/**
 * `rows` × `cols` cells of `cell` units (one side or [w, h]; `gap` apart); `fills` may give a
 * colour per [row][col] (null or 'none' leaves the cell out), `omit` leaves cells out too
 * ((row, col) → true, or [[row, col]]: a causal triangle), `cellStroke` the cell borders and
 * `cellStrokes` ((row, col) → colour, or [[colour]]) one cell's; white cells part in gray. `rules: true` draws
 * one filled block with only the inner rules (in `cellStroke`, default white), `'vertical'` or
 * `'horizontal'` only those; `outline: false` hides the block's border, `true` or a colour shows
 * it in every style. Arrows bind to the outline (the id).
 */
export function makeGrid(spec, random = Math.random) {
  const { x = 0, y = 0, rows = 3, cols = 3, gap = 0 } = spec
  const [cellW, cellH] = Array.isArray(spec.cell) ? spec.cell : [spec.cell ?? 16, spec.cell ?? 16]
  const style = styleOf(spec)
  const paint = shapePaint(spec)
  // Why white by default: gray cells without outlines read as one block unless rules part them.
  const cellStroke =
    paintValue(style, spec.cellStroke, 'ink') ??
    (style.boxStroke === 'transparent' ? '#ffffff' : style.boxStroke)
  const width = cols * cellW + (cols - 1) * gap
  const height = rows * cellH + (rows - 1) * gap
  const strokeWidth = spec.strokeWidth ?? FIGURE_LINE_WIDTH
  const omitted = new Set(
    Array.isArray(spec.omit) ? spec.omit.map(([row, col]) => `${row}:${col}`) : []
  )
  const left = (row, col) =>
    (typeof spec.omit === 'function' && spec.omit(row, col)) ||
    omitted.has(`${row}:${col}`) ||
    spec.fills?.[row]?.[col] === null ||
    spec.fills?.[row]?.[col] === 'none'
  // Why the line ink for `true`: boxes have no outline in graphite, so its stroke is none.
  const edge =
    spec.outline === false
      ? 'transparent'
      : typeof spec.outline === 'string'
        ? inkColor(style, spec.outline)
        : spec.outline === true && paint.stroke === 'transparent'
          ? style.line
          : paint.stroke
  const outline = figureElement(
    'rectangle',
    {
      id: spec.id,
      x,
      y,
      width,
      height,
      // Why none around a triangle: a box drawn round the cells left out reads as more cells.
      strokeColor:
        (spec.omit || spec.fills?.flat().some((fill) => fill === null || fill === 'none')) &&
        spec.outline === undefined
          ? 'transparent'
          : edge,
      backgroundColor: spec.rules ? paint.fill : 'transparent',
      strokeWidth,
      boundElements: [],
      // Why: highlight() finds a cell of the grid from its outline.
      customData: { asterGrid: { rows, cols, cell: spec.cell ?? 16, gap } },
      ...common(spec)
    },
    random
  )
  const inner = []
  if (spec.rules) {
    const rule = (id, points) =>
      makePolyline(
        {
          id,
          points,
          stroke: cellStroke,
          strokeWidth,
          frame: spec.frame,
          groupIds: common(spec).groupIds
        },
        random
      )
    // Why: inset by half a stroke so a white rule does not notch the block's border.
    const inset = spec.outline === false ? 0 : strokeWidth / 2
    for (let row = 1; row < rows && spec.rules !== 'vertical'; row += 1) {
      inner.push(
        rule(`${spec.id}-h${row}`, [
          [x + inset, y + row * cellH],
          [x + width - inset, y + row * cellH]
        ])
      )
    }
    for (let col = 1; col < cols && spec.rules !== 'horizontal'; col += 1) {
      inner.push(
        rule(`${spec.id}-v${col}`, [
          [x + col * cellW, y + inset],
          [x + col * cellW, y + height - inset]
        ])
      )
    }
    return [outline, ...inner]
  }
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (left(row, col)) {
        continue
      }
      const fill = paintValue(style, spec.fills?.[row]?.[col], 'fill') ?? paint.fill
      const own =
        typeof spec.cellStrokes === 'function'
          ? spec.cellStrokes(row, col)
          : spec.cellStrokes?.[row]?.[col]
      // Why gray between white cells: white rules on white cells leave no grid at all.
      const blank =
        spec.cellStroke === undefined &&
        /^#f{3}(?:f{3})?$/i.test(fill) &&
        /^#f{3}(?:f{3})?$/i.test(cellStroke)
      inner.push(
        figureElement(
          'rectangle',
          {
            id: `${spec.id}-r${row}c${col}`,
            x: x + col * (cellW + gap),
            y: y + row * (cellH + gap),
            width: cellW,
            height: cellH,
            strokeColor: paintValue(style, own, 'ink') ?? (blank ? separator(style) : cellStroke),
            backgroundColor: fill,
            strokeWidth,
            ...common(spec)
          },
          random
        )
      )
    }
  }
  return [...inner, outline]
}

/** Whether a fill is white or nearly (#ececec and lighter): white edges vanish on it. */
const pale = (hex) =>
  /^#[0-9a-f]{6}$/i.test(String(hex)) &&
  [1, 3, 5].every((index) => Number.parseInt(String(hex).slice(index, index + 2), 16) >= 0xe6)

/**
 * `count` cards offset by `offset` up and to the right, front card last, all inside `w` × `h`
 * (the stack's whole footprint); binds to the id. `label` is a caption under the stack.
 */
export function makeStack(spec, random = Math.random) {
  const { x = 0, y = 0, w = 48, h = 64, count = 3, offset = 6 } = spec
  const style = styleOf(spec)
  const paint = shapePaint(spec)
  // Why gray on a pale stack: white edges between white cards (on a white or tinted card)
  // leave one blank shape, so the cards need a visible edge to read as a stack.
  const edge =
    paintValue(style, spec.stroke, 'ink') ??
    (style.boxStroke !== 'transparent'
      ? style.boxStroke
      : pale(paint.fill)
        ? (style.mid ?? style.muted)
        : '#ffffff')
  const span = offset * (count - 1)
  // Why inside w × h: a stack sized to a slot must not spill into its neighbour.
  const cardW = Math.max(4, w - span)
  const cardH = Math.max(4, h - span)
  const cards = Array.from({ length: count }, (_, index) => {
    const back = count - 1 - index
    return figureElement(
      'rectangle',
      {
        id: `${spec.id}-card${index + 1}`,
        x: x + offset * back,
        y: y + span - offset * back,
        width: cardW,
        height: cardH,
        strokeColor: edge,
        backgroundColor: paint.fill,
        strokeWidth: 1.5,
        roundness: spec.rounded ? { type: 3, value: spec.rounded } : null,
        ...common(spec)
      },
      random
    )
  })
  const outline = figureElement(
    'rectangle',
    {
      id: spec.id,
      x,
      y,
      width: cardW + span,
      height: cardH + span,
      strokeColor: 'transparent',
      backgroundColor: 'transparent',
      boundElements: [],
      ...common(spec)
    },
    random
  )
  const caption = spec.label
    ? makeText(
        {
          id: `${spec.id}-label`,
          text: spec.label,
          size: spec.size,
          color: spec.labelColor,
          cx: x + (cardW + span) / 2,
          y: y + cardH + span + 4,
          frame: spec.frame,
          groupIds: common(spec).groupIds
        },
        random
      )
    : []
  return [...cards, outline, ...caption]
}

/** A circle with + (⊕), × (⊗) or a dot, drawn as lines since the paper font lacks ⊕ and ⊗. */
export function makeNode(spec, random = Math.random) {
  const r = spec.r ?? 9
  const cx = spec.cx ?? (spec.x ?? 0) + r
  const cy = spec.cy ?? (spec.y ?? 0) + r
  const style = styleOf(spec)
  const ink = paintValue(style, spec.stroke, 'ink') ?? inkColor(style, spec.color, 'line')
  const circle = figureElement(
    'ellipse',
    {
      id: spec.id,
      x: cx - r,
      y: cy - r,
      width: r * 2,
      height: r * 2,
      strokeColor: ink,
      backgroundColor: paintValue(style, spec.fill, 'fill') ?? '#ffffff',
      strokeWidth: FIGURE_LINE_WIDTH,
      boundElements: [],
      ...common(spec)
    },
    random
  )
  const arm = spec.symbol === 'times' ? r * 0.46 : r * 0.65
  const strokes =
    spec.symbol === 'dot'
      ? []
      : spec.symbol === 'times'
        ? [
            [
              [-arm, -arm],
              [arm, arm]
            ],
            [
              [-arm, arm],
              [arm, -arm]
            ]
          ]
        : [
            [
              [-arm, 0],
              [arm, 0]
            ],
            [
              [0, -arm],
              [0, arm]
            ]
          ]
  const lines = strokes.map(([[ax, ay], [bx, by]], index) =>
    figureElement(
      'line',
      {
        id: `${spec.id}-stroke${index + 1}`,
        x: cx + ax,
        y: cy + ay,
        width: Math.abs(bx - ax),
        height: Math.abs(by - ay),
        points: [
          [0, 0],
          [bx - ax, by - ay]
        ],
        strokeColor: ink,
        endArrowhead: null,
        ...common(spec)
      },
      random
    )
  )
  const dot =
    spec.symbol === 'dot'
      ? [
          figureElement(
            'ellipse',
            {
              id: `${spec.id}-dot`,
              x: cx - r / 3,
              y: cy - r / 3,
              width: (r * 2) / 3,
              height: (r * 2) / 3,
              strokeColor: ink,
              backgroundColor: ink,
              ...common(spec)
            },
            random
          )
        ]
      : []
  return [circle, ...lines, ...dot]
}

/** A photo or video frame: a crop of an embedded image (`fileId` + `crop`), else a placeholder. */
export function makePhoto(spec, random = Math.random) {
  const { x = 0, y = 0, w = 64, h = 64 } = spec
  if (spec.fileId && spec.crop) {
    return [
      figureElement(
        'image',
        {
          id: spec.id,
          x,
          y,
          width: w,
          height: h,
          fileId: spec.fileId,
          status: 'saved',
          scale: [1, 1],
          crop: spec.crop,
          strokeColor: 'transparent',
          customData: { asterPhoto: true },
          ...common(spec)
        },
        random
      )
    ]
  }
  // Why not an X: a crossed box reads as a missing image; this reads as a picture.
  const style = styleOf(spec)
  const box = figureElement(
    'rectangle',
    {
      id: spec.id,
      x,
      y,
      width: w,
      height: h,
      strokeColor: 'transparent',
      backgroundColor: style.panel,
      boundElements: [],
      ...common(spec)
    },
    random
  )
  const hills = makePolyline(
    {
      id: `${spec.id}-hills`,
      points: [
        [x, y + h],
        [x, y + h * 0.78],
        [x + w * 0.3, y + h * 0.5],
        [x + w * 0.52, y + h * 0.72],
        [x + w * 0.72, y + h * 0.56],
        [x + w, y + h * 0.8],
        [x + w, y + h]
      ],
      closed: true,
      stroke: 'transparent',
      fill: style.strong,
      style: spec.style,
      groupIds: common(spec).groupIds,
      frame: spec.frame
    },
    random
  )
  const r = Math.min(w, h) * 0.09
  const sun = figureElement(
    'ellipse',
    {
      id: `${spec.id}-sun`,
      x: x + w * 0.72 - r,
      y: y + h * 0.26 - r,
      width: r * 2,
      height: r * 2,
      strokeColor: 'transparent',
      backgroundColor: style.strong,
      ...common(spec)
    },
    random
  )
  return [box, hills, sun]
}

export { makeChevron, makeStopGrad } from './research-figures-shapes-arrowmarks.mjs'
