// Drawn objects for devices and props, in the house style: a globe, books, a chart board on an
// easel, a camera, a monitor and a shipping box. Built like the data objects (iso primitives at
// the origin, about a centimetre per unit, fronts on the lit +y side, contact shadows first).
import { VIEWS } from './research-figures-illustration-iso.mjs'
import {
  screenPlane,
  textBars,
  uprightPanel
} from './research-figures-illustration-objects-data.mjs'

const rad = (deg) => (deg * Math.PI) / 180

/** A globe: a sphere with its meridians and parallels (front half), on a desk stand. */
function globe(b, { stand = true, tilt = 23 } = {}) {
  const r = 13
  const C = [16, 16, stand ? 25 : r + 1]
  const plane = screenPlane(b)
  // Why divided: the sphere disc is drawn in screen units, world lengths project larger.
  const rho = r / plane.scale
  const rows = VIEWS[b.view] ?? VIEWS.iso
  const toward = [
    rows[0][1] * rows[1][2] - rows[0][2] * rows[1][1],
    rows[0][2] * rows[1][0] - rows[0][0] * rows[1][2],
    rows[0][0] * rows[1][1] - rows[0][1] * rows[1][0]
  ]
  const unitU = plane.u.map((value) => value / Math.hypot(...plane.u))
  const axis = [unitU[0] * Math.sin(rad(tilt)), unitU[1] * Math.sin(rad(tilt)), Math.cos(rad(tilt))]
  const len = Math.hypot(...toward)
  const view = toward.map((value) => value / len)
  // e1 across the axis in the screen plane, e2 toward the viewer: meridians wrap the front.
  const e1 = [
    axis[1] * view[2] - axis[2] * view[1],
    axis[2] * view[0] - axis[0] * view[2],
    axis[0] * view[1] - axis[1] * view[0]
  ]
  const n1 = Math.hypot(...e1)
  const u1 = e1.map((value) => value / n1)
  const e2 = [
    u1[1] * axis[2] - u1[2] * axis[1],
    u1[2] * axis[0] - u1[0] * axis[2],
    u1[0] * axis[1] - u1[1] * axis[0]
  ]
  const at = (lat, lon) => {
    const c = Math.cos(rad(lat))
    return [0, 1, 2].map(
      (i) =>
        C[i] +
        rho *
          (c * Math.cos(rad(lon)) * u1[i] +
            c * Math.sin(rad(lon)) * e2[i] +
            Math.sin(rad(lat)) * axis[i])
    )
  }
  const facing = (p) =>
    (p[0] - C[0]) * view[0] + (p[1] - C[1]) * view[1] + (p[2] - C[2]) * view[2] > 0.02
  if (stand) {
    // Why under the arm's foot: a desk globe's post holds the arm, the globe hangs beside it.
    const foot = [0, 1, 2].map((i) => C[i] - rho * 1.16 * axis[i])
    b.roundShadow({ at: [foot[0], foot[1]], r: 8.2, offset: 1.8 })
    b.cylinder({ at: [foot[0], foot[1], 0], r: 7.5, h: 1.8, role: 'metal', tone: 4 })
    b.tube({ from: [foot[0], foot[1], 1.8], to: foot, r: 1, role: 'metal', tone: 4 })
    // The meridian arm: a half ring beside the globe, from pole to pole, in the screen plane.
    const arm = Array.from({ length: 49 }, (_, k) => {
      const angle = rad(-90 + (180 * k) / 48)
      const rr = rho * 1.16
      return [0, 1, 2].map((i) => C[i] + rr * (Math.cos(angle) * u1[i] + Math.sin(angle) * axis[i]))
    })
    b.line(arm, { role: 'metal', tone: 5, weight: 2.4 })
  } else {
    b.roundShadow({ at: [C[0], C[1]], r: rho * 0.9, offset: 2 })
  }
  b.sphere({ at: C, r, role: 'accent', tone: 2 })
  const runs = []
  const trace = (points) => {
    let run = []
    for (const p of points) {
      if (facing(p)) {
        run.push(p)
      } else if (run.length) {
        runs.push(run)
        run = []
      }
    }
    if (run.length) {
      runs.push(run)
    }
  }
  for (const lat of [-60, -30, 0, 30, 60]) {
    trace(Array.from({ length: 97 }, (_, k) => at(lat, (360 * k) / 96)))
  }
  for (let lon = 15; lon < 375; lon += 30) {
    trace(Array.from({ length: 49 }, (_, k) => at(-90 + (180 * k) / 48, lon)))
  }
  for (const run of runs.filter((points) => points.length > 1)) {
    b.line(run, { role: 'accent', tone: 0, weight: 0.55 })
  }
  if (stand) {
    for (const sign of [-1, 1]) {
      const pole = [0, 1, 2].map((i) => C[i] + sign * rho * 1.16 * axis[i])
      const tip = [0, 1, 2].map((i) => C[i] + sign * rho * 0.98 * axis[i])
      b.line([pole, tip], { role: 'metal', tone: 5, weight: 1.6 })
    }
  }
}

