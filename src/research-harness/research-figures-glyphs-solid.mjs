// Solid glyphs: a loss surface as a shaded projected mesh (or its top-down contour map) with
// optimisation paths, a parametric manifold such as a Swiss roll coloured by its own coordinate,
// and a sphere with latitude lines and geodesics. Faces are closed lines drawn back to front, so
// the mesh hides itself and each face stays an editable shape. Pure makers.
import {
  camera,
  descend,
  fitter,
  frontAndBack,
  greatCircle,
  lambert,
  MANIFOLDS,
  normalizedSurface,
  onSphere,
  quadNormal,
  surfaceFunction
} from './research-figures-science-3d.mjs'
import {
  colorRamp,
  contourLoops,
  interiorPoint,
  seeded,
  simplifyLoop,
  simplifyPath,
  smoothPath
} from './research-figures-science-math.mjs'
import {
  anchorPart,
  blend,
  boxOption,
  countOption,
  dotPart,
  glyphInk,
  glyphSolid,
  numberOption,
  pathPart
} from './research-figures-science-parts.mjs'
import { oneOf } from './research-figures-options.mjs'
import { styleOf } from './research-figures-type.mjs'

/** Optimisation paths on a 0–1 surface: given points, or descent from `from` (steps, lr, momentum). */
function surfacePaths(owner, spec, at) {
  const given = spec.paths ?? (spec.path ? [spec.path] : [])
  return given.map((path, index) => {
    const points = Array.isArray(path)
      ? path
      : (path.points ??
        descend(at, { from: path.from, steps: path.steps, lr: path.lr, momentum: path.momentum }))
    if (
      !points.length ||
      !points.every(
        (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)
      )
    ) {
      throw new Error(
        `${owner}: path ${index} must be [[u, v], …] in −1…1, or { from: [u, v], steps, lr, momentum }`
      )
    }
    return { points, color: path.color, dashed: path.dashed }
  })
}

/** Start ring and end dot of a path, plus the path itself. */
function pathMarks(spec, style, index, screen, color) {
  const ink = glyphInk(style, color)
  return [
    pathPart(spec, `path${index}`, simplifyPath(screen, 0.25), { stroke: ink, width: 2 }),
    dotPart(spec, `path${index}-start`, screen[0], {
      r: 3,
      fill: '#ffffff',
      rim: ink,
      rimWidth: 1.5
    }),
    dotPart(spec, `path${index}-end`, screen.at(-1), {
      r: 3.2,
      fill: glyphSolid(style, color),
      rim: '#ffffff',
      rimWidth: 0.8
    })
  ]
}

/**
 * `surface3d`: z = f(u, v) over u, v ∈ [−1, 1] (a named surface or a function) as a mesh seen
 * from azimuth / elevation, faces shaded by height and light (low is darker: the minimum stands
 * out); shade 'white' gives a hidden-line wireframe, 'none' a see-through one. view 'top' draws
 * the same surface as filled contour bands from above. paths: optimisation runs on it.
 */
