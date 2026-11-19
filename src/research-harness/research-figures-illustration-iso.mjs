// The illustration builder: primitives in isometric (or dimetric) space (box, slab, cylinder,
// prism, tube, sphere, flat faces and lines), each face shaded from one light direction, decals
// drawn onto a face, and contact shadows. World units are free; x runs to the lower right, y to
// the lower left, z up. `svg()` writes the role-tagged SVG the figure kit places.
import {
  circlePoints,
  drawingList,
  illustrationSvg,
  litDiscPoints,
  roundRectPoints
} from './research-figures-illustration-svg.mjs'

const COS30 = Math.cos(Math.PI / 6)
/** Screen rows of each projection: [screen x per world x, y, z], [screen y per world x, y, z]. */
export const VIEWS = {
  iso: [
    [COS30, -COS30, 0],
    [0.5, 0.5, -1]
  ],
  // Why scaled: the 2:1 "pixel" dimetric, sized like the isometric one (both rows √1.6 long).
  dimetric: [
    [0.894, -0.894, 0],
    [0.447, 0.447, -1.095]
  ],
  // Why cabinet oblique: the front (+y) face stays true shape, so photos and planes read;
  // depth recedes up and right at 45° and half scale, as papers draw stacks of maps.
  oblique: [
    [1, -0.354, 0],
    [0, 0.354, -1]
  ]
}
/** Which way contact shadows fall on the ground for each light: to the lower right or left. */
const SHADOW_FALL = { left: [1, -0.2], right: [-0.2, 1] }
/** Where the light comes from: the upper left (the default) or the upper right. */
export const LIGHTS = { left: [0.3, 0.62, 1], right: [0.62, 0.3, 1] }

const norm = (v) => {
  const length = Math.hypot(...v) || 1
  return v.map((value) => value / length)
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]

/** Degrees between the directions of two outline segments. */
function turn(a, b) {
  const da = Math.atan2(a.q[1] - a.p[1], a.q[0] - a.p[0])
  const db = Math.atan2(b.q[1] - b.p[1], b.q[0] - b.p[0])
  const d = Math.abs(((db - da) * 180) / Math.PI) % 360
  return Math.min(d, 360 - d)
}

/** A polygon's normal by Newell's method (not normalised). */
function newell(points) {
  const n = [0, 0, 0]
  points.forEach((p, index) => {
    const q = points[(index + 1) % points.length]
    n[0] += (p[1] - q[1]) * (p[2] + q[2])
    n[1] += (p[2] - q[2]) * (p[0] + q[0])
    n[2] += (p[0] - q[0]) * (p[1] + q[1])
  })
  return n
}

/**
 * A builder: `view` iso or dimetric, `light` left or right. Every primitive takes a colour
 * `role` (accent, second, neutral, metal, …) and the `tone` of its lit face (0 pale – 11 deep);
 * faces turned from the light take one or two shade steps.
 */
