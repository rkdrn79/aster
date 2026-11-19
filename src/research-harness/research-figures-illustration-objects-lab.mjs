// Drawn objects for the wet lab, in the house style: a microscope, a petri dish, a test-tube
// rack, a benchtop sequencer and a hand pipette. Built from the illustration builder's iso
// primitives at the origin, about a centimetre per unit, fronts on the lit (+y) side.
import { VIEWS } from './research-figures-illustration-iso.mjs'
import { circlePoints } from './research-figures-illustration-svg.mjs'

const ring = (cx, cy, z, r, segments = 64) =>
  [...circlePoints(cx, cy, r, { segments }), circlePoints(cx, cy, r, { segments })[0]].map(
    ([x, y]) => [x, y, z]
  )

/** An upright light microscope: base, pillar and head, stage with a slide, objective, eyepiece. */
function microscope(b, { slide = true } = {}) {
  b.shadow({ at: [0, 0], size: [16, 22], radius: 3, spread: 1.5, offset: 3 })
  b.box({ at: [0, 0, 0], size: [16, 22, 3.2], radius: 2.6, role: 'neutral', tone: 1 })
  b.cylinder({ at: [8, 15, 3.2], r: 2.6, h: 1.2, role: 'neutral', tone: 6 })
  b.cylinder({ at: [8, 15, 4.4], r: 1.7, h: 0.4, role: 'accent', tone: 2 })
  b.box({ at: [5, 1.5, 3.2], size: [6, 6.5, 30], radius: 1.6, role: 'neutral', tone: 1 })
  b.cylinder({ at: [11, 4.8, 11], r: 3, h: 1.4, axis: 'x', role: 'neutral', tone: 7 })
  b.cylinder({ at: [12.4, 4.8, 11], r: 1.7, h: 1, axis: 'x', role: 'neutral', tone: 5 })
  b.box({ at: [6, 7.5, 11.4], size: [4, 2.5, 2.4], radius: 0.6, role: 'neutral', tone: 6 })
  const stage = b.box({
    at: [2, 9, 13.8],
    size: [12, 11.5, 1.3],
    radius: 1,
    role: 'neutral',
    tone: 7
  })
  stage.top.circle(6, 6.5, 1.4, { role: 'neutral', tone: 9 })
  if (slide) {
    stage.top.rect(1.2, 4.7, 9.6, 3.6, { radius: 0.3, role: 'white' })
    stage.top.circle(6, 6.5, 1.1, { role: 'accent', tone: 4 })
    stage.top.rect(1.2, 4.7, 2.4, 3.6, { radius: 0.3, role: 'neutral', tone: 2 })
  }
  b.box({ at: [4.6, 2, 30], size: [6.8, 15.5, 5], radius: 2, role: 'neutral', tone: 1 })
  b.cylinder({ at: [8, 14, 26.8], r: 3.1, h: 3.2, role: 'neutral', tone: 2 })
  b.cylinder({ at: [8, 14, 20.4], r: 1.25, h: 6.4, role: 'metal', tone: 1 })
  b.cylinder({ at: [8, 14, 23.6], r: 1.32, h: 0.9, role: 'accent', tone: 4 })
  b.tube({ from: [8, 6.5, 35], to: [8, 11.5, 42], r: 1.75, role: 'neutral', tone: 1 })
  b.tube({ from: [8, 11.5, 42], to: [8, 12.6, 43.6], r: 1.95, role: 'neutral', tone: 7 })
}

/** An open glass petri dish on its lid, agar in the second colour, colonies in the accent. */
function petriDish(b, { colonies = 9, lid = true } = {}) {
  const R = 10
  b.roundShadow({ at: [R, R], r: R + 1.2, offset: 1.6 })
  if (lid) {
    b.cylinder({ at: [R, R, 0], r: R + 0.5, h: 0.9, role: 'neutral', tone: 1 })
  }
  const z = lid ? 0.9 : 0
  b.cylinder({ at: [R, R, z], r: R, h: 1.9, role: 'neutral', tone: 0, top: false })
  const agar = b.cylinder({ at: [R, R, z + 0.3], r: R - 0.45, h: 1.05, role: 'second', tone: 1 })
  const spots = [
    [6.2, 7.2, 1.5],
    [11.8, 5.6, 1.1],
    [13.6, 10.8, 1.7],
    [8.6, 12.6, 1.2],
    [5.4, 11.6, 0.8],
    [10.4, 9.2, 0.7],
    [14.2, 14.6, 0.9],
    [9.6, 16, 1.4],
    [4.4, 15, 0.9],
    [15.8, 7.8, 0.7],
    [12.2, 13.8, 0.6]
  ]
  spots.slice(0, Math.max(0, Math.min(spots.length, colonies))).forEach(([u, v, r], index) => {
    const pale = index % 4 === 3
    agar.top.circle(u - 0.45, v - 0.45, r, { role: pale ? 'second' : 'accent', tone: pale ? 3 : 4 })
    agar.top.circle(u - 0.45 - r * 0.18, v - 0.45 - r * 0.18, r * 0.55, {
      role: pale ? 'second' : 'accent',
      tone: pale ? 2 : 3
    })
  })
  b.line(ring(R, R, z + 1.9, R - 0.1), { role: 'neutral', tone: 4, weight: 0.8 })
}