/** One closed book lying flat: covers, the page block with its edge lines, a title label. */
function oneBook(b, at, { L = 28, D = 20, T = 4.2, role = 'accent', tone = 3 } = {}) {
  const [x, y, z] = at
  const c = 0.6
  b.box({ at: [x, y, z], size: [L, D, c], radius: 0.4, role, tone })
  b.box({ at: [x, y, z], size: [1.2, D, T], radius: 0.4, role, tone })
  const pages = b.box({
    at: [x + 0.8, y + 0.7, z + c],
    size: [L - 1.6, D - 1.4, T - 2 * c],
    role: 'neutral',
    tone: 0
  })
  for (let k = 1; k < 4; k += 1) {
    const v = (k * (T - 2 * c)) / 4
    pages.left.line(
      [
        [0.4, v],
        [L - 2.2, v]
      ],
      { role: 'neutral', tone: 3, weight: 0.4 }
    )
    pages.right.line(
      [
        [0.4, v],
        [D - 1.8, v]
      ],
      { role: 'neutral', tone: 3, weight: 0.4 }
    )
  }
  const cover = b.box({ at: [x, y, z + T - c], size: [L, D, c], radius: 0.4, role, tone })
  cover.top.rect(L * 0.3, D * 0.28, L * 0.52, D * 0.22, { radius: 0.6, role: 'neutral', tone: 0 })
  cover.top.rect(L * 0.36, D * 0.36, L * 0.3, 1, { radius: 0.5, role, tone: tone + 3 })
}

/** A closed book lying flat, or a stack of two or three with the accent book on top. */
function book(b, { count = 1 } = {}) {
  const n = Math.max(1, Math.min(3, count))
  // Top first: the accent book is always the one on top, the largest at the bottom.
  const looks = [
    { role: 'accent', tone: 3, L: 26, D: 18.5, T: 3.8, dx: 1.2, dy: 0.8 },
    { role: 'second', tone: 3, L: 27, D: 19, T: 3.4, dx: 0.4, dy: 1.4 },
    { role: 'neutral', tone: 4, L: 28.5, D: 20.5, T: 4.2, dx: 0, dy: 0 }
  ]
  const stack = looks.slice(0, n).toReversed()
  if (n === 1) {
    stack[0] = { ...stack[0], L: 28, D: 20, T: 4.2, dx: 0, dy: 0 }
  }
  b.shadow({ at: [0, 0], size: [stack[0].L, stack[0].D], radius: 1, spread: 1.2, offset: 3 })
  let z = 0
  for (const look of stack) {
    oneBook(b, [look.dx, look.dy, z], look)
    z += look.T
  }
}

