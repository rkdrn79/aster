// Glyphs for time as a dimension (4D figures): a 3D scene with motion trails and camera
// frustums, the same scene at several times on one projection, a space-time volume of frames
// with object tracks threading through them, a tesseract, and a time colourbar that keys every
// time-coloured path. Pure makers on the scene engine in research-figures-science-scene.mjs.
import { camera } from './research-figures-science-3d.mjs'
import { drawItems, fitScale, sceneExtent, sceneItems } from './research-figures-science-scene.mjs'
import {
  anchorPart,
  blend,
  boxOption,
  countOption,
  dotPart,
  glyphInk,
  headPart,
  labelPart,
  numberOption,
  pathPart,
  timeColor
} from './research-figures-science-parts.mjs'
import { oneOf } from './research-figures-options.mjs'
import { styleOf } from './research-figures-type.mjs'

const lensOf = (owner, spec, [azimuth, elevation]) =>
  camera({
    azimuth: numberOption(owner, 'azimuth', spec.azimuth, azimuth),
    elevation: numberOption(owner, 'elevation', spec.elevation, elevation)
  })

/**
 * `scene3d`: objects (box: `at` its base centre, `size`; sphere: `at` its centre, `r`; points:
 * a seeded cloud at `at`, `n`, `spread`) on a ground grid, each moving along `path` (or `at` →
 * `to` with `arc`) and shown at time `t` with the trail so far coloured by time and `ghosts`
 * faded copies; `cameras` add frustums (`at`, `look`, `fov`, `size`, `label`).
 */
export function makeScene3d(spec) {
  const owner = `scene3d ${spec.id}`
  const box = boxOption(owner, spec, [260, 180])
  const lens = lensOf(owner, spec, [-58, 24])
  const t = numberOption(owner, 't', spec.t, 1)
  const { place, scale } = fitScale(sceneExtent(owner, spec).map(lens.project), box, 4)
  const elements = drawItems(
    styled(spec),
    sceneItems(owner, spec, styleOf(spec), t),
    lens,
    place,
    scale
  )
  return { elements: [anchorPart(spec, box, 'scene3d', { t }), ...elements], warnings: [] }
}

const styled = (spec) => ({ ...spec, style: styleOf(spec) })

/**
 * `snapshots3d`: the scene of scene3d at several times side by side, every panel on one camera
 * and one scale (fitted to everything the objects reach), trails drawn up to each time, each
 * panel labelled with its t over a time axis.
 */
export function makeSnapshots3d(spec) {
  const owner = `snapshots3d ${spec.id}`
  const box = boxOption(owner, spec, [600, 170])
  const steps = countOption(owner, 'steps', spec.steps, 3, [2, 8])
  const times = spec.times ?? Array.from({ length: steps }, (_, k) => k / (steps - 1))
  if (
    !Array.isArray(times) ||
    times.length < 2 ||
    !times.every((t) => typeof t === 'number' && t >= 0 && t <= 1)
  ) {
    throw new Error(
      `${owner}: times must be two or more numbers between 0 and 1, not ${JSON.stringify(spec.times)}`
    )
  }
  const style = styleOf(spec)
  const gap = numberOption(owner, 'gap', spec.gap, 16)
  const labelSize = style.smallSize ?? 14
  const below = (spec.labels === false ? 0 : labelSize * 1.4 + 4) + (spec.axis === false ? 0 : 16)
  const cell = { w: (box.w - gap * (times.length - 1)) / times.length, h: box.h - below }
  if (cell.w < 40 || cell.h < 40) {
    throw new Error(
      `${owner}: each panel would be ${Math.round(cell.w)} × ${Math.round(cell.h)} units; give it more w or h, or fewer times`
    )
  }
  const lens = lensOf(owner, spec, [-58, 24])
  // Why one fit for all panels: the same world point lands at the same spot in every panel.
  const { place, scale } = fitScale(
    sceneExtent(owner, spec).map(lens.project),
    { x: 0, y: 0, ...cell },
    4
  )
  const elements = [anchorPart(spec, box, 'snapshots3d', { times })]
  const panels = []
  // Why from the top: the labels and the axis then sit right under the drawn scene.
  const ys = sceneExtent(owner, spec).map((point) => place(lens.project(point))[1])
  const [top, height] = [Math.min(...ys), Math.max(...ys) - Math.min(...ys)]
  times.forEach((t, k) => {
    const left = box.x + k * (cell.w + gap)
    const shift = ([px, py]) => {
      const [sx, sy] = place([px, py])
      return [sx + left, sy - top + box.y]
    }
    elements.push(
      ...drawItems(styled(spec), sceneItems(owner, spec, style, t), lens, shift, scale, `t${k}-`)
    )
    panels.push({ x: left, y: box.y, width: cell.w, height, t })
    if (spec.labels !== false) {
      const text = Array.isArray(spec.labels)
        ? spec.labels[k]
        : `$t = ${Math.round(t * 100) / 100}$`
      elements.push(
        ...labelPart(
          spec,
          `t${k}-label`,
          text,
          { cx: left + cell.w / 2, y: box.y + height + 4 },
          { size: labelSize }
        )
      )
    }
  })
  if (spec.axis !== false) {
    const y = box.y + height + (spec.labels === false ? 8 : labelSize * 1.4 + 10)
    const [x0, x1] = [box.x + cell.w * 0.2, box.x + box.w - cell.w * 0.2]
    elements.push(
      pathPart(
        spec,
        'axis',
        [
          [x0, y],
          [x1 - 6, y]
        ],
        { stroke: style.line, width: 1.25 }
      )
    )
    elements.push(
      headPart(spec, 'axis-head', [x0, y], [x1, y], { color: style.line, length: 7, width: 5.5 })
    )
  }
  return { elements, warnings: [], extra: { panels } }
}

