// A small 3D scene for dynamic-scene figures (4D reconstruction, NeRF, 3DGS): a ground grid,
// boxes, spheres and point clouds that may move along a path, fading trails of their past
// positions coloured by time, and camera frustums. Everything becomes depth-sorted primitives,
// drawn back to front as editable lines and ellipses. World: x, y on the ground, z up.
import { lambert, quadNormal } from './research-figures-science-3d.mjs'
import { colorRamp, normalPair, seeded } from './research-figures-science-math.mjs'
import {
  blend,
  dotPart,
  glyphInk,
  glyphSolid,
  labelPart,
  pathPart,
  timeColor
} from './research-figures-science-parts.mjs'

const finite3 = (point) =>
  Array.isArray(point) && point.length === 3 && point.every(Number.isFinite)

/** Fits projected points into a box with one scale for both axes, centred: `{ place, scale }`. */
export function fitScale(points, box, pad = 0) {
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys)
  ]
  const scale = Math.min(
    (box.w - 2 * pad) / (maxX - minX || 1),
    (box.h - 2 * pad) / (maxY - minY || 1)
  )
  const ox = box.x + (box.w - (maxX - minX) * scale) / 2 - minX * scale
  const oy = box.y + (box.h - (maxY - minY) * scale) / 2 - minY * scale
  return { place: ([sx, sy]) => [ox + sx * scale, oy + sy * scale], scale }
}

/**
 * An object's path in time: `path` ([[x, y, z], …], evenly spaced in t), or `at` to `to` with an
 * `arc` (a throw: a parabola that peaks `arc` above the straight line), or just `at`.
 */
export function objectPath(owner, object, index) {
  if (object.path !== undefined) {
    if (!Array.isArray(object.path) || object.path.length < 2 || !object.path.every(finite3)) {
      throw new Error(`${owner}: object ${index}'s path must be two or more [x, y, z] points`)
    }
    return object.path
  }
  if (!finite3(object.at)) {
    throw new Error(`${owner}: object ${index} needs at: [x, y, z] (or a path)`)
  }
  if (object.to === undefined) {
    return [object.at]
  }
  if (!finite3(object.to)) {
    throw new Error(`${owner}: object ${index}'s to must be [x, y, z]`)
  }
  const arc = object.arc ?? 0
  return Array.from({ length: 25 }, (_, k) => {
    const t = k / 24
    return object.at.map(
      (value, axis) =>
        value + (object.to[axis] - value) * t + (axis === 2 ? 4 * arc * t * (1 - t) : 0)
    )
  })
}

/** The point a path reaches at time t (0–1), its points evenly spaced in t. */
export function pointAt(path, t) {
  if (path.length === 1) {
    return path[0]
  }
  const at = Math.min(1, Math.max(0, t)) * (path.length - 1)
  const k = Math.min(path.length - 2, Math.floor(at))
  const s = at - k
  return path[k].map((value, axis) => value + (path[k + 1][axis] - value) * s)
}

/** The path up to time t, ending exactly at pointAt(t). */
export function pathUntil(path, t) {
  const at = Math.min(1, Math.max(0, t)) * (path.length - 1)
  const reached = path.slice(0, Math.floor(at) + 1)
  return at > Math.floor(at) ? [...reached, pointAt(path, t)] : reached
}

const BOX_FACES = [
  [0, 1, 3, 2],
  [4, 6, 7, 5],
  [0, 4, 5, 1],
  [2, 3, 7, 6],
  [0, 2, 6, 4],
  [1, 5, 7, 3]
]

function boxCorners(center, size) {
  const [sx, sy, sz] = Array.isArray(size) ? size : [size, size, size]
  return [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [
    center[0] + ((k & 4 ? 1 : -1) * sx) / 2,
    center[1] + ((k & 2 ? 1 : -1) * sy) / 2,
    center[2] + (k & 1 ? sz : 0)
  ])
}

/** A camera frustum: apex at `at`, looking at `look`, its image plane `size` away. */
export function frustum(camera) {
  const { at, look = [0, 0, 0], fov = 45, aspect = 4 / 3, size = 0.35 } = camera
  const forward = look.map((value, axis) => value - at[axis])
  const length = Math.hypot(...forward) || 1
  const f = forward.map((value) => value / length)
  const up = Math.abs(f[2]) > 0.95 ? [0, 1, 0] : [0, 0, 1]
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
  const norm = (v) => v.map((value) => value / (Math.hypot(...v) || 1))
  const right = norm(cross(f, up))
  const top = cross(right, f)
  const half = size * Math.tan((fov * Math.PI) / 360)
  const centre = at.map((value, axis) => value + f[axis] * size)
  const corner = (a, b) =>
    centre.map((value, axis) => value + right[axis] * half * a + top[axis] * (half / aspect) * b)
  return {
    apex: at,
    corners: [corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)],
    upBase: [corner(-0.3, 1.08), corner(0.3, 1.08)],
    top: corner(0, 1.5)
  }
}