/** A presentation board on an easel showing a chart: bars with one in the accent, or a line. */
function chartBoard(b, { chart = 'bars', highlight = 3 } = {}) {
  const W = 36
  const H = 26
  const T = 1.2
  const z0 = 22
  b.shadow({ at: [3, -6], size: [W - 6, 10], radius: 3, spread: 1, offset: 2.5, tone: 2 })
  b.tube({ from: [W / 2, -1, z0 + H - 3], to: [W / 2, -13, 0], r: 0.75, role: 'neutral', tone: 6 })
  for (const [top, foot] of [
    [W * 0.24, W * 0.1],
    [W * 0.76, W * 0.9]
  ]) {
    b.tube({ from: [top, T / 2, z0 + H - 2], to: [foot, 4, 0], r: 0.85, role: 'neutral', tone: 6 })
  }
  const face = uprightPanel(b, {
    at: [0, 0, z0],
    w: W,
    h: H,
    t: T,
    radius: 1,
    role: 'neutral',
    tone: 4
  })
  face.rect(1, 1, W - 2, H - 2, { radius: 0.6, role: 'white' })
  b.box({ at: [2, T, z0 - 1.6], size: [W - 4, 2.4, 1.2], radius: 0.4, role: 'neutral', tone: 4 })
  const x0 = 5
  const base = H - 4.5
  face.line(
    [
      [x0, 4],
      [x0, base],
      [W - 3.5, base]
    ],
    { role: 'neutral', tone: 6, weight: 0.7 }
  )
  for (const k of [1, 2, 3]) {
    face.line(
      [
        [x0 + 0.8, base - k * 4.6],
        [W - 3.5, base - k * 4.6]
      ],
      { role: 'neutral', tone: 2, weight: 0.45 }
    )
  }
  const values = [0.38, 0.55, 0.47, 0.86, 0.68]
  if (chart === 'line') {
    const points = values.map((value, k) => [x0 + 3 + k * 6.2, base - value * (base - 5)])
    face.line(points, { role: 'accent', tone: 5, weight: 1.3 })
    for (const [px, py] of points) {
      face.circle(px, py, 0.85, { role: 'accent', tone: 5 })
    }
    return
  }
  values.forEach((value, k) => {
    const h = value * (base - 5)
    const chosen = k === Math.min(values.length - 1, Math.max(0, highlight))
    face.rect(x0 + 2 + k * 6, base - h, 4, h, {
      radius: 0.4,
      role: chosen ? 'accent' : 'neutral',
      tone: chosen ? 4 : 3
    })
  })
}

/** A camera, lens toward the viewer, on a small tripod. */
function camera(b, { tripod = true } = {}) {
  const W = 14
  const D = 8
  const H = 9
  const z0 = tripod ? 24 : 0
  const cx = W / 2
  const cy = D / 2
  if (tripod) {
    b.roundShadow({ at: [cx, cy], r: 9, offset: 2, tone: 2 })
    const head = [cx, cy, z0 - 3]
    b.tube({ from: head, to: [cx - 6, cy - 9, 0], r: 0.7, role: 'neutral', tone: 7 })
    b.cylinder({ at: [cx, cy, z0 - 3.6], r: 2.2, h: 3.6, role: 'neutral', tone: 7 })
    b.tube({ from: head, to: [cx + 9, cy + 2, 0], r: 0.7, role: 'neutral', tone: 7 })
    b.tube({ from: head, to: [cx - 2, cy + 10, 0], r: 0.7, role: 'neutral', tone: 7 })
  } else {
    b.shadow({ at: [0, 0], size: [W, D], radius: 1.4, spread: 1, offset: 2 })
  }
  const body = b.box({ at: [0, 0, z0], size: [W, D, H], radius: 1.4, role: 'neutral', tone: 7 })
  body.left.rect(0.8, 1.2, W - 1.6, 1.4, { radius: 0.4, role: 'neutral', tone: 5 })
  b.box({ at: [3.5, 1.5, z0 + H], size: [6, 5, 2.4], radius: 0.8, role: 'neutral', tone: 7 })
  b.cylinder({ at: [W - 2.8, 2.4, z0 + H], r: 1.1, h: 1, role: 'accent', tone: 4 })
  const lens = b.cylinder({
    at: [cx, D, z0 + H / 2 - 0.4],
    r: 3.6,
    h: 3.4,
    axis: 'y',
    role: 'metal',
    tone: 2
  })
  lens.top.circle(3.6, 3.6, 3.1, { role: 'neutral', tone: 9 })
  lens.top.circle(3.6, 3.6, 2.1, { role: 'accent', tone: 7 })
  lens.top.circle(3.6, 3.6, 1.2, { role: 'neutral', tone: 10 })
  lens.top.circle(2.6, 2.6, 0.55, { role: 'neutral', tone: 1 })
  body.left.circle(W - 2, H - 2.6, 0.5, { role: 'accent', tone: 5 })
}