const PROJECTIONS = { oblique: [-125, 18], iso: [-135, 30], front: [-152, 14] }

/**
 * `spacetime`: `frames` (x, y) frames stacked along a t axis and seen in `projection` (oblique,
 * iso or front, or azimuth / elevation), the first frame in front; `tracks` thread through them
 * (`points`: one [u, v] per frame, or `from` → `to` with `bend`), each coloured by time, a dot
 * where it crosses each frame; the volume's long edges, a t axis and frame labels.
 */
export function makeSpacetime(spec) {
  const owner = `spacetime ${spec.id}`
  const style = styleOf(spec)
  const box = boxOption(owner, spec, [300, 170])
  const n = countOption(owner, 'frames', spec.frames, 5, [2, 16])
  const projection = oneOf('projection', spec.projection ?? 'oblique', Object.keys(PROJECTIONS))
  const lens = lensOf(owner, spec, PROJECTIONS[projection])
  const aspect = numberOption(owner, 'aspect', spec.aspect, 4 / 3)
  const length = numberOption(owner, 'depth', spec.depth, 2.4)
  const height = 1 / aspect
  // World: t along x, the frame's u across −y (so it reads left to right), v up along z.
  const world = (k, u, v) => [(k / (n - 1)) * length, 0.5 - u, v * height]
  const corners = (k) => [world(k, 0, 0), world(k, 1, 0), world(k, 1, 1), world(k, 0, 1)]
  const all = Array.from({ length: n }, (_, k) => corners(k)).flat()
  const labelRoom = spec.axis === false && !spec.labels ? 0 : 26
  const { place } = fitScale(all.map(lens.project), { ...box, h: box.h - labelRoom }, 2)
  const color = spec.color ?? 'accent'
  const ink = glyphInk(style, color)
  const items = []
  const depth = (points) =>
    points.map(lens.project).reduce((sum, point) => sum + point[2], 0) / points.length
  for (let k = 0; k < n; k += 1) {
    const quad = corners(k)
    const lit = spec.highlight === k
    items.push({
      depth: depth(quad),
      draw: () => [
        pathPart(spec, `f${k}`, quad.map(lens.project).map(place), {
          closed: true,
          fill: lit ? blend(ink, '#ffffff', 0.85) : '#ffffff',
          stroke: 'transparent',
          opacity: spec.opacity ?? 78
        }),
        pathPart(spec, `f${k}-edge`, quad.map(lens.project).map(place), {
          closed: true,
          fill: 'transparent',
          stroke: lit ? ink : style.line,
          width: lit ? 1.5 : 1
        })
      ]
    })
    if (spec.content === 'grid') {
      for (let g = 1; g < 4; g += 1) {
        items.push({
          depth: depth(quad) + 1e-4,
          draw: () => [
            pathPart(
              spec,
              `f${k}-gu${g}`,
              [world(k, g / 4, 0), world(k, g / 4, 1)].map(lens.project).map(place),
              { stroke: '#d9d9d9', width: 0.6 }
            )
          ]
        })
        if (g < 3) {
          items.push({
            depth: depth(quad) + 1e-4,
            draw: () => [
              pathPart(
                spec,
                `f${k}-gv${g}`,
                [world(k, 0, g / 3), world(k, 1, g / 3)].map(lens.project).map(place),
                { stroke: '#d9d9d9', width: 0.6 }
              )
            ]
          })
        }
      }
    }
  }
  for (const corner of [0, 1, 2, 3]) {
    const edge = [corners(0)[corner], corners(n - 1)[corner]]
    items.push({
      depth: depth(edge),
      draw: () => [
        pathPart(spec, `edge${corner}`, edge.map(lens.project).map(place), {
          stroke: '#c4c4c4',
          width: 0.75
        })
      ]
    })
  }
  for (const [index, track] of (spec.tracks ?? []).entries()) {
    const points = trackPoints(owner, track, index, n)
    const tone = track.color ?? color
    points.forEach(([u, v], k) => {
      const at = world(k, u, v)
      items.push({
        depth: depth([at]) + 1e-3,
        draw: () => [
          dotPart(spec, `track${index}-p${k}`, place(lens.project(at)), {
            r: track.r ?? 3,
            fill: timeColor(style, tone, k / (n - 1)),
            rim: '#ffffff',
            rimWidth: 0.7
          })
        ]
      })
      if (k + 1 < n) {
        const next = world(k + 1, ...points[k + 1])
        items.push({
          depth: depth([at, next]),
          draw: () => [
            pathPart(spec, `track${index}-s${k}`, [at, next].map(lens.project).map(place), {
              stroke: timeColor(style, tone, (k + 1) / (n - 1)),
              width: 1.6
            })
          ]
        })
      }
    })
  }
  items.sort((a, b) => a.depth - b.depth)
  const elements = [
    anchorPart(spec, box, 'spacetime', { frames: n }),
    ...items.flatMap((item) => item.draw())
  ]
  // Why the lowest long edge: an axis along it, offset down, runs under the frames, not across.
  const edgeAt = (k, u, v) => place(lens.project(world(k, u, v)))
  const [eu, ev] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1]
  ].toSorted(
    (p, q) =>
      edgeAt(0, ...q)[1] + edgeAt(n - 1, ...q)[1] - edgeAt(0, ...p)[1] - edgeAt(n - 1, ...p)[1]
  )[0]
  const bottom = (k) => edgeAt(k, eu, ev)
  if (spec.axis !== false) {
    const [a, b] = [bottom(0), bottom(n - 1)]
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
    const norm = Math.hypot(dx, dy) || 1
    // Why under the frames' bottom corners: the axis reads as the volume's own edge, offset.
    const drop = [a[0], a[1] + 10]
    const end = [drop[0] + dx * 1.1, drop[1] + dy * 1.1]
    elements.push(
      pathPart(spec, 'axis', [drop, [end[0] - (dx / norm) * 6, end[1] - (dy / norm) * 6]], {
        stroke: style.line,
        width: 1.25
      })
    )
    elements.push(
      headPart(spec, 'axis-head', drop, end, { color: style.line, length: 7, width: 5.5 })
    )
    elements.push(
      ...labelPart(
        spec,
        'axis-label',
        spec.axisLabel ?? '$t$',
        // Why under the head: beside it the label meets whatever an arrow brings in from the right.
        { cx: end[0] - 4, y: end[1] + 3 },
        { size: style.textSize ?? 16 }
      )
    )
  }
  if (spec.labels) {
    for (let k = 0; k < n; k += 1) {
      const text = Array.isArray(spec.labels) ? spec.labels[k] : `$t_{${k + 1}}$`
      const [px, py] = place(lens.project(world(k, 0.5, 1)))
      if (text) {
        elements.push(
          ...labelPart(
            spec,
            `f${k}-label`,
            text,
            { cx: px, y: py - 20 },
            { size: style.smallSize ?? 14 }
          )
        )
      }
    }
  }
  const frameWidth = Math.hypot(
    ...[0, 1].map(
      (axis) =>
        place(lens.project(world(0, 1, 0)))[axis] - place(lens.project(world(0, 0, 0)))[axis]
    )
  )
  elements[0].customData.asterScience.frameWidth = Math.round(frameWidth * 10) / 10
  return {
    elements,
    warnings:
      frameWidth < 16
        ? [
            `${owner}: its frames are only ${Math.round(frameWidth)} units wide on the page; turn it (azimuth) or use fewer frames`
          ]
        : [],
    extra: { frameWidth }
  }
}