/**
 * The scene's primitives at time `t` (objects at their place on their path; `trails` adds the
 * path so far, coloured by time, and `ghosts` faded copies along it). Each primitive has 3D
 * points, paint and an id suffix; `bias` breaks depth ties toward the viewer.
 */
export function sceneItems(owner, spec, style, t = 1) {
  const items = []
  const ground = spec.ground ?? true
  if (ground) {
    const [gx, gy] = spec.extent ?? [1, 1]
    items.push({
      suffix: 'ground',
      points: [
        [-gx, -gy, 0],
        [gx, -gy, 0],
        [gx, gy, 0],
        [-gx, gy, 0]
      ],
      closed: true,
      fill: '#f5f5f5',
      stroke: '#d4d4d4',
      width: 0.75,
      layer: -2
    })
    const lines = 6
    for (let k = 1; k < lines; k += 1) {
      const a = -gx + (2 * gx * k) / lines
      const b = -gy + (2 * gy * k) / lines
      items.push({
        suffix: `grid-x${k}`,
        points: [
          [a, -gy, 0],
          [a, gy, 0]
        ],
        stroke: '#e1e1e1',
        width: 0.6,
        layer: -1
      })
      items.push({
        suffix: `grid-y${k}`,
        points: [
          [-gx, b, 0],
          [gx, b, 0]
        ],
        stroke: '#e1e1e1',
        width: 0.6,
        layer: -1
      })
    }
  }
  for (const [index, object] of (spec.objects ?? []).entries()) {
    const kind = object.kind ?? 'box'
    if (!['box', 'sphere', 'points'].includes(kind)) {
      throw new Error(
        `${owner}: object ${index} kind must be box, sphere or points, not ${JSON.stringify(kind)}`
      )
    }
    const path = objectPath(owner, object, index)
    const color = object.color ?? (index === 0 ? 'accent' : 'mid')
    const shape = (center, prefix, opacity) =>
      objectItems(owner, { ...object, kind }, index, center, prefix, color, style, opacity)
    if (path.length > 1 && spec.trails !== false && object.trail !== false) {
      // Why at mid-height for a box: its path is its base, and a trail on the floor reads as a leg.
      const lift = kind === 'box' ? [object.size ?? 0.3].flat().at(-1) / 2 : 0
      const past = pathUntil(path, t).map(([px, py, pz]) => [px, py, pz + lift])
      for (let k = 0; k + 1 < past.length; k += 1) {
        const time = (k + 1) / (path.length - 1)
        items.push({
          suffix: `o${index}-trail${k}`,
          points: [past[k], past[k + 1]],
          stroke: timeColor(style, color, time),
          width: 1.5,
          bias: 0.01
        })
      }
      const ghosts = object.ghosts ?? 0
      for (let g = 0; g < ghosts; g += 1) {
        const when = (t * (g + 1)) / (ghosts + 1)
        items.push(
          ...shape(
            pointAt(path, when),
            `o${index}-ghost${g}-`,
            Math.round(18 + (30 * (g + 1)) / ghosts)
          )
        )
      }
    }
    items.push(...shape(pointAt(path, t), `o${index}-`, object.opacity))
  }
  for (const [index, camera] of (spec.cameras ?? []).entries()) {
    if (!finite3(camera.at) || (camera.look !== undefined && !finite3(camera.look))) {
      throw new Error(`${owner}: camera ${index} needs at: [x, y, z] and look: [x, y, z]`)
    }
    const { apex, corners, top, upBase } = frustum(camera)
    const ink = glyphInk(style, camera.color ?? 'ink')
    items.push({
      suffix: `cam${index}-image`,
      points: corners,
      closed: true,
      fill: blend(ink, '#ffffff', 0.9),
      stroke: ink,
      width: 1,
      bias: 0.02
    })
    corners.forEach((corner, k) =>
      items.push({ suffix: `cam${index}-ray${k}`, points: [apex, corner], stroke: ink, width: 0.9 })
    )
    // Why a small open triangle: which way is up on the image, without a heavy black cap.
    items.push({
      suffix: `cam${index}-up`,
      points: [...upBase, top],
      closed: true,
      fill: '#ffffff',
      stroke: ink,
      width: 0.8,
      bias: 0.03
    })
    if (camera.label) {
      items.push({ suffix: `cam${index}-label`, label: camera.label, points: [top], layer: 2 })
    }
  }
  return items
}