export function makeSurface3d(spec) {
  const owner = `surface3d ${spec.id}`
  const style = styleOf(spec)
  const box = boxOption(owner, spec, [220, 160])
  const at = normalizedSurface(surfaceFunction(spec.f)).at
  const color = spec.color ?? 'accent'
  const ramp = colorRamp(style, color)
  const paths = surfacePaths(owner, spec, at)
  const view = oneOf('view', spec.view ?? '3d', ['3d', 'top'])
  const elements = [
    anchorPart(spec, box, 'surface3d', {
      view,
      f: typeof spec.f === 'string' ? spec.f : spec.f ? 'custom' : 'multimodal'
    })
  ]
  if (view === 'top') {
    const side = Math.min(box.w, box.h)
    const square = {
      x: box.x + (box.w - side) / 2,
      y: box.y + (box.h - side) / 2,
      w: side,
      h: side
    }
    const toScreen = ([u, v]) => [square.x + ((u + 1) / 2) * side, square.y + ((1 - v) / 2) * side]
    const n = 72
    const values = new Float64Array((n + 1) * (n + 1))
    for (let j = 0; j <= n; j += 1) {
      for (let i = 0; i <= n; i += 1) {
        values[j * (n + 1) + i] = 1 - at(-1 + (2 * i) / n, 1 - (2 * j) / n)
      }
    }
    const grid = {
      values,
      nx: n + 1,
      ny: n + 1,
      x0: square.x,
      y0: square.y,
      dx: side / n,
      dy: side / n
    }
    const bands = countOption(owner, 'levels', spec.levels, 9, [3, 16])
    elements.push(
      pathPart(
        spec,
        'floor',
        [
          [square.x, square.y],
          [square.x + side, square.y],
          [square.x + side, square.y + side],
          [square.x, square.y + side]
        ],
        { closed: true, fill: ramp(0.04), stroke: ramp(0.2), width: 0.75 }
      )
    )
    for (let k = 1; k <= bands; k += 1) {
      const level = k / (bands + 1)
      contourLoops(grid, level).forEach((loop, index) => {
        const smooth = simplifyLoop(smoothPath(loop, { closed: true, rounds: 1 }), 0.3)
        const [px, py] = interiorPoint(smooth)
        const hole =
          1 - at(((px - square.x) / side) * 2 - 1, 1 - ((py - square.y) / side) * 2) < level
        elements.push(
          pathPart(spec, `band${k}-${index}`, smooth, {
            closed: true,
            fill: hole ? ramp(0.04 + (0.5 * (k - 1)) / bands) : ramp(0.04 + (0.5 * k) / bands),
            stroke: ramp(0.18 + (0.5 * k) / bands),
            width: 0.75
          })
        )
      })
    }
    const screens = paths.map((path, index) => {
      const screen = path.points.map(toScreen)
      elements.push(...pathMarks(spec, style, index, screen, path.color ?? 'ink'))
      return { start: screen[0], end: screen.at(-1), points: screen }
    })
    return { elements, warnings: [], box: square, extra: { paths: screens } }
  }
  const n = countOption(owner, 'grid', spec.grid, 18, [4, 40])
  const lens = camera({
    azimuth: numberOption(owner, 'azimuth', spec.azimuth, -60),
    elevation: numberOption(owner, 'elevation', spec.elevation, 34)
  })
  const lift = numberOption(owner, 'zScale', spec.zScale, 0.7)
  const world = (u, v, z = at(u, v)) => [u, v, lift * z]
  const corners = [-1, 1].flatMap((u) =>
    [-1, 1].flatMap((v) => [0, 1].map((z) => lens.project(world(u, v, z))))
  )
  const place = fitter(corners, box, 2)
  const shade = oneOf('shade', spec.shade ?? 'height', ['height', 'light', 'white', 'none'])
  const faces = []
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const [u0, u1, v0, v1] = [
        -1 + (2 * i) / n,
        -1 + (2 * (i + 1)) / n,
        -1 + (2 * j) / n,
        -1 + (2 * (j + 1)) / n
      ]
      const quad = [world(u0, v0), world(u1, v0), world(u1, v1), world(u0, v1)]
      const projected = quad.map(lens.project)
      const light = lambert(quadNormal(quad), lens.view)
      const height = (quad[0][2] + quad[1][2] + quad[2][2] + quad[3][2]) / (4 * lift)
      faces.push({
        i,
        j,
        depth: projected.reduce((sum, point) => sum + point[2], 0) / 4,
        screen: projected.map(place),
        light,
        height
      })
    }
  }
  faces.sort((a, b) => a.depth - b.depth)
  for (const face of faces) {
    const t =
      shade === 'light'
        ? 0.08 + 0.5 * (1 - face.light)
        : 0.04 + 0.56 * (1 - face.height) ** 1.5 + 0.22 * (1 - face.light)
    const fill = shade === 'white' ? '#ffffff' : shade === 'none' ? 'transparent' : ramp(t)
    const stroke = shade === 'white' || shade === 'none' ? '#8f8f8f' : ramp(Math.min(1, t + 0.16))
    elements.push(
      pathPart(spec, `f${face.i}-${face.j}`, face.screen, {
        closed: true,
        fill,
        stroke,
        width: numberOption(owner, 'strokeWidth', spec.strokeWidth, 0.6)
      })
    )
  }
  const screens = paths.map((path, index) => {
    const screen = path.points.map(([u, v]) => place(lens.project(world(u, v, at(u, v) + 0.015))))
    elements.push(...pathMarks(spec, style, index, screen, path.color ?? 'ink'))
    return screen
  })
  return {
    elements,
    warnings: [],
    box,
    extra: { paths: screens.map((screen) => ({ start: screen[0], end: screen.at(-1) })) }
  }
}

/**
 * `manifold`: a parametric sheet (swiss-roll, s-curve, sheet, torus) as a mesh coloured along
 * its own coordinate s (pale → colour), drawn back to front; `samples` dots on it and `paths`
 * between two (s, t) points: 'geodesic' along the sheet or 'chord' straight through space.
 */