/** A track's [u, v] in each of n frames: given, or a bent line from `from` to `to`. */
function trackPoints(owner, track, index, n) {
  if (track.points) {
    if (
      !Array.isArray(track.points) ||
      track.points.length !== n ||
      !track.points.every(
        (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)
      )
    ) {
      throw new Error(
        `${owner}: track ${index} needs one [u, v] per frame (${n}), shares of the frame from its bottom-left`
      )
    }
    return track.points
  }
  const [from, to] = [track.from ?? [0.2, 0.3], track.to ?? [0.8, 0.6]]
  const bend = track.bend ?? 0.2
  return Array.from({ length: n }, (_, k) => {
    const s = k / (n - 1)
    return [
      from[0] + (to[0] - from[0]) * s,
      from[1] + (to[1] - from[1]) * s + 4 * bend * s * (1 - s)
    ]
  })
}

/**
 * `tesseract`: the 4D hypercube, rotated in the x–w and z–w planes (`rotation: [a, b]`,
 * radians), seen in perspective from w (`distance`) and projected like a 3D object; the cube
 * nearer in w in ink, the farther one in the colour, the edges joining them gray; `spin` adds
 * a curved arrow for the rotation.
 */
export function makeTesseract(spec) {
  const owner = `tesseract ${spec.id}`
  const style = styleOf(spec)
  const size = numberOption(owner, 'size', spec.size, spec.w ?? 140)
  const box =
    spec.cx !== undefined
      ? { x: spec.cx - size / 2, y: (spec.cy ?? 0) - size / 2, w: size, h: size }
      : boxOption(owner, spec, [size, size])
  const [a, b] = Array.isArray(spec.rotation) ? spec.rotation : [spec.rotation ?? 0.35, 0.2]
  if (![a, b].every(Number.isFinite)) {
    throw new Error(`${owner}: rotation must be radians, a number or [xw, zw]`)
  }
  const distance = numberOption(owner, 'distance', spec.distance, 3)
  const lens = lensOf(owner, spec, [-32, 22])
  const vertices = Array.from({ length: 16 }, (_, k) => [
    k & 1 ? 1 : -1,
    k & 2 ? 1 : -1,
    k & 4 ? 1 : -1,
    k & 8 ? 1 : -1
  ])
  const rotated = vertices.map(([x, y, z, w]) => {
    const [x1, w1] = [x * Math.cos(a) - w * Math.sin(a), x * Math.sin(a) + w * Math.cos(a)]
    const [z1, w2] = [z * Math.cos(b) - w1 * Math.sin(b), z * Math.sin(b) + w1 * Math.cos(b)]
    const k = distance / (distance - w2)
    return [x1 * k, y * k, z1 * k]
  })
  const { place } = fitScale(rotated.map(lens.project), box, spec.spin ? 14 : 4)
  const screen = rotated.map((point) => place(lens.project(point)))
  const ink = glyphInk(style, spec.color ?? 'accent')
  const elements = [anchorPart(spec, box, 'tesseract', { rotation: [a, b] })]
  const edges = []
  for (let i = 0; i < 16; i += 1) {
    for (let bit = 0; bit < 4; bit += 1) {
      const j = i ^ (1 << bit)
      if (j > i) {
        edges.push([i, j, bit])
      }
    }
  }
  // Why three tones: the two cubes are the shape; the edges between them are the fourth axis.
  const tone = ([i, , bit]) => (bit === 3 ? 'join' : vertices[i][3] > 0 ? 'outer' : 'inner')
  const paint = {
    join: { stroke: '#a8a8a8', width: 1 },
    outer: { stroke: style.line, width: 1.5 },
    inner: { stroke: ink, width: 1.5 }
  }
  for (const kind of ['join', 'outer', 'inner']) {
    for (const edge of edges.filter((item) => tone(item) === kind)) {
      elements.push(
        pathPart(spec, `e${edge[0]}-${edge[1]}`, [screen[edge[0]], screen[edge[1]]], paint[kind])
      )
    }
  }
  if (spec.vertices !== false) {
    screen.forEach((point, k) =>
      elements.push(
        dotPart(spec, `v${k}`, point, {
          r: 2.2,
          fill: vertices[k][3] > 0 ? style.line : ink,
          rim: '#ffffff',
          rimWidth: 0.6
        })
      )
    )
  }
  if (spec.spin) {
    const cx = box.x + box.w / 2
    const cy = box.y + box.h / 2
    const arc = Array.from({ length: 25 }, (_, k) => {
      const angle = Math.PI * (0.15 + (0.55 * k) / 24)
      return [
        cx + (box.w / 2 - 2) * Math.cos(angle),
        cy + (box.h / 2 - 2) * 0.32 * Math.sin(angle) + box.h * 0.36
      ]
    })
    elements.push(pathPart(spec, 'spin', arc.slice(0, -1), { stroke: style.line, width: 1.25 }))
    elements.push(
      headPart(spec, 'spin-head', arc.at(-3), arc.at(-1), {
        color: style.line,
        length: 6,
        width: 5
      })
    )
  }
  return { elements, warnings: [] }
}

