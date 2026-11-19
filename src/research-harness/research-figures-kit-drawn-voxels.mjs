// The drawn voxel grid (research-figures-drawn): a sparse grid of cells in the family's oblique
// view, the occupied cells' edges dashed with a coloured dot at every corner they use (Plenoxels),
// translucent cubes with only their outside faces (PerAct), highlighted voxels in the accent.
import {
  FACE_SHADE,
  boxOf,
  depthOffset,
  drawnParts,
  ramp,
  roleTones,
  shade
} from './research-figures-drawn.mjs'
import { DIMENSION_ROLES, knownRole } from './research-figures-kit-drawn-systems.mjs'

const num = (value, fallback) => (Number.isFinite(value) ? value : fallback)

export function drawnVoxelMethods(core) {
  const style = () => core.styled({}).style
  const finish = (spec, elements, box, extra = {}) => {
    const parts = drawnParts(spec, style())
    core.add([parts.holder(box), ...elements], spec.id)
    return { id: spec.id, ...box, ...extra }
  }
  return {
    /**
     * A voxel grid (Plenoxels, PerAct): n = [nx, ny, nz] cells of `cell` units, occupied ones as
     * translucent cubes, the lattice of their edges dashed, a dot on every corner they use
     * (coloured, like spherical-harmonic coefficients) and highlighted voxels in the accent.
     */
    voxelGrid(spec) {
      const s = style()
      const parts = drawnParts(spec, s)
      const [nx, ny, nz] = Array.isArray(spec.n)
        ? spec.n
        : [num(spec.n, 3), num(spec.n, 3), num(spec.n, 3)]
      const cell = num(spec.cell, 26)
      const [dx, dy] = depthOffset(cell, spec.view)
      const x0 = num(spec.x, 0)
      const y0 = num(spec.y, 0) + nz * cell - ny * dy
      const at = (i, j, k) => [x0 + i * cell + j * dx, y0 - k * cell + j * dy]
      const test =
        spec.occupied === undefined || spec.occupied === 'all'
          ? () => true
          : typeof spec.occupied === 'function'
            ? spec.occupied
            : (i, j, k) => spec.occupied.some(([a, b, c]) => a === i && b === j && c === k)
      const cells = []
      for (let j = ny - 1; j >= 0; j -= 1) {
        for (let k = 0; k < nz; k += 1) {
          for (let i = 0; i < nx; i += 1) {
            if (test(i, j, k)) {
              cells.push([i, j, k])
            }
          }
        }
      }
      const has = (i, j, k) => cells.some(([a, b, c]) => a === i && b === j && c === k)
      const hot = new Set((spec.highlight ?? []).map((c) => c.join(',')))
      const tones = roleTones(s, knownRole(s, spec.role ?? 'c'))
      const hotTones = roleTones(s, knownRole(s, spec.highlightRole ?? 'accent'))
      const opacity = num(spec.opacity, spec.cubes || spec.lattice === false ? 85 : 45)
      const elements = []
      const edges = new Map()
      const edge = (p, q) => {
        const key = [p, q]
          .map((v) => v.join(','))
          .sort()
          .join('|')
        edges.set(key, [p, q])
      }
      for (const [i, j, k] of cells) {
        const corners = [0, 1].flatMap((a) =>
          [0, 1].flatMap((b) => [0, 1].map((c) => [i + a, j + b, k + c]))
        )
        for (const p of corners) {
          for (const q of corners) {
            const diff = p.map((v, axis) => Math.abs(v - q[axis]))
            if (diff.reduce((sum, v) => sum + v, 0) === 1 && p.join() < q.join()) {
              edge(p, q)
            }
          }
        }
      }
      const lattice = spec.lattice ?? (spec.cubes ? false : 'dashed')
      if (lattice) {
        // Why merged: one line per run of edges, so a dash pattern runs on unbroken; and fine,
        // so a focus voxel grid keeps hairline edges in the accent instead of heavy bars.
        for (const [index, [p, q]] of mergeEdges([...edges.values()]).entries()) {
          elements.push(
            parts.line(`${spec.id}-e${index}`, [at(...p), at(...q)], {
              stroke: s.muted,
              width: 1,
              dashed: lattice === 'dashed',
              dotted: lattice === 'dotted',
              fine: true
            })
          )
        }
      }
      const show = spec.cubes ?? spec.lattice === false
      for (const [i, j, k] of cells) {
        const lit = hot.has(`${i},${j},${k}`)
        if (!show && !lit) {
          continue
        }
        const fill = lit ? hotTones.strong : tones.fill
        const id = `${spec.id}-v${i}_${j}_${k}`
        const [fx, fy] = at(i, j, k + 1)
        const faces = [
          [
            'top',
            !has(i, j, k + 1),
            [at(i, j, k + 1), at(i, j + 1, k + 1), at(i + 1, j + 1, k + 1), at(i + 1, j, k + 1)],
            FACE_SHADE.top
          ],
          [
            'side',
            !has(i + 1, j, k),
            [at(i + 1, j, k + 1), at(i + 1, j + 1, k + 1), at(i + 1, j + 1, k), at(i + 1, j, k)],
            FACE_SHADE.side
          ],
          [
            'front',
            !has(i, j - 1, k),
            [
              [fx, fy],
              [fx + cell, fy],
              [fx + cell, fy + cell],
              [fx, fy + cell]
            ],
            0
          ]
        ]
        for (const [name, visible, corners, step] of faces) {
          if (visible || lit) {
            elements.push(
              parts.poly(`${id}-${String(name)}`, corners, {
                fill: shade(fill, step),
                stroke: lit ? hotTones.ink : s.line,
                width: 1,
                opacity: lit ? 75 : opacity,
                shade: step,
                meaning: lit ? 'highlight' : undefined
              })
            )
          }
        }
      }
      if (spec.vertices ?? !show) {
        const roles = (spec.vertexRoles ?? DIMENSION_ROLES).map(
          (role) => roleTones(s, knownRole(s, role)).solid
        )
        const palette =
          roles.length > 1
            ? roles.flatMap((color, index) =>
                ramp(color, roles[(index + 1) % roles.length], 3).slice(0, 2)
              )
            : roles
        const seen = new Set()
        let n = 0
        for (const [p] of [...edges.values()].flatMap(([p, q]) => [[p], [q]])) {
          const key = p.join(',')
          if (seen.has(key)) {
            continue
          }
          seen.add(key)
          const [cx, cy] = at(...p)
          const color = palette[(p[0] * 7 + p[1] * 3 + p[2] * 5) % palette.length]
          elements.push(
            ...parts.dot(
              `${spec.id}-x${key.replace(/,/g, '_')}`,
              cx,
              cy,
              num(spec.vertexR, 2.4),
              color,
              { meaning: 'coefficient' }
            )
          )
          n += 1
        }
      }
      const box = boxOf([
        at(0, 0, 0),
        at(nx, 0, 0),
        at(0, ny, nz),
        at(nx, ny, nz),
        at(0, 0, nz),
        at(nx, ny, 0)
      ])
      return finish(spec, elements, box, {
        point: (i, j, k) => at(i, j, k),
        center: (i, j, k) => at(i + 0.5, j + 0.5, k + 0.5)
      })
    }
  }
}

/** Edges along one grid line joined into runs: [[p, q], …] with p and q integer corners. */
function mergeEdges(edges) {
  const lines = new Map()
  for (const [p, q] of edges) {
    const axis = p.findIndex((value, index) => value !== q[index])
    const key = `${axis}:${p.map((value, index) => (index === axis ? '*' : value)).join(',')}`
    const from = Math.min(p[axis], q[axis])
    lines.set(key, [...(lines.get(key) ?? []), { axis, from, base: p }])
  }
  const runs = []
  for (const segments of lines.values()) {
    const sorted = segments.toSorted((first, second) => first.from - second.from)
    let start = sorted[0]
    let end = start.from + 1
    const close = () => {
      const p = start.base.map((value, index) => (index === start.axis ? start.from : value))
      const q = start.base.map((value, index) => (index === start.axis ? end : value))
      runs.push([p, q])
    }
    for (const segment of sorted.slice(1)) {
      if (segment.from === end) {
        end += 1
      } else {
        close()
        start = segment
        end = segment.from + 1
      }
    }
    close()
  }
  return runs
}