/** The primitives of one object at `center`: box faces, a shaded sphere or a seeded cloud. */
function objectItems(owner, object, index, center, prefix, color, style, opacity) {
  const ramp = colorRamp(style, color)
  if (object.kind === 'box') {
    const corners = boxCorners(center, object.size ?? 0.3)
    return BOX_FACES.map((face, f) => ({
      suffix: `${prefix}face${f}`,
      points: face.map((k) => corners[k]),
      closed: true,
      face: true,
      ramp,
      opacity
    }))
  }
  if (object.kind === 'sphere') {
    const r = object.r ?? 0.15
    return [{ suffix: `${prefix}ball`, points: [center], ball: r, ramp, color, opacity }]
  }
  const random = seeded(object.seed ?? index + 1)
  const n = object.n ?? 80
  if (!Number.isInteger(n) || n < 1 || n > 600) {
    throw new Error(`${owner}: object ${index} n must be a whole number from 1 to 600`)
  }
  const spread = object.spread ?? [0.25, 0.25, 0.12]
  const [sx, sy, sz] = Array.isArray(spread) ? spread : [spread, spread, spread]
  return Array.from({ length: n }, (_, k) => {
    const [a, b] = normalPair(random)
    const [c] = normalPair(random)
    return {
      suffix: `${prefix}pt${k}`,
      points: [[center[0] + a * sx, center[1] + b * sy, Math.max(0, center[2] + sz + c * sz)]],
      dot: glyphSolid(style, color),
      opacity
    }
  })
}

/** Projects, sorts back to front and draws primitives as elements; labels go on top. */
export function drawItems(spec, items, lens, place, scale, prefix = '') {
  const style = spec.style
  const projected = items.map((item) => {
    const screen = item.points.map(lens.project)
    const depth =
      screen.reduce((sum, point) => sum + point[2], 0) / screen.length + (item.bias ?? 0)
    return {
      ...item,
      screen,
      depth: item.layer !== undefined && item.layer < 0 ? item.layer * 1e6 + depth : depth
    }
  })
  projected.sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0) || a.depth - b.depth)
  const elements = []
  for (const item of projected) {
    const points = item.screen.map(place)
    const id = `${prefix}${item.suffix}`
    if (item.label) {
      elements.push(
        ...labelPart(
          spec,
          id,
          item.label,
          { cx: points[0][0], y: points[0][1] - 20 },
          { size: style.smallSize ?? 14 }
        )
      )
    } else if (item.face) {
      const normal = quadNormal(item.points)
      const facing = normal[0] * lens.view[0] + normal[1] * lens.view[1] + normal[2] * lens.view[2]
      // Why only the faces turned to us: the box's back faces would show through its edges.
      if (facing > 1e-6) {
        const tone = 0.18 + 0.42 * (1 - lambert(normal, lens.view))
        elements.push(
          pathPart(spec, id, points, {
            closed: true,
            fill: item.ramp(tone),
            stroke: item.ramp(Math.min(1, tone + 0.3)),
            width: 0.9,
            opacity: item.opacity
          })
        )
      }
    } else if (item.ball) {
      const r = item.ball * scale
      const [cx, cy] = points[0]
      elements.push(
        dotPart(spec, id, [cx, cy], {
          r,
          fill: item.ramp(0.42),
          opacity: item.opacity
        })
      )
      // Why a lighter disc up and to the left: the sphere reads round at print, like the sphere glyph.
      elements.push(
        dotPart(spec, `${id}-light`, [cx - r * 0.28, cy - r * 0.28], {
          r: r * 0.5,
          fill: blend(item.ramp(0.42), '#ffffff', 0.4),
          opacity: item.opacity
        })
      )
    } else if (item.dot) {
      elements.push(
        dotPart(spec, id, points[0], {
          r: spec.pointSize ?? 1.6,
          fill: item.dot,
          rim: '#ffffff',
          rimWidth: 0.4,
          opacity: item.opacity
        })
      )
    } else {
      elements.push(
        pathPart(spec, id, points, {
          closed: item.closed,
          fill: item.fill,
          stroke: item.stroke,
          width: item.width,
          dashed: item.dashed,
          opacity: item.opacity
        })
      )
    }
  }
  return elements
}

/** Every 3D point a scene may reach over t (for one shared fit), with sphere tops included. */
export function sceneExtent(owner, spec) {
  const points = []
  const [gx, gy] = spec.extent ?? [1, 1]
  if (spec.ground ?? true) {
    points.push([-gx, -gy, 0], [gx, -gy, 0], [gx, gy, 0], [-gx, gy, 0])
  }
  for (const [index, object] of (spec.objects ?? []).entries()) {
    const reach =
      object.kind === 'sphere'
        ? (object.r ?? 0.15)
        : object.kind === 'points'
          ? 0.5
          : Math.max(...[object.size ?? 0.3].flat())
    for (const point of objectPath(owner, object, index)) {
      for (const [dx, dy, dz] of [
        [0, 0, 1],
        [0, 0, -1],
        [1, 1, 0],
        [-1, -1, 0],
        [1, -1, 0],
        [-1, 1, 0]
      ]) {
        points.push([point[0] + dx * reach, point[1] + dy * reach, point[2] + dz * reach])
      }
    }
  }
  for (const camera of spec.cameras ?? []) {
    if (finite3(camera.at)) {
      const { apex, corners, top } = frustum(camera)
      points.push(apex, ...corners, top)
    }
  }
  return points.length
    ? points
    : [
        [-1, -1, 0],
        [1, 1, 1]
      ]
}