/**
 * `timebar`: the key to time colours: a bar from gray (t = 0) to the colour (t = 1), the same
 * rule as flowPaths, trajectories, spacetime tracks and scene trails, with end labels and an
 * optional name; horizontal (labels under its ends) or vertical (t = 0 at the bottom).
 */
export function makeTimebar(spec) {
  const owner = `timebar ${spec.id}`
  const style = styleOf(spec)
  const vertical =
    oneOf('orientation', spec.orientation ?? 'horizontal', ['horizontal', 'vertical']) ===
    'vertical'
  const box = boxOption(owner, spec, vertical ? [8, 72] : [96, 8])
  const segments = countOption(owner, 'segments', spec.segments, 24, [2, 64])
  const color = spec.color ?? 'accent'
  const elements = [anchorPart(spec, box, 'timebar', { vertical })]
  for (let k = 0; k < segments; k += 1) {
    const share = (k + 0.5) / segments
    const [a, b] = [k / segments, (k + 1) / segments]
    // Why overlap: adjacent cells drawn edge to edge show hairline seams in a PDF viewer.
    const cell = vertical
      ? [
          [box.x, box.y + box.h * (1 - b) - 0.4],
          [box.x + box.w, box.y + box.h * (1 - b) - 0.4],
          [box.x + box.w, box.y + box.h * (1 - a)],
          [box.x, box.y + box.h * (1 - a)]
        ]
      : [
          [box.x + box.w * a, box.y],
          [box.x + box.w * b + 0.4, box.y],
          [box.x + box.w * b + 0.4, box.y + box.h],
          [box.x + box.w * a, box.y + box.h]
        ]
    const tone = timeColor(style, color, share)
    elements.push(
      pathPart(spec, `c${k}`, cell, { closed: true, fill: tone, stroke: tone, width: 0.3 })
    )
  }
  const size = style.smallSize ?? 14
  const [start, end] =
    spec.labels === false ? [null, null] : (spec.labels ?? ['$t = 0$', '$t = 1$'])
  const ends = vertical
    ? [
        ['start', start, { x: box.x + box.w + 4, cy: box.y + box.h }],
        ['end', end, { x: box.x + box.w + 4, cy: box.y }]
      ]
    : [
        ['start', start, { cx: box.x, y: box.y + box.h + 3 }],
        ['end', end, { cx: box.x + box.w, y: box.y + box.h + 3 }]
      ]
  for (const [suffix, text, where] of ends) {
    if (text) {
      elements.push(...labelPart(spec, suffix, text, where, { size }))
    }
  }
  if (spec.name) {
    const where = vertical
      ? { cx: box.x + box.w / 2, y: box.y - size * 1.25 - 12 }
      : { x: box.x + box.w + 8, cy: box.y + box.h / 2 }
    elements.push(...labelPart(spec, 'name', spec.name, where, { size }))
  }
  return { elements, warnings: [] }
}