/** A desktop display on a stand, screen toward the viewer. */
function monitor(b, { screen = 'app' } = {}) {
  const W = 40
  const H = 24
  const T = 1.4
  const z0 = 11
  b.shadow({ at: [W / 2 - 8, -2], size: [16, 10], radius: 2, spread: 1.4, offset: 3 })
  b.box({ at: [W / 2 - 7, -2, 0], size: [14, 9, 1.2], radius: 1.5, role: 'metal', tone: 2 })
  b.box({ at: [W / 2 - 2, -0.5, 1.2], size: [4, 1.6, z0], radius: 0.6, role: 'metal', tone: 2 })
  const face = uprightPanel(b, {
    at: [0, 1, z0],
    w: W,
    h: H,
    t: T,
    radius: 1,
    role: 'neutral',
    tone: 8
  })
  face.rect(1, 1, W - 2, H - 2, { radius: 0.5, role: 'white' })
  if (screen === 'blank') {
    return
  }
  face.rect(1, 1, W - 2, 2.6, { role: 'neutral', tone: 1 })
  face.rect(3, 5, 10, 16, { radius: 0.8, role: 'neutral', tone: 1 })
  face.rect(15, 5, 22, 8, { radius: 0.8, role: 'accent', tone: 2 })
  textBars(face, 15, 15, [20, 14, 17], { gap: 2.2, size: 1.1 })
}

/** A cardboard shipping box with tape over its flaps. */
function crate(b) {
  const W = 26
  const D = 20
  const H = 16
  b.shadow({ at: [0, 0], size: [W, D], radius: 1, spread: 1.5, offset: 3 })
  const box = b.box({ at: [0, 0, 0], size: [W, D, H], radius: 0.4, role: 'wood', tone: 3 })
  box.top.rect(0, D / 2 - 2.2, W, 4.4, { role: 'wood', tone: 1 })
  box.top.line(
    [
      [0.6, D / 2],
      [W - 0.6, D / 2]
    ],
    { role: 'wood', tone: 6, weight: 0.5 }
  )
  box.left.rect(W / 2 - 2.2, 0, 4.4, 6, { role: 'wood', tone: 1 })
  box.left.rect(2.4, H - 6, 7, 3.4, { radius: 0.4, role: 'white' })
  textBars(box.left, 3.2, H - 5.2, [5, 3.4], { gap: 1.4, size: 0.6, tone: 5 })
}

export const DEVICE_OBJECTS = {
  globe: {
    title: 'Globe',
    tags: [
      'globe',
      'world',
      'earth',
      'web',
      'internet',
      'global',
      'geography',
      'planet',
      'multilingual'
    ],
    roles: { accent: 'the sphere and its grid', neutral: 'the stand' },
    options: [
      ['stand', true, 'a desk stand with a meridian arm'],
      ['tilt', 23, 'axis tilt, degrees']
    ],
    draw: globe
  },
  book: {
    title: 'Book (or a stack)',
    tags: ['book', 'books', 'textbook', 'library', 'knowledge', 'literature', 'reading', 'corpus'],
    roles: { accent: 'the first cover', second: 'the second cover', neutral: 'pages, third cover' },
    options: [['count', 1, 'books in the stack (1–3)']],
    draw: book
  },
  'chart-board': {
    title: 'Chart board on an easel',
    tags: [
      'chart',
      'board',
      'presentation',
      'results',
      'evaluation',
      'metrics',
      'benchmark',
      'analysis',
      'report'
    ],
    roles: { neutral: 'board, easel and bars', accent: 'the highlighted bar or the line' },
    options: [
      ['chart', 'bars', 'bars | line'],
      ['highlight', 3, 'index of the bar in the accent']
    ],
    draw: chartBoard
  },
  camera: {
    title: 'Camera on a tripod',
    tags: [
      'camera',
      'video',
      'recording',
      'sensor',
      'capture',
      'photo',
      'observation',
      'rgb',
      'vision'
    ],
    roles: {
      neutral: 'body and tripod',
      metal: 'lens barrel',
      accent: 'lens glass, shutter and light'
    },
    options: [['tripod', true, 'on a tripod']],
    draw: camera
  },
  monitor: {
    title: 'Desktop monitor',
    tags: ['monitor', 'display', 'screen', 'desktop', 'computer', 'gui', 'web', 'interface'],
    roles: { neutral: 'bezel', metal: 'stand', accent: 'what the screen shows' },
    options: [['screen', 'app', 'app | blank']],
    draw: monitor
  },
  crate: {
    title: 'Cardboard box',
    tags: ['box', 'crate', 'package', 'parcel', 'shipping', 'object', 'carton', 'delivery'],
    roles: { wood: 'cardboard and tape', neutral: 'the label' },
    options: [],
    draw: crate
  }
}