/** A rack of test tubes, the liquids in the accent and second colours. */
function testTubes(
  b,
  { count = 4, liquids = ['accent', 'second', 'accent', 'neutral'], caps = false } = {}
) {
  const n = Math.max(1, Math.min(5, count))
  const W = 6.5 * n + 4
  const D = 8
  b.shadow({ at: [0, 0], size: [W, D], radius: 1.2, spread: 1.2, offset: 2.4 })
  b.box({ at: [0, 0, 0], size: [W, D, 1.4], radius: 0.8, role: 'neutral', tone: 2 })
  b.box({ at: [0, 1.5, 1.4], size: [1.4, 5, 8.6], radius: 0.4, role: 'neutral', tone: 2 })
  const xs = Array.from({ length: n }, (_, i) => 5 + i * 6.5)
  const level = (i) => 13 + ((i * 3) % 4)
  const liquidRole = (i) => liquids[i % liquids.length] ?? 'accent'
  const tube = (x, i, z0, z1, below) => {
    b.cylinder({ at: [x, D / 2, z0], r: 1.65, h: z1 - z0, role: 'neutral', tone: 0, top: !below })
    const top = Math.min(z1 - (below ? 0 : 0.6), below ? z1 : level(i))
    if (top > z0 + 0.3 && liquidRole(i) !== 'none') {
      const liquid = liquidRole(i)
      b.cylinder({
        at: [x, D / 2, z0 + 0.3],
        r: 1.3,
        h: top - z0 - 0.3,
        role: liquid,
        tone: liquid === 'neutral' ? 2 : 3,
        top: !below
      })
    }
  }
  xs.forEach((x, i) => tube(x, i, 1.4, 8, true))
  const plate = b.box({ at: [0, 0, 8], size: [W, D, 1.3], radius: 0.8, role: 'neutral', tone: 1 })
  xs.forEach((x) => plate.top.circle(x, D / 2, 1.75, { role: 'neutral', tone: 4 }))
  b.box({ at: [W - 1.4, 1.5, 1.4], size: [1.4, 5, 6.6], radius: 0.4, role: 'neutral', tone: 2 })
  xs.forEach((x, i) => {
    tube(x, i, 9.3, 20, false)
    if (caps) {
      b.cylinder({
        at: [x, D / 2, 20],
        r: 1.9,
        h: 1.6,
        role: liquidRole(i) === 'neutral' ? 'neutral' : liquidRole(i),
        tone: 5
      })
    }
  })
}

/** A benchtop sequencer: white body, tinted door, a touchscreen and a flow-cell slot. */
function sequencer(b, { screen = true } = {}) {
  const W = 44
  const D = 30
  const H = 26
  b.shadow({ at: [0, 0], size: [W, D], radius: 2.5, spread: 2, offset: 4 })
  b.box({ at: [0, 0, 0], size: [W, D, 1.6], radius: 2.4, role: 'neutral', tone: 4 })
  const body = b.box({
    at: [0, 0, 1.6],
    size: [W, D, H - 4],
    radius: 2.4,
    role: 'neutral',
    tone: 0
  })
  const lid = b.box({
    at: [0, 0, H - 2.4],
    size: [W, D, 3.2],
    radius: 2.4,
    role: 'neutral',
    tone: 1
  })
  lid.top.rect(4, 4, W - 8, D - 8, { radius: 2, role: 'neutral', tone: 2 })
  const front = body.left
  front.rect(2.5, 2.2, 24, H - 8.2, { radius: 1.6, role: 'neutral', tone: 7 })
  front.rect(4, 3.6, 3.2, H - 11, { radius: 1, role: 'neutral', tone: 6 })
  front.rect(2.5, H - 5.2, W - 5, 1.2, { radius: 0.6, role: 'accent', tone: 3 })
  if (screen) {
    front.rect(29.5, 2.2, 12, 8.5, { radius: 1, role: 'neutral', tone: 8 })
    front.rect(30.5, 3.2, 10, 1.2, { radius: 0.5, role: 'accent', tone: 4 })
    front.rect(30.5, 5.4, 6.5, 0.9, { radius: 0.45, role: 'neutral', tone: 5 })
    front.rect(30.5, 7.2, 8, 0.9, { radius: 0.45, role: 'neutral', tone: 5 })
  }
  front.rect(29.5, 12.6, 12, 2.2, { radius: 1, role: 'neutral', tone: 6 })
  front.rect(30.6, 13.25, 5, 0.9, { radius: 0.45, role: 'accent', tone: 2 })
  front.circle(40, 13.7, 0.55, { role: 'accent', tone: 5 })
}

