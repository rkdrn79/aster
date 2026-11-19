// Drawn objects for biology, in the house style: a cell, a ball-and-stick molecule, a DNA
// double helix, a tissue section and a lab mouse. Front-view drawings sit on a plane facing
// the viewer, so they move and scale with the rest of a scene; light from the upper left.
import { VIEWS } from './research-figures-illustration-iso.mjs'
import { circlePoints } from './research-figures-illustration-svg.mjs'

const TAU = Math.PI * 2

/**
 * A plane facing the viewer through `origin`: `at(u, v)` is the world point drawn u screen
 * units right and v down from it, `face` a decal surface on it.
 */
export function frontPlane(b, origin = [0, 0, 0]) {
  // Why the view's rows, not b.project: a placed object's scale must also scale its drawing.
  const rows = VIEWS[b.view] ?? VIEWS.iso
  const screen = (p) => [0, 1].map((row) => rows[row].reduce((sum, k, i) => sum + k * p[i], 0))
  const a = screen([1, -1, 0])
  const c = screen([0, 0, 1])
  const det = a[0] * c[1] - a[1] * c[0]
  const solve = ([tx, ty]) => {
    const s = (tx * c[1] - ty * c[0]) / det
    const t = (a[0] * ty - a[1] * tx) / det
    return [s, -s, t]
  }
  const U = solve([1, 0])
  const V = solve([0, 1])
  const at = (u, v) => [
    origin[0] + U[0] * u + V[0] * v,
    origin[1] + U[1] * u + V[1] * v,
    origin[2] + U[2] * u + V[2] * v
  ]
  return { at, face: b.surface(origin, U, V) }
}