export function isoBuilder({ view = 'iso', light = 'left' } = {}) {
  const rows = VIEWS[view] ?? VIEWS.iso
  const toward = norm(cross(rows[0], rows[1]))
  const lightDir = norm(LIGHTS[light] ?? LIGHTS.left)
  const fall = SHADOW_FALL[light] ?? SHADOW_FALL.left
  const bTop = lightDir[2]
  const bLeft = lightDir[1]
  const bRight = lightDir[0]
  const upper = (bTop + Math.max(bLeft, bRight)) / 2
  const lower = (bLeft + bRight) / 2
  let list = drawingList()
  // Why a stack: an object is drawn at the origin, then placed, scaled and re-roled.
  const frames = [{ offset: [0, 0, 0], k: 1, roles: {}, mirror: false }]
  const top = () => frames.at(-1)
  const world = (p) => {
    const frame = top()
    const q = frame.mirror ? [p[1], p[0], p[2]] : p
    return add(scale(q, frame.k), frame.offset)
  }
  const roleOf = (role) => top().roles[role] ?? role
  /** Screen points of a flat drawing, moved, scaled and mirrored with the placement. */
  const screen = (points) => {
    const frame = top()
    const [ox, oy] = [dot(rows[0], frame.offset), dot(rows[1], frame.offset)]
    return points.map(([x, y]) => [ox + (frame.mirror ? -x : x) * frame.k, oy + y * frame.k])
  }
  const project = (p) => {
    const w = world(p)
    return [dot(rows[0], w), dot(rows[1], w)]
  }
  /** Shade steps for a world normal: 0 lit like a top, 1 like the lit side, 2 like the dark. */
  const shadeOf = (normal) => {
    const n = norm(normal)
    const b = dot(n, lightDir)
    return b >= upper ? 0 : b >= lower ? 1 : 2
  }
  const transformNormal = (n) => (top().mirror ? [n[1], n[0], n[2]] : n)
  const paint = (spec, shade = 0) => ({
    role: roleOf(spec.role ?? 'neutral'),
    tone: spec.tone ?? 2,
    shade: spec.flatShade ? 0 : shade,
    outline: spec.outline !== false
  })
  /** A flat polygon in world space, shaded by its normal; null when it faces away. */
  const face = (points, spec = {}) => {
    const n = transformNormal(newell(points))
    const facing = dot(n, toward)
    if (Math.abs(facing) < 1e-9 || (facing < 0 && !spec.twoSided)) {
      return null
    }
    const shade = spec.shade ?? shadeOf(facing < 0 ? scale(n, -1) : n)
    list.fill(points.map(project), paint(spec, shade))
    return shade
  }
  /**
   * Sides of a 2D outline (any winding) in the plane of `e1`, `e2` through `origin`, run from
   * t0 to t1 along `e3`, then the end cap that faces the viewer. `crease` also outlines where
   * the shading turns (a rounded box's corners), not only sharp corners.
   */
  const extrude = (outline, frame, t0, t1, spec) => {
    const { origin = [0, 0, 0], e1 = [1, 0, 0], e2 = [0, 1, 0], e3 = [0, 0, 1] } = frame
    const lift = ([a, b], t) => add(add(add(origin, scale(e1, a)), scale(e2, b)), scale(e3, t))
    const cx = outline.reduce((sum, p) => sum + p[0], 0) / outline.length
    const cy = outline.reduce((sum, p) => sum + p[1], 0) / outline.length
    const segments = outline.map((p, i) => {
      const q = outline[(i + 1) % outline.length]
      const along = add(scale(e1, q[0] - p[0]), scale(e2, q[1] - p[1]))
      const out = add(scale(e1, (p[0] + q[0]) / 2 - cx), scale(e2, (p[1] + q[1]) / 2 - cy))
      let normal = cross(along, e3)
      normal = transformNormal(dot(normal, out) < 0 ? scale(normal, -1) : normal)
      const visible = dot(normal, toward) > 1e-9
      return { p, q, visible, shade: visible ? shadeOf(normal) : -1 }
    })
    // Why from a hidden segment: the visible run of a convex outline is then never split.
    const start = Math.max(
      0,
      segments.findIndex((segment) => !segment.visible)
    )
    const ordered = [...segments.slice(start), ...segments.slice(0, start)]
    const runs = []
    for (const segment of ordered) {
      const last = runs.at(-1)
      if (!segment.visible) {
        continue
      }
      if (last && last.shade === segment.shade && last.end === segment.p) {
        last.points.push(segment.q)
        last.end = segment.q
      } else {
        runs.push({ shade: segment.shade, points: [segment.p, segment.q], end: segment.q })
      }
    }
    const capNormal = transformNormal(e3)
    const farEnd = dot(capNormal, toward) >= 0 ? t1 : t0
    const nearEnd = farEnd === t1 ? t0 : t1
    const p0 = paint(spec, 0)
    for (const run of runs) {
      const upperEdge = run.points.map((p) => lift(p, farEnd))
      const lowerEdge = run.points.map((p) => lift(p, nearEnd)).toReversed()
      list.fill([...upperEdge, ...lowerEdge].map(project), {
        ...paint(spec, spec.sideShade ?? run.shade),
        outline: false
      })
    }
    // Why edges apart from fills: a curved side shaded in bands must not show a line where
    // one band meets the next; only its silhouette and sharp corners are outlined.
    const visible = ordered.filter((segment) => segment.visible)
    if (p0.outline && visible.length) {
      const along = [visible[0].p, ...visible.map((segment) => segment.q)]
      const edgeSpec = { role: p0.role, tone: p0.tone + 1 }
      list.edge(
        along.map((p) => project(lift(p, nearEnd))),
        edgeSpec
      )
      const corners = [0, along.length - 1]
      visible.forEach((segment, index) => {
        const next = visible[index + 1]
        if (next && (turn(segment, next) > 25 || (spec.crease && next.shade !== segment.shade))) {
          corners.push(index + 1)
        }
      })
      for (const index of corners) {
        list.edge(
          [project(lift(along[index], nearEnd)), project(lift(along[index], farEnd))],
          edgeSpec
        )
      }
    }
    if (spec.top !== false) {
      const cap = outline.map((p) => project(lift(p, farEnd)))
      const capShade = shadeOf(farEnd === t1 ? capNormal : scale(capNormal, -1))
      list.fill(cap, paint({ ...spec, tone: spec.topTone ?? spec.tone }, capShade))
    }
  }
  const AXES = {
    x: { e1: [0, 1, 0], e2: [0, 0, 1], e3: [1, 0, 0] },
    y: { e1: [1, 0, 0], e2: [0, 0, 1], e3: [0, 1, 0] },
    z: { e1: [1, 0, 0], e2: [0, 1, 0], e3: [0, 0, 1] }
  }
  /** The frame of an axis: 'x', 'y', 'z' or any world vector. */
  const axisFrame = (axis) => {
    if (typeof axis === 'string') {
      return AXES[axis] ?? AXES.z
    }
    const e3 = norm(axis)
    const helper = Math.abs(e3[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]
    const e1 = norm(cross(helper, e3))
    return { e1, e2: cross(e3, e1), e3 }
  }
  /** A decal surface: (u, v) on a face, u to the right as seen, v down. */
  const surface = (origin, u, v, size) => {
    const at = (pu, pv) => add(add(origin, scale(u, pu)), scale(v, pv))
    const mapped = (points) => points.map(([pu, pv]) => project(at(pu, pv)))
    return {
      ...size,
      point: (pu, pv) => project(at(pu, pv)),
      /** A rectangle with rounded corners on the face. */
      rect(x, y, w, h, spec = {}) {
        list.fill(mapped(roundRectPoints(x, y, w, h, spec.radius ?? 0)), {
          ...paint({ outline: false, ...spec }, spec.shade ?? 0),
          decal: true
        })
      },
      circle(cx, cy, r, spec = {}) {
        list.fill(mapped(circlePoints(cx, cy, r, { segments: 40 })), {
          ...paint({ outline: false, ...spec }, spec.shade ?? 0),
          decal: true
        })
      },
      polygon(points, spec = {}) {
        list.fill(mapped(points), {
          ...paint({ outline: false, ...spec }, spec.shade ?? 0),
          decal: true
        })
      },
      line(points, spec = {}) {
        list.stroke(mapped(points), {
          role: roleOf(spec.role ?? 'neutral'),
          tone: spec.tone ?? 6,
          weight: spec.weight ?? 1
        })
      }
    }
  }
  const builder = {
    view,
    light,
    project,
    get list() {
      return list
    },
    /**
     * A box from corner `at` [x, y, z] of `size` [x, y, z]; `radius` rounds its vertical
     * edges. Returns its faces as decal surfaces: `top`, `left` (+y side) and `right` (+x side).
     */
    box({ at = [0, 0, 0], size = [10, 10, 10], radius = 0, ...spec } = {}) {
      const [x, y, z] = at
      const [sx, sy, sz] = size
      extrude(roundRectPoints(x, y, sx, sy, radius), AXES.z, z, z + sz, {
        crease: radius > 0,
        ...spec
      })
      return {
        top: surface([x, y, z + sz], [1, 0, 0], [0, 1, 0], { w: sx, h: sy }),
        left: surface([x, y + sy, z + sz], [1, 0, 0], [0, 0, -1], { w: sx, h: sz }),
        right: surface([x + sx, y + sy, z + sz], [0, -1, 0], [0, 0, -1], { w: sy, h: sz })
      }
    },
    /** A thin box: a table top, a tray, a ground tile. */
    slab({ at, size = [40, 40, 2], radius = 2, ...spec } = {}) {
      return builder.box({ at, size, radius, ...spec })
    },
    /**
     * A cylinder: its base centre `at`, radius `r`, length `h` along `axis` (z upright, x or y
     * lying: a lens, a wheel, a joint).
     */
    cylinder({ at = [0, 0, 0], r = 5, h = 10, axis = 'z', segments = 72, ...spec } = {}) {
      const frame = { ...axisFrame(axis), origin: at }
      extrude(circlePoints(0, 0, r, { segments }), frame, 0, h, spec)
      const { e1, e2, e3 } = frame
      const capAt = add(at, scale(e3, h))
      return {
        /** The cap facing the viewer as a decal surface, (0, 0) at its corner, 2r across. */
        top: surface(
          add(add(capAt, scale(e1, -r)), scale(e2, axis === 'z' ? -r : r)),
          e1,
          axis === 'z' ? e2 : scale(e2, -1),
          { w: 2 * r, h: 2 * r }
        )
      }
    },
    /** Any outline (2D, in the plane across `axis` through `at`) run `h` along the axis. */
    extrude({ at = [0, 0, 0], outline, axis = 'z', h = 10, ...spec }) {
      extrude(outline, { ...axisFrame(axis), origin: at }, 0, h, spec)
    },
    /** A prism: a polygon given in the plane across `axis` ('x' or 'y'), run `length` along it. */
    prism({ at = [0, 0, 0], profile, axis = 'x', length = 10, ...spec } = {}) {
      const lift = ([a, b]) =>
        axis === 'x' ? [at[0], at[1] + a, at[2] + b] : [at[0] + a, at[1], at[2] + b]
      const along = axis === 'x' ? [length, 0, 0] : [0, length, 0]
      const near = profile.map(lift)
      const far = near.map((p) => add(p, along))
      builder.solid(
        [
          near,
          far.toReversed(),
          ...near.map((p, i) => {
            const j = (i + 1) % near.length
            return [p, near[j], far[j], far[i]]
          })
        ],
        spec
      )
    },
    /** A box along three edge vectors from `origin` (a tilted lid, a screen on a stand). */
    block({ origin = [0, 0, 0], u = [10, 0, 0], v = [0, 10, 0], w = [0, 0, 10], ...spec } = {}) {
      const c = (a, b, d) => add(add(add(origin, scale(u, a)), scale(v, b)), scale(w, d))
      const faces = [
        [c(0, 0, 0), c(1, 0, 0), c(1, 1, 0), c(0, 1, 0)],
        [c(0, 0, 1), c(0, 1, 1), c(1, 1, 1), c(1, 0, 1)],
        [c(0, 0, 0), c(0, 0, 1), c(1, 0, 1), c(1, 0, 0)],
        [c(0, 1, 0), c(1, 1, 0), c(1, 1, 1), c(0, 1, 1)],
        [c(0, 0, 0), c(0, 1, 0), c(0, 1, 1), c(0, 0, 1)],
        [c(1, 0, 0), c(1, 0, 1), c(1, 1, 1), c(1, 1, 0)]
      ]
      builder.solid(faces, spec)
      return {
        /** The face spanned by u and v at the w end, as a decal surface. */
        face: surface(c(0, 0, 1), norm(u), norm(v), { w: Math.hypot(...u), h: Math.hypot(...v) })
      }
    },
    /** A convex solid from its faces (outward or not): hidden faces dropped, the rest shaded. */
    solid(faces, spec = {}) {
      const centre = scale(
        faces.flat().reduce((sum, p) => add(sum, p), [0, 0, 0]),
        1 / faces.flat().length
      )
      const oriented = faces.map((points) => {
        const mid = scale(
          points.reduce((sum, p) => add(sum, p), [0, 0, 0]),
          1 / points.length
        )
        const n = newell(points)
        return dot(n, sub(mid, centre)) < 0 ? points.toReversed() : points
      })
      for (const points of oriented) {
        face(points, spec)
      }
    },
    /** A flat polygon in world space (a panel, a sheet), shaded by which way it faces. */
    face: (points, spec = {}) => face(points, { twoSided: true, ...spec }),
    /** A tube with round ends between two world points: a robot link, a pipe, a cable. */
    tube({ from, to, r = 3, ...spec }) {
      const a = project(from)
      const b = project(to)
      const k = top().k
      const rr = r * k
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const length = Math.hypot(dx, dy) || 1
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI
      const capsule = (radius, shift) => {
        const [ox, oy] = shift
        const start = circlePoints(a[0] + ox, a[1] + oy, radius, {
          from: angle + 90,
          to: angle + 270,
          segments: 40
        })
        const end = circlePoints(b[0] + ox, b[1] + oy, radius, {
          from: angle - 90,
          to: angle + 90,
          segments: 40
        })
        return [...start, ...end]
      }
      const base = paint(spec, 1)
      list.fill(capsule(rr, [0, 0]), base)
      // Why toward the light: the lit half of a round tube faces it, a band, not a split.
      const side = [-dy / length, dx / length]
      const lightScreen = [lightDir[1] > lightDir[0] ? -1 : 1, -1]
      const sign = side[0] * lightScreen[0] + side[1] * lightScreen[1] > 0 ? 1 : -1
      if (!spec.flatShade) {
        list.fill(capsule(rr * 0.62, [side[0] * sign * rr * 0.3, side[1] * sign * rr * 0.3]), {
          ...paint(spec, 0),
          outline: false,
          seam: false
        })
      }
    },
    /** A sphere: a disc, its lit part toward the light, and a small highlight. */
    sphere({ at = [0, 0, 0], r = 5, highlight = true, ...spec } = {}) {
      const [cx, cy] = project(at)
      const rr = r * top().k
      const lx = lightDir[1] > lightDir[0] ? -1 : 1
      list.fill(circlePoints(cx, cy, rr, { segments: 64 }), paint(spec, 1))
      if (!spec.flatShade) {
        list.fill(litDiscPoints(cx, cy, rr, [lx, -1.1], 0.7), {
          ...paint(spec, 0),
          outline: false,
          seam: false
        })
      }
      if (highlight && !spec.flatShade) {
        list.fill(circlePoints(cx + lx * rr * 0.38, cy - rr * 0.4, rr * 0.16, { segments: 24 }), {
          role: roleOf(spec.role ?? 'neutral'),
          tone: Math.max(0, (spec.tone ?? 2) - 2),
          shade: 0,
          outline: false,
          seam: false
        })
      }
    },
    /**
     * A path through world points (an agent's trajectory on the floor, a motion), `dash`ed or
     * solid, with an arrowhead lying in the ground plane at its end.
     */
    path(
      points,
      { role = 'accent', tone = 5, weight = 1.6, dash = false, head = true, headSize = 7 } = {}
    ) {
      if (points.length < 2) {
        return
      }
      const tip = points.at(-1)
      const from = points.at(-2)
      const dir = norm(sub(tip, from))
      const length = Math.hypot(...sub(tip, from))
      const cut = head ? Math.min(headSize * 0.9, length * 0.8) : 0
      const body = [...points.slice(0, -1), sub(tip, scale(dir, cut))]
      list.stroke(body.map(project), { role: roleOf(role), tone, weight, dash })
      if (head) {
        const side = norm(cross(dir, [0, 0, 1]))
        const base = sub(tip, scale(dir, headSize))
        const wing = headSize * 0.5
        list.fill([tip, add(base, scale(side, wing)), sub(base, scale(side, wing))].map(project), {
          role: roleOf(role),
          tone,
          shade: 0,
          outline: false,
          seam: false
        })
      }
    },
    /** A line through world points (a cable, an edge, a trajectory). */
    line(points, { role = 'neutral', tone = 6, weight = 1, cap } = {}) {
      list.stroke(points.map(project), { role: roleOf(role), tone, weight, cap })
    },
    /** A flat contact shadow under a footprint at height `z`, cast away from the light. */
    shadow({
      at = [0, 0],
      size = [10, 10],
      z = 0,
      radius = 4,
      spread = 2,
      offset = 3,
      role = 'neutral',
      tone = 2
    } = {}) {
      const away = norm([...fall, 0])
      const x = at[0] - spread + away[0] * offset
      const y = at[1] - spread + away[1] * offset
      const outline = roundRectPoints(
        x,
        y,
        size[0] + 2 * spread,
        size[1] + 2 * spread,
        radius + spread
      )
      list.fill(
        outline.map(([px, py]) => project([px, py, z])),
        {
          role: roleOf(role),
          tone,
          shade: 0,
          outline: false,
          seam: false,
          shadow: true
        }
      )
    },
    /** An elliptic contact shadow under a round footprint (a cylinder, a sphere, a person). */
    roundShadow({ at = [0, 0], r = 6, z = 0, offset = 2, role = 'neutral', tone = 2 } = {}) {
      const away = norm([...fall, 0])
      const points = circlePoints(at[0] + away[0] * offset, at[1] + away[1] * offset, r, {
        segments: 48
      })
      list.fill(
        points.map(([px, py]) => project([px, py, z])),
        {
          role: roleOf(role),
          tone,
          shade: 0,
          outline: false,
          seam: false,
          shadow: true
        }
      )
    },
    /** A decal surface on any plane: corner `origin`, edge vectors `u` (right) and `v` (down). */
    surface: (origin, u, v, size = {}) => surface(origin, u, v, size),
    /**
     * Shapes drawn flat on the screen (a front-view object beside iso ones): points are screen
     * units from the placed origin, scaled and mirrored with the placement like everything else.
     */
    flat: {
      fill: (points, spec = {}) => list.fill(screen(points), paint(spec, spec.shade ?? 0)),
      stroke: (points, spec = {}) =>
        list.stroke(screen(points), {
          role: roleOf(spec.role ?? 'neutral'),
          tone: spec.tone ?? 6,
          weight: spec.weight ?? 1
        })
    },
    /**
     * Draws `draw(builder)` placed at `at` [x, y, z], scaled by `scale`, with roles renamed
     * (`roles: { accent: 'second' }`) and `mirror` swapping x and y (the object faces left).
     */
    place({ at = [0, 0, 0], scale: k = 1, roles = {}, mirror = false } = {}, draw) {
      const outer = top()
      const mapped = Object.fromEntries(
        Object.entries(roles).map(([role, target]) => [role, outer.roles[target] ?? target])
      )
      frames.push({
        offset: world(at),
        k: outer.k * k,
        roles: { ...outer.roles, ...mapped },
        mirror: outer.mirror !== mirror
      })
      try {
        draw(builder)
      } finally {
        frames.pop()
      }
    },
    /** Draws into a fresh list and returns it (to order objects by depth before appending). */
    capture(draw) {
      const outer = list
      list = drawingList()
      try {
        draw(builder)
        return list
      } finally {
        list = outer
      }
    },
    /** Depth of a world point toward the viewer: larger is nearer, drawn later. */
    depth: (p) => dot(world(p), toward),
    bounds: () => list.bounds(),
    /** The role-tagged SVG (see `illustrationSvg`). */
    svg: (options = {}) => illustrationSvg(list, options)
  }
  return builder
}