/** A hand pipette held upright, a disposable tip with a drop of sample in the accent. */
function pipette(b, { tilt = 12, sample = true } = {}) {
  const t = (tilt * Math.PI) / 180
  // Why its own axis: a pipette is held slanted; points are laid along it and lifted to z.
  const at = (s, side = 0) => [
    Math.sin(t) * s + side * Math.cos(t),
    2,
    4 + Math.cos(t) * s - side * Math.sin(t)
  ]
  const tipTop = b.project(at(6))
  const tipEnd = b.project(at(-6))
  const dx = tipEnd[0] - tipTop[0]
  const dy = tipEnd[1] - tipTop[1]
  const len = Math.hypot(dx, dy)
  const n = [-dy / len, dx / len]
  // Why measured: the tip is drawn on screen, so it takes the placed scale from the projection.
  const rows = VIEWS[b.view] ?? VIEWS.iso
  const o = b.project([0, 0, 0])
  const x1 = b.project([1, 0, 0])
  const k = Math.hypot(x1[0] - o[0], x1[1] - o[1]) / Math.hypot(rows[0][0], rows[1][0])
  const cone = (from, to, r0, r1) => [
    [from[0] + n[0] * r0, from[1] + n[1] * r0],
    [to[0] + n[0] * r1, to[1] + n[1] * r1],
    [to[0] - n[0] * r1, to[1] - n[1] * r1],
    [from[0] - n[0] * r0, from[1] - n[1] * r0]
  ]
  b.flat.fill(cone(tipTop, tipEnd, 1.15 * k, 0.28 * k), { role: 'neutral', tone: 2 })
  if (sample) {
    const mid = [tipTop[0] + dx * 0.72, tipTop[1] + dy * 0.72]
    b.flat.fill(cone(mid, [tipEnd[0] - dx * 0.02, tipEnd[1] - dy * 0.02], 0.48 * k, 0.2 * k), {
      role: 'accent',
      tone: 3,
      outline: false
    })
  }
  b.tube({ from: at(6), to: at(13), r: 0.95, role: 'metal', tone: 1 })
  b.tube({ from: at(11), to: at(15), r: 1.35, role: 'neutral', tone: 2 })
  b.tube({ from: at(15), to: at(30), r: 2.6, role: 'neutral', tone: 1 })
  b.tube({ from: at(26, 1.8), to: at(24.2, 5.4), r: 1.1, role: 'neutral', tone: 2 })
  b.tube({ from: at(15.6), to: at(18.4), r: 2.72, role: 'neutral', tone: 3 })
  b.tube({ from: at(21.5, -0.5), to: at(25, -0.5), r: 0.95, role: 'neutral', tone: 7 })
  b.tube({ from: at(30), to: at(33), r: 0.7, role: 'metal', tone: 2 })
  b.tube({ from: at(33.2, -0.1), to: at(33.2, 0.1), r: 1.6, role: 'accent', tone: 3 })
}

export const LAB_OBJECTS = {
  microscope: {
    title: 'Light microscope',
    tags: [
      'microscope',
      'microscopy',
      'imaging',
      'lab',
      'biology',
      'histology',
      'pathology',
      'slide'
    ],
    roles: {
      neutral: 'body, stage and knobs',
      accent: 'the sample, the lamp and the objective ring',
      metal: 'objective'
    },
    options: [['slide', true, 'a glass slide with a sample on the stage']],
    draw: microscope
  },
  'petri-dish': {
    title: 'Petri dish with colonies',
    tags: [
      'petri',
      'dish',
      'culture',
      'colony',
      'bacteria',
      'agar',
      'microbiology',
      'lab',
      'sample'
    ],
    roles: { neutral: 'glass and lid', second: 'agar', accent: 'colonies' },
    options: [
      ['colonies', 9, 'colonies on the agar (0–11)'],
      ['lid', true, 'the dish stands on its lid']
    ],
    draw: petriDish
  },
  'test-tubes': {
    title: 'Test tubes in a rack',
    tags: [
      'test tube',
      'tubes',
      'rack',
      'samples',
      'assay',
      'chemistry',
      'lab',
      'liquid',
      'reagent'
    ],
    roles: { neutral: 'rack and glass', accent: 'liquids', second: 'other liquids' },
    options: [
      ['count', 4, 'tubes in the rack (1–5)'],
      [
        'liquids',
        "['accent', 'second', 'accent', 'neutral']",
        "each tube's liquid role, in order ('none' for empty)"
      ],
      ['caps', false, 'a cap on each tube']
    ],
    draw: testTubes
  },
  sequencer: {
    title: 'Benchtop DNA sequencer',
    tags: [
      'sequencer',
      'sequencing',
      'genomics',
      'dna',
      'rna',
      'instrument',
      'illumina',
      'ngs',
      'lab'
    ],
    roles: { neutral: 'body and door', accent: 'status stripe, screen and flow cell' },
    options: [['screen', true, 'a touchscreen beside the door']],
    draw: sequencer
  },
  pipette: {
    title: 'Hand pipette',
    tags: [
      'pipette',
      'pipetting',
      'liquid handling',
      'sample',
      'assay',
      'lab',
      'wet lab',
      'experiment'
    ],
    roles: { neutral: 'body and grip', metal: 'shaft', accent: 'plunger and sample' },
    options: [
      ['tilt', 12, 'slant from upright, degrees'],
      ['sample', true, 'a drop of sample in the tip']
    ],
    draw: pipette
  }
}