/** A closed Catmull-Rom curve through control points, sampled `steps` per span. */
function smooth(points, steps = 8) {
  const n = points.length
  const out = []
  for (let i = 0; i < n; i += 1) {
    const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((k) => points[(i + k + n) % n])
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps
      const t2 = t * t
      const t3 = t2 * t
      out.push(
        [0, 1].map(
          (axis) =>
            0.5 *
            (2 * p1[axis] +
              (-p0[axis] + p2[axis]) * t +
              (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2 +
              (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3)
        )
      )
    }
  }
  return out
}

/** A wobbly blob around (cx, cy): the outline of a cell or a membrane. */
function blob(cx, cy, r, { stretch = 1.12, wobble = 1, phase = 0 } = {}) {
  return Array.from({ length: 96 }, (_, i) => {
    const t = (i / 96) * TAU
    const k =
      1 + wobble * (0.035 * Math.sin(3 * t + 0.6 + phase) + 0.022 * Math.sin(5 * t + 2 + phase))
    return [cx + Math.cos(t) * r * k * stretch, cy + Math.sin(t) * r * k]
  })
}

/** Points of a capsule (a rounded bar) centred at (cx, cy), `length` long, turned `angle`°. */
function capsule(cx, cy, length, r, angle) {
  const a = (angle * Math.PI) / 180
  const dx = Math.cos(a) * (length / 2 - r)
  const dy = Math.sin(a) * (length / 2 - r)
  const deg = angle
  return [
    ...circlePoints(cx + dx, cy + dy, r, { from: deg - 90, to: deg + 90, segments: 32 }),
    ...circlePoints(cx - dx, cy - dy, r, { from: deg + 90, to: deg + 270, segments: 32 })
  ]
}

/** A eukaryotic cell seen from the front: membrane, cytoplasm, nucleus, mitochondria, vesicles. */
function cell(b, { organelles = true } = {}) {
  const { at, face } = frontPlane(b, [0, 0, 30])
  face.polygon(blob(0, 0, 30), { role: 'accent', tone: 3, outline: true })
  face.polygon(blob(0, 0, 27.6), { role: 'accent', tone: 2 })
  face.polygon(blob(-1.6, -1.8, 25.4, { stretch: 1.1 }), { role: 'accent', tone: 1 })
  if (organelles) {
    for (const [u, v, r, from, to] of [
      [-6, -3, 16.5, 150, 250],
      [-6, -3, 19, 170, 230],
      [-6, -3, 16.5, 290, 350]
    ]) {
      face.line(circlePoints(u, v, r, { from, to, segments: 24 }), {
        role: 'accent',
        tone: 3,
        weight: 1.3
      })
    }
    for (const [u, v, angle] of [
      [17, 9, 32],
      [6, 19, -14],
      [19, -10, 72],
      [-18, 13, -38]
    ]) {
      face.polygon(capsule(u, v, 10.5, 2.7, angle), { role: 'accent', tone: 5, outline: true })
      const a = (angle * Math.PI) / 180
      const zig = Array.from({ length: 7 }, (_, i) => {
        const s = -3.3 + i * 1.1
        const side = i % 2 ? 1.1 : -1.1
        return [u + Math.cos(a) * s - Math.sin(a) * side, v + Math.sin(a) * s + Math.cos(a) * side]
      })
      face.line(zig, { role: 'accent', tone: 2, weight: 0.8 })
    }
    for (const [u, v, r] of [
      [12, -17, 2.3],
      [22, 2, 1.7],
      [-20, -6, 1.9],
      [-10, 20, 2.1],
      [4, -21, 1.4]
    ]) {
      face.circle(u, v, r, { role: 'accent', tone: 4, outline: true })
    }
    for (const [u, v] of [
      [9, -8],
      [12, 2],
      [-2, 13],
      [-15, 3],
      [14, 14],
      [-6, -19],
      [21, -4],
      [1, 22],
      [-22, 8]
    ]) {
      face.circle(u, v, 0.7, { role: 'accent', tone: 6 })
    }
  }
  b.sphere({ at: at(-6, -3), r: 11.5, role: 'second', tone: 2, highlight: false })
  b.sphere({ at: at(-9, -6), r: 3.6, role: 'second', tone: 6, highlight: false, outline: false })
}

/** Atoms (element, x, y, z in ångström) and bonds of the preset molecules. */
function moleculeAtoms(preset) {
  if (preset === 'small') {
    return {
      atoms: [
        ['C', 0, 0, 0],
        ['C', 1.52, 0, 0],
        ['O', 2.05, 1.32, 0],
        ['H', -0.39, -1.02, 0],
        ['H', -0.39, 0.51, 0.89],
        ['H', -0.39, 0.51, -0.89],
        ['H', 1.9, -0.51, 0.89],
        ['H', 1.9, -0.51, -0.89],
        ['H', 3.01, 1.27, 0]
      ],
      bonds: [
        [0, 1],
        [1, 2],
        [0, 3],
        [0, 4],
        [0, 5],
        [1, 6],
        [1, 7],
        [2, 8]
      ]
    }
  }
  // Phenol: a ring of six carbons, five hydrogens and a hydroxyl.
  const atoms = []
  const bonds = []
  for (let i = 0; i < 6; i += 1) {
    const t = (i / 6) * TAU
    atoms.push(['C', Math.cos(t) * 1.39, Math.sin(t) * 1.39, 0])
    bonds.push([i, (i + 1) % 6, i % 2 === 0 ? 2 : 1])
  }
  for (let i = 0; i < 6; i += 1) {
    const t = (i / 6) * TAU
    const r = i === 0 ? 2.75 : 2.47
    atoms.push([i === 0 ? 'O' : 'H', Math.cos(t) * r, Math.sin(t) * r, 0])
    bonds.push([i, atoms.length - 1, 1])
  }
  atoms.push(['H', 3.2, 0.85, 0])
  bonds.push([6, atoms.length - 1, 1])
  return { atoms, bonds }
}

const ATOM_LOOK = {
  C: { role: 'accent', tone: 4, r: 0.6 },
  O: { role: 'second', tone: 4, r: 0.58 },
  N: { role: 'accent', tone: 7, r: 0.58 },
  H: { role: 'neutral', tone: 1, r: 0.38 }
}

/** A ball-and-stick molecule, atoms and bonds drawn back to front. */
function molecule(b, { preset = 'medium', turn = 120, tilt = 40, shadow = true } = {}) {
  const { atoms, bonds } = moleculeAtoms(preset === 'small' ? 'small' : 'medium')
  const s = 5.2
  const yaw = (turn * Math.PI) / 180
  const pitch = (tilt * Math.PI) / 180
  const cx = atoms.reduce((sum, a) => sum + a[1], 0) / atoms.length
  const cy = atoms.reduce((sum, a) => sum + a[2], 0) / atoms.length
  const lift = 14
  const place = ([, x, y, z]) => {
    const px = x - cx
    const py = (y - cy) * Math.cos(pitch) - z * Math.sin(pitch)
    const pz = (y - cy) * Math.sin(pitch) + z * Math.cos(pitch)
    return [
      16 + s * (px * Math.cos(yaw) - py * Math.sin(yaw)),
      16 + s * (px * Math.sin(yaw) + py * Math.cos(yaw)),
      lift + s * pz
    ]
  }
  const points = atoms.map(place)
  if (shadow) {
    const span = Math.max(...points.map((p) => Math.hypot(p[0] - 16, p[1] - 16)))
    b.roundShadow({ at: [16, 16], r: span * 0.45, z: 0, offset: 0, tone: 2 })
  }
  const items = [
    ...points.map((p, i) => ({ depth: b.depth(p), atom: i })),
    ...bonds.map(([i, j, order = 1]) => ({
      depth: b.depth(points[i].map((v, k) => (v + points[j][k]) / 2)) - 0.01,
      bond: [i, j, order]
    }))
  ].sort((x, y) => x.depth - y.depth)
  for (const item of items) {
    if (item.bond) {
      const [i, j, order] = item.bond
      const p = points[i]
      const q = points[j]
      if (order === 2) {
        const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]
        const side = [-d[1], d[0], 0]
        const k = 0.8 / (Math.hypot(...side) || 1)
        for (const sign of [-1, 1]) {
          const o = side.map((v) => v * k * sign)
          b.tube({
            from: p.map((v, n) => v + o[n]),
            to: q.map((v, n) => v + o[n]),
            r: 0.5,
            role: 'neutral',
            tone: 4
          })
        }
      } else {
        b.tube({ from: p, to: q, r: 0.8, role: 'neutral', tone: 4 })
      }
    } else {
      const look = ATOM_LOOK[atoms[item.atom][0]] ?? ATOM_LOOK.C
      b.sphere({ at: points[item.atom], r: look.r * s, role: look.role, tone: look.tone })
    }
  }
}

