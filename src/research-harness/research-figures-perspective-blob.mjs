// Organic blobs: metaballs (each ball's field r²/d², summed) melted into one smooth surface
// by marching tetrahedra on a grid. Vertices on shared grid edges are shared, so the mesh is
// closed and its outline and cel bands follow the true shape; normals come from the field.
import { add, mul, sub, unit } from './research-figures-perspective-camera.mjs'

/** The six tetrahedra of a cube around its main diagonal (corner 0 to corner 6). */
const TETS = [
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6]
]
const CORNERS = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1]
]

/**
 * The field of balls at a point, and its gradient: each ball a soft bump (1 − d²/R²)³ out to
 * R = `blend` × r, so a lone ball's surface is its sphere and only near balls melt together
 * (an inverse-square field would swell every small part into one potato).
 */
function fieldOf(balls, blend) {
  return (p) => {
    let value = 0
    const gradient = [0, 0, 0]
    for (const ball of balls) {
      const d = sub(p, ball.at)
      const d2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]
      const R2 = (ball.r * blend) ** 2
      if (d2 >= R2) {
        continue
      }
      const w = 1 - d2 / R2
      const strength = ball.strength ?? 1
      value += strength * w * w * w
      const k = (strength * -6 * w * w) / R2
      gradient[0] += k * d[0]
      gradient[1] += k * d[1]
      gradient[2] += k * d[2]
    }
    return { value, gradient }
  }
}

/**
 * A closed mesh of the surface where the balls' field equals `level` (1: each ball's radius): `n` grid cells across
 * the largest side. Returns { verts, faces, vnormals } (faces counter-clockwise from outside).
 */
export function metaballMesh(balls, { n = 22, level = 1, blend = 1.8 } = {}) {
  const field = fieldOf(balls, blend)
  // Why this level: a lone ball's surface lies at its own radius.
  const threshold = (1 - 1 / (blend * blend)) ** 3 * level
  const pad = Math.max(...balls.map((ball) => ball.r)) * 0.4
  const lo = [0, 1, 2].map((axis) => Math.min(...balls.map((b) => b.at[axis] - b.r)) - pad)
  const hi = [0, 1, 2].map((axis) => Math.max(...balls.map((b) => b.at[axis] + b.r)) + pad)
  const step = Math.max(...[0, 1, 2].map((axis) => hi[axis] - lo[axis])) / n
  const counts = [0, 1, 2].map((axis) => Math.ceil((hi[axis] - lo[axis]) / step))
  const point = (i, j, k) => add(lo, [i * step, j * step, k * step])
  const key = (i, j, k) => (i * (counts[1] + 1) + j) * (counts[2] + 1) + k
  const values = new Map()
  const valueAt = (i, j, k) => {
    const id = key(i, j, k)
    if (!values.has(id)) {
      values.set(id, field(point(i, j, k)).value - threshold)
    }
    return values.get(id)
  }
  const verts = []
  const vnormals = []
  const index = new Map()
  const vertexOn = (a, b) => {
    const [ka, kb] = [key(...a), key(...b)]
    const id = ka < kb ? `${ka}-${kb}` : `${kb}-${ka}`
    if (!index.has(id)) {
      const [va, vb] = [valueAt(...a), valueAt(...b)]
      const t = va / (va - vb)
      const p = add(point(...a), mul(sub(point(...b), point(...a)), t))
      vnormals.push(unit(mul(field(p).gradient, -1)))
      index.set(id, verts.push(p) - 1)
    }
    return index.get(id)
  }
  const faces = []
  const emit = (ids) => {
    const [a, b, c] = ids.map((id) => verts[id])
    const normal = [
      (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
      (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    ]
    const out = vnormals[ids[0]]
    // Why: a triangle turns outward, down the field's slope, whatever order the case gives.
    faces.push(
      normal[0] * out[0] + normal[1] * out[1] + normal[2] * out[2] >= 0 ? ids : ids.toReversed()
    )
  }
  for (let i = 0; i < counts[0]; i += 1) {
    for (let j = 0; j < counts[1]; j += 1) {
      for (let k = 0; k < counts[2]; k += 1) {
        const corners = CORNERS.map(([di, dj, dk]) => [i + di, j + dj, k + dk])
        for (const tet of TETS) {
          const pts = tet.map((c) => corners[c])
          const inside = pts.map((p) => valueAt(...p) > 0)
          const ins = pts.filter((_, m) => inside[m])
          const outs = pts.filter((_, m) => !inside[m])
          if (ins.length === 1 || ins.length === 3) {
            const [lone, others] = ins.length === 1 ? [ins[0], outs] : [outs[0], ins]
            emit(others.map((other) => vertexOn(lone, other)))
          } else if (ins.length === 2) {
            const [a, b] = ins
            const [c, d] = outs
            const quad = [vertexOn(a, c), vertexOn(a, d), vertexOn(b, d), vertexOn(b, c)]
            emit([quad[0], quad[1], quad[2]])
            emit([quad[0], quad[2], quad[3]])
          }
        }
      }
    }
  }
  // Why: marching cells leave a faint ripple; relax each vertex toward its neighbours, then put
  // it back on the surface along the field's slope, so outlines and bands run smooth.
  const neighbours = verts.map(() => new Set())
  for (const ids of faces) {
    ids.forEach((id, k) => {
      neighbours[id].add(ids[(k + 1) % 3])
      neighbours[id].add(ids[(k + 2) % 3])
    })
  }
  for (let pass = 0; pass < 3; pass += 1) {
    const moved = verts.map((p, id) => {
      const around = [...neighbours[id]]
      const mean = around
        .reduce((sum, other) => add(sum, verts[other]), [0, 0, 0])
        .map((v) => v / (around.length || 1))
      let q = add(p, mul(sub(mean, p), 0.5))
      for (let step = 0; step < 2; step += 1) {
        const { value, gradient } = field(q)
        const g2 = gradient[0] ** 2 + gradient[1] ** 2 + gradient[2] ** 2 || 1
        q = sub(q, mul(gradient, (value - threshold) / g2))
      }
      return q
    })
    moved.forEach((q, id) => {
      verts[id] = q
    })
  }
  verts.forEach((p, id) => {
    vnormals[id] = unit(mul(field(p).gradient, -1))
  })
  return { verts, faces, vnormals }
}