export function makeManifold(spec) {
  const owner = `manifold ${spec.id}`
  const style = styleOf(spec)
  const box = boxOption(owner, spec, [200, 150])
  const kind = oneOf('kind', spec.kind ?? 'swiss-roll', Object.keys(MANIFOLDS))
  const sheet = MANIFOLDS[kind]
  const [ns, nt] = Array.isArray(spec.grid)
    ? spec.grid
    : [spec.grid ?? 36, Math.max(4, Math.round((spec.grid ?? 36) / 4))]
  countOption(owner, 'grid s', ns, 28, [4, 80])
  countOption(owner, 'grid t', nt, 9, [2, 40])
  const lens = camera({
    azimuth: numberOption(owner, 'azimuth', spec.azimuth, -80),
    elevation: numberOption(owner, 'elevation', spec.elevation, 12)
  })
  const ramp = colorRamp(style, spec.color ?? 'accent')
  const items = []
  const all = []
  for (let a = 0; a < ns; a += 1) {
    for (let b = 0; b < nt; b += 1) {
      const quad = [
        [a, b],
        [a + 1, b],
        [a + 1, b + 1],
        [a, b + 1]
      ].map(([p, q]) => sheet(p / ns, q / nt))
      const projected = quad.map(lens.project)
      all.push(...projected)
      items.push({
        kind: 'face',
        a,
        b,
        depth: projected.reduce((sum, point) => sum + point[2], 0) / 4,
        projected,
        light: lambert(quadNormal(quad), lens.view),
        s: (a + 0.5) / ns
      })
    }
  }
  const place = fitter(all, box, 3)
  const random = seeded(numberOption(owner, 'seed', spec.seed, 1))
  const n = countOption(owner, 'samples', spec.samples, 0, [0, 400])
  for (let k = 0; k < n; k += 1) {
    const [s, t] = [random(), random()]
    const point = lens.project(sheet(s, t))
    items.push({ kind: 'dot', k, s, depth: point[2] + 0.02, projected: [point] })
  }
  for (const [index, path] of (spec.paths ?? []).entries()) {
    const pathKind = oneOf('path kind', path.kind ?? 'geodesic', ['geodesic', 'chord'])
    const [a, b] = [path.from, path.to]
    const points = Array.from({ length: 41 }, (_, k) => {
      const t = k / 40
      if (pathKind === 'chord') {
        const [p, q] = [sheet(...a), sheet(...b)]
        return lens.project([
          p[0] + (q[0] - p[0]) * t,
          p[1] + (q[1] - p[1]) * t,
          p[2] + (q[2] - p[2]) * t
        ])
      }
      return lens.project(sheet(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    })
    // Why longer pieces for a chord: its dashes need length to show, and it rarely hides.
    const run = pathKind === 'chord' ? 20 : 4
    for (let k = 0; k < 40; k += run) {
      const piece = points.slice(k, k + run + 1)
      items.push({
        kind: 'path',
        index,
        k,
        // Why on top for a chord: it cuts through space, and hidden by the sheet it says nothing.
        depth: pathKind === 'chord' ? Infinity : Math.max(...piece.map((point) => point[2])) + 0.03,
        projected: piece,
        color: path.color ?? (pathKind === 'chord' ? 'ink' : 'accent'),
        dashed: pathKind === 'chord'
      })
    }
    items.push({
      kind: 'ends',
      index,
      depth: Infinity,
      projected: [points[0], points.at(-1)],
      color: path.color ?? (pathKind === 'chord' ? 'ink' : 'accent')
    })
  }
  items.sort((p, q) => p.depth - q.depth)
  const elements = [anchorPart(spec, box, 'manifold', { kind })]
  const width = numberOption(owner, 'strokeWidth', spec.strokeWidth, 0.6)
  for (const item of items) {
    const screen = item.projected.map(place)
    if (item.kind === 'face') {
      const t = 0.1 + 0.62 * item.s + 0.12 * (1 - item.light)
      elements.push(
        pathPart(spec, `f${item.a}-${item.b}`, screen, {
          closed: true,
          fill: ramp(t),
          stroke: ramp(Math.min(1, t + 0.14)),
          width
        })
      )
    } else if (item.kind === 'dot') {
      elements.push(
        dotPart(spec, `p${item.k}`, screen[0], {
          r: 1.8,
          fill: style.ink,
          rim: '#ffffff',
          rimWidth: 0.5
        })
      )
    } else if (item.kind === 'path') {
      elements.push(
        pathPart(spec, `path${item.index}-${item.k}`, screen, {
          stroke: glyphInk(style, item.color),
          width: 2,
          dashed: item.dashed
        })
      )
    } else {
      elements.push(
        dotPart(spec, `path${item.index}-a`, screen[0], {
          r: 3,
          fill: glyphSolid(style, item.color),
          rim: '#ffffff'
        })
      )
      elements.push(
        dotPart(spec, `path${item.index}-b`, screen[1], {
          r: 3,
          fill: glyphSolid(style, item.color),
          rim: '#ffffff'
        })
      )
    }
  }
  return { elements, warnings: [], box }
}

/**
 * `sphere`: a shaded sphere with latitude and longitude lines (the far half hidden or dotted),
 * geodesics as great-circle arcs (front solid in the colour, back dashed) and marked points.
 */
export function makeSphere(spec) {
  const owner = `sphere ${spec.id}`
  const style = styleOf(spec)
  const r = numberOption(owner, 'r', spec.r, spec.w ? Math.min(spec.w, spec.h ?? spec.w) / 2 : 56)
  const cx = numberOption(owner, 'cx', spec.cx, (spec.x ?? 0) + r)
  const cy = numberOption(owner, 'cy', spec.cy, (spec.y ?? 0) + r)
  if (r <= 4) {
    throw new Error(`${owner}: r must be more than 4 units, not ${r}`)
  }
  const lens = camera({
    azimuth: numberOption(owner, 'azimuth', spec.azimuth, 25),
    elevation: numberOption(owner, 'elevation', spec.elevation, 22)
  })
  const toScreen = ([sx, sy]) => [cx + sx * r, cy + sy * r]
  const color = spec.color ?? 'accent'
  const back = oneOf('back', spec.back ?? 'hidden', ['hidden', 'dotted'])
  const box = { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }
  const base = spec.fill ?? '#f1f1f1'
  const elements = [anchorPart(spec, box, 'sphere', { r })]
  elements.push(dotPart(spec, 'body', [cx, cy], { r, fill: base, rim: '#8a8a8a', rimWidth: 1 }))
  if (spec.shade !== false) {
    // Why discs: a few lighter discs offset toward the light read as Lambert shading at print.
    for (const [k, share] of [0.82, 0.62, 0.42, 0.22].entries()) {
      const offset = (1 - share) * 0.38 * r
      const centre = [cx - offset * 0.62, cy - offset * 0.78]
      elements.push(
        dotPart(spec, `shade${k}`, centre, {
          r: share * r,
          fill: blend(base, '#ffffff', 0.25 * (k + 1))
        })
      )
    }
  }
  const lines = []
  if (spec.grid !== false) {
    for (const lat of [-60, -30, 0, 30, 60]) {
      lines.push({
        name: `lat${lat + 90}`,
        points: Array.from({ length: 73 }, (_, k) => onSphere([lat, k * 5]))
      })
    }
    for (const lon of [0, 30, 60, 90, 120, 150]) {
      lines.push({
        name: `lon${lon}`,
        points: Array.from({ length: 73 }, (_, k) => onSphere([-90 + k * 2.5, lon])).concat(
          Array.from({ length: 72 }, (_, k) => onSphere([90 - (k + 1) * 2.5, lon + 180]))
        )
      })
    }
  }
  for (const line of lines) {
    frontAndBack(line.points.map(lens.project)).forEach((run, k) => {
      if (run.front) {
        elements.push(
          pathPart(spec, `${line.name}-${k}`, run.points.map(toScreen), {
            stroke: '#a8a8a8',
            width: 0.6
          })
        )
      } else if (back === 'dotted') {
        elements.push(
          pathPart(spec, `${line.name}-${k}`, run.points.map(toScreen), {
            stroke: '#cfcfcf',
            width: 0.6,
            dashed: true
          })
        )
      }
    })
  }
  for (const [index, geodesic] of (spec.geodesics ?? []).entries()) {
    const ink = glyphInk(style, geodesic.color ?? color)
    frontAndBack(greatCircle(geodesic.from, geodesic.to).map(lens.project)).forEach((run, k) => {
      elements.push(
        pathPart(
          spec,
          `geo${index}-${k}`,
          run.points.map(toScreen),
          run.front
            ? { stroke: ink, width: 2 }
            : { stroke: blend(ink, '#ffffff', 0.45), width: 1.25, dashed: true }
        )
      )
    })
    for (const [end, where] of [
      ['a', geodesic.from],
      ['b', geodesic.to]
    ]) {
      const point = lens.project(onSphere(where))
      elements.push(
        dotPart(
          spec,
          `geo${index}-${end}`,
          toScreen(point),
          point[2] >= 0
            ? { r: 3, fill: glyphSolid(style, geodesic.color ?? color), rim: '#ffffff' }
            : { r: 2.6, fill: '#ffffff', rim: ink, rimWidth: 1 }
        )
      )
    }
  }
  for (const [index, where] of (spec.points ?? []).entries()) {
    const point = lens.project(onSphere(where))
    if (point[2] >= 0 || back === 'dotted') {
      elements.push(
        dotPart(spec, `pt${index}`, toScreen(point), {
          r: 2.4,
          fill: point[2] >= 0 ? style.ink : '#bdbdbd',
          rim: '#ffffff'
        })
      )
    }
  }
  return { elements, warnings: [], box }
}