/** A DNA double helix seen from the side: backbones front and back, base pairs between. */
function dna(b, { turns = 2, vertical = false } = {}) {
  const P = 32
  const A = 10
  const L = P * turns
  const plane = frontPlane(b, [0, 0, 30])
  const place = ([x, y]) => (vertical ? [y, x] : [x, y])
  const strands = [
    { phase: 0, role: 'accent' },
    { phase: Math.PI * 0.72, role: 'second' }
  ]
  const centre = (x, phase) => [x, A * Math.sin((TAU * x) / P + phase)]
  const depthAt = (x, phase) => Math.cos((TAU * x) / P + phase)
  const ribbon = (x0, x1, phase) => {
    const n = Math.max(2, Math.ceil((x1 - x0) / 0.8))
    const left = []
    const right = []
    for (let i = 0; i <= n; i += 1) {
      const x = x0 + ((x1 - x0) * i) / n
      const [cx, cy] = centre(x, phase)
      const slope = ((A * TAU) / P) * Math.cos((TAU * x) / P + phase)
      const len = Math.hypot(1, slope)
      const w = 1.7 * (1 + 0.18 * depthAt(x, phase))
      left.push([cx - (slope / len) * w, cy + (1 / len) * w])
      right.push([cx + (slope / len) * w, cy - (1 / len) * w])
    }
    return [...left, ...right.toReversed()].map(place)
  }
  // Pieces of each strand between depth sign changes: back pieces first, front pieces last.
  const pieces = []
  for (const strand of strands) {
    const cuts = [0]
    for (let k = -2; k < 2 * turns + 2; k += 1) {
      const x = ((k + 0.5) * Math.PI - strand.phase) * (P / TAU)
      if (x > 0 && x < L) {
        cuts.push(x)
      }
    }
    cuts.push(L)
    cuts.sort((p, q) => p - q)
    for (let i = 0; i < cuts.length - 1; i += 1) {
      const mid = (cuts[i] + cuts[i + 1]) / 2
      pieces.push({
        ...strand,
        x0: cuts[i],
        x1: cuts[i + 1],
        front: depthAt(mid, strand.phase) > 0
      })
    }
  }
  for (const piece of pieces.filter((p) => !p.front)) {
    plane.face.polygon(ribbon(piece.x0, piece.x1, piece.phase), {
      role: piece.role,
      tone: 2,
      outline: true
    })
  }
  for (let x = P / 20; x < L; x += P / 10) {
    const y1 = centre(x, strands[0].phase)[1]
    const y2 = centre(x, strands[1].phase)[1]
    if (Math.abs(y1 - y2) < 3) {
      continue
    }
    const mid = (y1 + y2) / 2
    const half = (from, to, role, tone) => {
      const top = Math.min(from, to)
      const points = [
        [x - 0.5, top],
        [x + 0.5, top],
        [x + 0.5, top + Math.abs(to - from)],
        [x - 0.5, top + Math.abs(to - from)]
      ].map(place)
      plane.face.polygon(points, { role, tone })
    }
    half(y1, mid, 'neutral', 2)
    half(mid, y2, 'neutral', 4)
  }
  for (const piece of pieces.filter((p) => p.front)) {
    plane.face.polygon(ribbon(piece.x0, piece.x1, piece.phase), {
      role: piece.role,
      tone: 4,
      outline: true
    })
  }
}

/** A tissue section as a slab: layers on its cut faces, cells on its surface. */
function tissue(b, { size = 30 } = {}) {
  const S = size
  b.shadow({ at: [0, 0], size: [S, S], radius: 1.5, spread: 1.5, offset: 3 })
  const lower = b.box({ at: [0, 0, 0], size: [S, S, 6], radius: 0.8, role: 'accent', tone: 1 })
  const upper = b.box({ at: [0, 0, 6], size: [S, S, 4], radius: 0.8, role: 'second', tone: 1 })
  for (const face of [lower.left, lower.right]) {
    for (let i = 0; i < 9; i += 1) {
      face.circle(2 + ((i * 7.3) % (S - 4)), 1.6 + ((i * 2.9) % 3.2), 0.55, {
        role: 'accent',
        tone: 5
      })
    }
  }
  for (const face of [upper.left, upper.right]) {
    for (let i = 0; i < 12; i += 1) {
      face.circle(1.8 + i * ((S - 3.6) / 11), 2, 0.85, { role: 'second', tone: 4 })
    }
  }
  const step = S / 7
  for (let row = 0; row < 7; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      const u = step * (col + 0.5) + (row % 2 ? step * 0.25 : -step * 0.25)
      const v = step * (row + 0.5)
      if (u < 1.6 || u > S - 1.6) {
        continue
      }
      upper.top.circle(u, v, step * 0.42, { role: 'second', tone: 2 })
      upper.top.circle(u, v, step * 0.15, { role: 'second', tone: 5 })
    }
  }
}

/** The part of a closed polygon below the curve v = cut(u) (screen y down). */
function below(points, cut) {
  const out = []
  const f = ([u, v]) => v - cut(u)
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length]
    const inP = f(p) >= 0
    const inQ = f(q) >= 0
    if (inP) {
      out.push(p)
    }
    if (inP !== inQ) {
      const t = f(p) / (f(p) - f(q))
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
    }
  })
  return out
}

/** A lab mouse seen from the side, facing right: two tones, ear, eye, tail. */
function mouse(b, { facing = 'right' } = {}) {
  const { at, face } = frontPlane(b, [0, 0, 12])
  const flip = facing === 'left' ? -1 : 1
  const pts = (list) => list.map(([u, v]) => [u * flip, v])
  const ground = at(1, 9.4)
  b.roundShadow({ at: [ground[0], ground[1]], z: ground[2], r: 8.5, offset: 0.6, tone: 2 })
  face.line(
    pts(
      smooth(
        [
          [-14, 5],
          [-21, 4.5],
          [-26, 1],
          [-28, -4],
          [-26.5, -7.5]
        ],
        6
      ).slice(0, 26)
    ),
    { role: 'skin', tone: 4, weight: 1.6 }
  )
  const body = smooth(
    [
      [-15, 5.5],
      [-16.5, -1],
      [-12.5, -7.2],
      [-4, -9.6],
      [4.5, -8.6],
      [10.5, -6],
      [15, -2.8],
      [19.2, 1.4],
      [16.8, 3.6],
      [10, 5.4],
      [2, 7.2],
      [-8, 7.6]
    ],
    8
  )
  for (const [u, v] of [
    [-10, 7.6],
    [7, 6.6]
  ]) {
    face.polygon(pts(capsule(u, v + 1.2, 5, 1.2, 0)), { role: 'skin', tone: 3, outline: true })
  }
  face.polygon(pts(body), { role: 'neutral', tone: 2, outline: true })
  face.polygon(pts(below(body, (u) => 3.4 - 0.004 * (u - 2) ** 2)), { role: 'neutral', tone: 3 })
  face.circle(5 * flip, -8.4, 3.3, { role: 'neutral', tone: 2, outline: true })
  face.circle(5.3 * flip, -8.2, 2, { role: 'skin', tone: 2 })
  face.circle(12.8 * flip, -2.8, 0.85, { role: 'ink' })
  face.circle(18.9 * flip, 1.4, 0.8, { role: 'skin', tone: 4 })
}

export const BIO_OBJECTS = {
  cell: {
    title: 'Cell (eukaryotic, cross-section)',
    tags: [
      'cell',
      'biology',
      'eukaryotic',
      'nucleus',
      'mitochondria',
      'single-cell',
      'cytology',
      'organelle'
    ],
    roles: { accent: 'membrane, cytoplasm and organelles', second: 'nucleus' },
    options: [['organelles', true, 'mitochondria, vesicles and ribosomes']],
    draw: cell
  },
  molecule: {
    title: 'Molecule (ball and stick)',
    tags: [
      'molecule',
      'chemistry',
      'atom',
      'compound',
      'drug',
      'ligand',
      'ball and stick',
      'small molecule'
    ],
    roles: { accent: 'carbon', second: 'oxygen', neutral: 'hydrogen and bonds' },
    options: [
      ['preset', 'medium', 'small (ethanol) | medium (phenol)'],
      ['turn', 120, 'turn about the vertical, degrees'],
      ['tilt', 40, 'tilt of the molecule toward the viewer, degrees'],
      ['shadow', true, 'a soft shadow on the ground under it']
    ],
    draw: molecule
  },
  dna: {
    title: 'DNA double helix',
    tags: [
      'dna',
      'helix',
      'genome',
      'genomics',
      'gene',
      'sequence',
      'nucleotide',
      'rna',
      'genetic'
    ],
    roles: { accent: 'one backbone', second: 'the other backbone', neutral: 'base pairs' },
    options: [
      ['turns', 2, 'helical turns (1–4)'],
      ['vertical', false, 'run the helix up instead of across']
    ],
    draw: dna
  },
  tissue: {
    title: 'Tissue section',
    tags: [
      'tissue',
      'section',
      'histology',
      'slice',
      'biopsy',
      'skin',
      'layers',
      'pathology',
      'sample'
    ],
    roles: { second: 'upper layer and its cells', accent: 'lower layer' },
    options: [['size', 30, 'side of the slab']],
    draw: tissue
  },
  mouse: {
    title: 'Lab mouse',
    tags: [
      'mouse',
      'rodent',
      'animal',
      'in vivo',
      'model organism',
      'lab',
      'neuroscience',
      'experiment'
    ],
    roles: { neutral: 'fur', skin: 'ears, feet, nose and tail' },
    options: [['facing', 'right', 'right | left']],
    draw: mouse
  }
}
