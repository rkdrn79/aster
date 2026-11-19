// Drawn objects for data, in the house style: documents, databases, datasets, phones, chat
// windows, chips, clouds and video frames, with the helpers the device objects share. Built
// from the illustration builder's iso primitives at the origin, about a centimetre per unit,
// fronts on the lit (+y) side, each with its contact shadow. `draw(b, options)` draws one.
import { VIEWS } from './research-figures-illustration-iso.mjs'
import { roundRectPoints } from './research-figures-illustration-svg.mjs'

/**
 * An upright panel facing the viewer's left (+y): a rounded rectangle in the x–z plane from
 * `at` [x, y, z], `w` wide, `h` tall, `t` thick. Returns its front face as a decal surface.
 */
export function uprightPanel(b, { at = [0, 0, 0], w, h, t = 1, radius = 0, outline, ...spec }) {
  const [x, y, z] = at
  b.extrude({
    at,
    axis: 'y',
    h: t,
    outline: outline ?? roundRectPoints(0, 0, w, h, radius),
    ...spec
  })
  return b.surface([x, y + t, z + h], [1, 0, 0], [0, 0, -1], { w, h })
}

/**
 * The plane parallel to the screen through a world point, for flat drawings that still move
 * with `place` (a cloud): u one screen unit right, v one down. `scale` is the projection's
 * screen length per world unit within that plane (spheres and tubes are drawn in screen units).
 */
export function screenPlane(b) {
  const rows = VIEWS[b.view] ?? VIEWS.iso
  const a = 1 / (rows[0][0] - rows[0][1])
  return { u: [a, -a, 0], v: [0, 0, 1 / rows[1][2]], scale: Math.hypot(...rows[0]) }
}

/** A small landscape picture on a surface: sky, two hills and a sun. */
export function landscape(s, x, y, w, h, { role = 'accent', sun = 'second', variant = 0 } = {}) {
  s.rect(x, y, w, h, { radius: Math.min(w, h) * 0.06, role, tone: 1 })
  const peak = [0.38, 0.6, 0.48][variant % 3]
  s.polygon(
    [
      [x, y + h * 0.78],
      [x + w * 0.2, y + h * 0.52],
      [x + w * 0.42, y + h * 0.7],
      [x + w * 0.42, y + h],
      [x, y + h]
    ],
    { role, tone: 3 }
  )
  s.polygon(
    [
      [x + w * 0.12, y + h],
      [x + w * peak, y + h * 0.36],
      [x + w * 0.92, y + h],
      [x + w * 0.12, y + h]
    ],
    { role, tone: 5 }
  )
  s.circle(x + w * [0.78, 0.25, 0.8][variant % 3], y + h * 0.26, Math.min(w, h) * 0.1, {
    role: sun,
    tone: 3
  })
}

/** Rounded text bars (a paragraph) on a surface. */
export function textBars(s, x, y, widths, { gap = 2, size = 1, role = 'neutral', tone = 3 } = {}) {
  widths.forEach((width, row) => {
    s.rect(x, y + row * gap, width, size, { radius: size / 2, role, tone })
  })
}

/** An upright sheet of paper with a folded corner, a heading, text lines and a picture. */
function documentSheet(b, { image = true, lines = 6 } = {}) {
  const W = 21
  const H = 28
  const T = 0.8
  const fold = 5.5
  b.shadow({ at: [0, 0], size: [W, T], radius: 0.6, spread: 1.2, offset: 2.4 })
  const outline = [
    [0, 0],
    [W, 0],
    [W, H - fold],
    [W - fold, H],
    [0, H]
  ]
  const face = uprightPanel(b, {
    at: [0, 0, 0],
    w: W,
    h: H,
    t: T,
    outline,
    role: 'neutral',
    tone: 0
  })
  face.polygon(
    [
      [W - fold, 0],
      [W - fold, fold],
      [W, fold]
    ],
    { role: 'neutral', tone: 3, outline: true }
  )
  face.rect(2.6, 3.2, 9, 1.6, { radius: 0.8, role: 'accent', tone: 4 })
  let y = 7
  if (image) {
    landscape(face, 2.6, y, W - 5.2, 8.2)
    y += 10.6
  }
  const widths = [15.8, 14.2, 15.8, 11.5, 15, 9].slice(
    0,
    Math.max(1, image ? Math.min(lines, 4) : lines)
  )
  textBars(face, 2.6, y, widths, { gap: 2.25, size: 1 })
}

/** The classic database drum: three stacked discs with accent bands and a status light each. */
function database(b, { discs = 3 } = {}) {
  const r = 14
  const h = 8
  const gap = 1.6
  const count = Math.max(1, Math.min(5, discs))
  b.roundShadow({ at: [r, r], r: r + 0.8, offset: 2.2 })
  for (let i = 0; i < count; i += 1) {
    const z = i * (h + gap)
    b.cylinder({ at: [r, r, z], r, h, role: 'neutral', tone: 1 })
    // Why on the tangent plane: the front-most point of the drum faces the viewer.
    const front = [r + r * Math.SQRT1_2, r + r * Math.SQRT1_2, z + h]
    const light = b.surface(front, [Math.SQRT1_2, -Math.SQRT1_2, 0], [0, 0, -1])
    light.rect(-5, h / 2 - 0.6, 6.5, 1.2, { radius: 0.6, role: 'neutral', tone: 4 })
    light.circle(4, h / 2, 0.9, { role: 'accent', tone: 5 })
    if (i < count - 1) {
      b.cylinder({ at: [r, r, z + h], r: r - 0.6, h: gap, role: 'accent', tone: 3 })
    }
  }
  const topZ = count * (h + gap) - gap
  const cap = b.cylinder({
    at: [r, r, topZ],
    r: r - 0.01,
    h: 0.01,
    role: 'neutral',
    tone: 1,
    outline: false
  })
  cap.top.circle(r, r, r * 0.62, { role: 'accent', tone: 2 })
  cap.top.circle(r, r, r * 0.34, { role: 'neutral', tone: 0 })
}

/** A fanned stack of image cards lying flat, each with its own picture. */
function datasetStack(b, { count = 4 } = {}) {
  const n = Math.max(2, Math.min(6, count))
  const S = 24
  const T = 1
  const step = 3
  const shift = 3.4
  const back = (n - 1) * shift
  b.shadow({ at: [back, back], size: [S, S], radius: 1.5, spread: 1.2, offset: 2.6 })
  const pictures = [{ role: 'accent', sun: 'second' }]
  for (let i = 0; i < n; i += 1) {
    // Why lower cards forward: each shows a strip of its own picture under the next one.
    const offset = (n - 1 - i) * shift
    const card = b.box({
      at: [offset, offset, i * step],
      size: [S, S, T],
      radius: 1.2,
      role: 'neutral',
      tone: 0
    })
    const picture = pictures[(n - 1 - i) % pictures.length]
    landscape(card.top, 1.6, 1.6, S - 3.2, S - 3.2, { ...picture, variant: i })
  }
}

/** An upright smartphone, screen toward the viewer, showing a list app. */
function phone(b, { screen = 'app' } = {}) {
  const W = 8
  const H = 16
  const T = 0.9
  b.shadow({ at: [0, 0], size: [W, T], radius: 0.5, spread: 0.8, offset: 1.6 })
  const face = uprightPanel(b, {
    at: [0, 0, 0],
    w: W,
    h: H,
    t: T,
    radius: 1.3,
    role: 'neutral',
    tone: 8
  })
  face.rect(0.45, 0.45, W - 0.9, H - 0.9, { radius: 0.95, role: 'white' })
  face.rect(W / 2 - 1.1, 0.75, 2.2, 0.55, { radius: 0.27, role: 'neutral', tone: 8 })
  if (screen === 'blank') {
    return
  }
  face.rect(0.45, 1.6, W - 0.9, 2.6, { role: 'accent', tone: 3 })
  face.rect(1.2, 2.5, 3.6, 0.8, { radius: 0.4, role: 'accent', tone: 0 })
  for (let row = 0; row < 4; row += 1) {
    const y = 5.3 + row * 2.2
    face.circle(1.9, y + 0.6, 0.75, {
      role: row === 0 ? 'second' : 'neutral',
      tone: row === 0 ? 3 : 2
    })
    face.rect(3.1, y + 0.05, 3.6 - (row % 2) * 1.1, 0.55, {
      radius: 0.27,
      role: 'neutral',
      tone: 5
    })
    face.rect(3.1, y + 0.85, 2.6, 0.45, { radius: 0.22, role: 'neutral', tone: 3 })
  }
  face.rect(0.45, H - 2.3, W - 0.9, 1.85, { radius: 0.4, role: 'neutral', tone: 1 })
  for (let k = 0; k < 3; k += 1) {
    face.circle(2 + k * 2, H - 1.4, 0.4, {
      role: k === 0 ? 'accent' : 'neutral',
      tone: k === 0 ? 5 : 4
    })
  }
}

/** A floating app window with a conversation: the user's bubbles in the accent. */
function chatWindow(b, { turns = 3 } = {}) {
  const W = 36
  const H = 30
  const T = 1.2
  const lift = 5
  b.shadow({ at: [0, 0], size: [W, T], radius: 1, spread: 2, offset: 3.5, tone: 2 })
  const face = uprightPanel(b, {
    at: [0, 0, lift],
    w: W,
    h: H,
    t: T,
    radius: 2,
    role: 'neutral',
    tone: 1
  })
  face.rect(0, 0, W, H, { radius: 2, role: 'white' })
  face.rect(0, 0, W, 3.6, { radius: 2, role: 'neutral', tone: 2 })
  face.rect(0, 1.8, W, 1.8, { role: 'neutral', tone: 2 })
  for (let k = 0; k < 3; k += 1) {
    face.circle(2.6 + k * 2.2, 1.8, 0.7, { role: 'neutral', tone: 4 })
  }
  const bubbles = [
    { user: true, w: 16, lines: 1 },
    { user: false, w: 22, lines: 2 },
    { user: true, w: 12, lines: 1 },
    { user: false, w: 18, lines: 1 }
  ].slice(0, Math.max(1, Math.min(4, turns + 1)))
  let y = 5.6
  for (const bubble of bubbles) {
    const h = 1.6 + bubble.lines * 2.2
    const x = bubble.user ? W - 2.6 - bubble.w : 2.6
    face.rect(x, y, bubble.w, h, {
      radius: 1.4,
      role: bubble.user ? 'accent' : 'neutral',
      tone: bubble.user ? 3 : 1
    })
    for (let line = 0; line < bubble.lines; line += 1) {
      const width = bubble.w - 4 - (line === bubble.lines - 1 && bubble.lines > 1 ? 6 : 0)
      face.rect(x + 2, y + 1.3 + line * 2.2, width, 0.9, {
        radius: 0.45,
        role: bubble.user ? 'accent' : 'neutral',
        tone: bubble.user ? 0 : 4
      })
    }
    y += h + 1.6
  }
  face.rect(2.6, H - 4.4, W - 5.2, 2.8, { radius: 1.4, role: 'neutral', tone: 1 })
  face.circle(W - 4.4, H - 3, 0.9, { role: 'accent', tone: 5 })
}

/** A processor package: a dark slab with pins on every edge and an accent die with a grid. */
function chip(b) {
  const S = 22
  const z0 = 0.8
  const T = 2.4
  const pins = 7
  const pitch = S / (pins + 1)
  b.shadow({ at: [-2.4, -2.4], size: [S + 4.8, S + 4.8], radius: 1, spread: 0.8, offset: 2 })
  const pin = (at, size) => b.box({ at, size, role: 'metal', tone: 1 })
  for (let k = 1; k <= pins; k += 1) {
    pin([k * pitch - 0.7, -2.4, z0 + 0.6], [1.4, 2.4, 0.6])
    pin([-2.4, k * pitch - 0.7, z0 + 0.6], [2.4, 1.4, 0.6])
  }
  const body = b.box({ at: [0, 0, z0], size: [S, S, T], radius: 0.8, role: 'neutral', tone: 8 })
  body.top.circle(2.6, 2.6, 0.9, { role: 'neutral', tone: 6 })
  for (let k = 1; k <= pins; k += 1) {
    pin([k * pitch - 0.7, S, z0 + 0.6], [1.4, 2.4, 0.6])
    pin([S, S - k * pitch - 0.7, z0 + 0.6], [2.4, 1.4, 0.6])
  }
  const D = 12
  const o = (S - D) / 2
  const die = b.box({ at: [o, o, z0 + T], size: [D, D, 0.9], radius: 0.5, role: 'accent', tone: 3 })
  for (let k = 1; k < 4; k += 1) {
    die.top.line(
      [
        [k * 3, 1],
        [k * 3, D - 1]
      ],
      { role: 'accent', tone: 5, weight: 0.6 }
    )
    die.top.line(
      [
        [1, k * 3],
        [D - 1, k * 3]
      ],
      { role: 'accent', tone: 5, weight: 0.6 }
    )
  }
}

/**
 * Points of a union of circles (u, v; v down) and an optional rectangle `body` [x0, y0, x1, y1],
 * cut flat at `bottom`, traced by rays from `centre` (inside every part it must see).
 */
export function blobOutline(circles, bottom, centre, { body, samples = 360 } = {}) {
  const [ox, oy] = centre
  return Array.from({ length: samples }, (_, index) => {
    const angle = (2 * Math.PI * index) / samples
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    let reach = 0
    for (const [cx, cy, r] of circles) {
      const bx = dx * (ox - cx) + dy * (oy - cy)
      const c = (ox - cx) ** 2 + (oy - cy) ** 2 - r * r
      const disc = bx * bx - c
      if (disc >= 0) {
        reach = Math.max(reach, -bx + Math.sqrt(disc))
      }
    }
    if (body) {
      const [x0, y0, x1, y1] = body
      const tx = dx > 1e-9 ? (x1 - ox) / dx : dx < -1e-9 ? (x0 - ox) / dx : Infinity
      const ty = dy > 1e-9 ? (y1 - oy) / dy : dy < -1e-9 ? (y0 - oy) / dy : Infinity
      reach = Math.max(reach, Math.min(tx, ty))
    }
    if (dy > 1e-6) {
      reach = Math.min(reach, (bottom - oy) / dy)
    }
    return [ox + dx * reach, oy + dy * reach]
  })
}

/** A puffy cloud facing the viewer: one outline, its lit top a tone lighter than the base. */
function cloud(b, { role = 'neutral', tone = 1 } = {}) {
  const puffs = [
    [9, 16.5, 6.5],
    [19, 10.5, 9.5],
    [30.5, 12.5, 7.5],
    [37, 17, 5]
  ]
  const bottom = 22
  const plane = screenPlane(b)
  const s = b.surface([0, 0, 26], plane.u, plane.v)
  const body = [6, 15, 39, bottom]
  s.polygon(blobOutline(puffs, bottom, [22, 16], { body }), { role, tone, shade: 2, outline: true })
  // Why smaller and up-left: the lit part leaves a darker rim on the shaded side and below.
  const lit = puffs.map(([cx, cy, r]) => [cx - r * 0.05, cy - r * 0.08, r * 0.88 - 0.5])
  const litBody = [6.6, 14, 38, bottom - 4.2]
  s.polygon(blobOutline(lit, bottom - 4.2, [22, 14], { body: litBody }), { role, tone, shade: 0 })
}

/** Three video frames standing one behind another, the scene moving from back to front. */
function videoFrames(b, { count = 3 } = {}) {
  const n = Math.max(2, Math.min(5, count))
  const W = 24
  const H = 16
  const T = 0.8
  const gap = 7
  b.shadow({
    at: [0, -(n - 1) * gap],
    size: [W + (n - 1) * 3, (n - 1) * gap + T],
    radius: 1,
    spread: 1.2,
    offset: 3,
    tone: 2
  })
  for (let i = n - 1; i >= 0; i -= 1) {
    const face = uprightPanel(b, {
      at: [i * 3, -i * gap, 1],
      w: W,
      h: H,
      t: T,
      radius: 0.8,
      role: 'neutral',
      tone: 7
    })
    landscape(face, 0.9, 0.9, W - 1.8, H - 1.8, { variant: n - 1 - i })
  }
}

export const DATA_OBJECTS = {
  document: {
    title: 'Document (upright sheet)',
    tags: ['document', 'paper', 'page', 'text', 'pdf', 'report', 'article', 'file', 'corpus'],
    roles: {
      neutral: 'the sheet and its text lines',
      accent: 'the heading and picture',
      second: 'the sun'
    },
    options: [
      ['image', true, 'a picture block above the text'],
      ['lines', 6, 'text lines (1–6)']
    ],
    draw: documentSheet
  },
  database: {
    title: 'Database (stacked drum)',
    tags: [
      'database',
      'db',
      'storage',
      'sql',
      'table',
      'records',
      'memory',
      'knowledge base',
      'store'
    ],
    roles: { neutral: 'the discs', accent: 'bands, top ring and status lights' },
    options: [['discs', 3, 'stacked discs (1–5)']],
    draw: database
  },
  'dataset-stack': {
    title: 'Dataset (stack of image cards)',
    tags: [
      'dataset',
      'images',
      'data',
      'samples',
      'collection',
      'photos',
      'benchmark',
      'corpus',
      'training data'
    ],
    roles: { neutral: 'the cards', accent: 'pictures', second: 'pictures and suns' },
    options: [['count', 4, 'cards in the stack (2–6)']],
    draw: datasetStack
  },
  phone: {
    title: 'Smartphone',
    tags: ['phone', 'smartphone', 'mobile', 'app', 'device', 'user', 'android', 'ios', 'gui'],
    roles: { neutral: 'body and list', accent: 'app bar and selected tab', second: 'one avatar' },
    options: [['screen', 'app', 'app | blank']],
    draw: phone
  },
  'chat-window': {
    title: 'Chat window',
    tags: [
      'chat',
      'conversation',
      'dialogue',
      'assistant',
      'llm',
      'chatbot',
      'messages',
      'prompt',
      'ui'
    ],
    roles: { neutral: 'window and replies', accent: "the user's bubbles and send button" },
    options: [['turns', 3, 'bubbles after the first (0–3)']],
    draw: chatWindow
  },
  chip: {
    title: 'Processor chip',
    tags: ['chip', 'processor', 'cpu', 'gpu', 'accelerator', 'tpu', 'hardware', 'silicon', 'npu'],
    roles: { neutral: 'package', metal: 'pins', accent: 'the die' },
    options: [],
    draw: chip
  },
  cloud: {
    title: 'Cloud',
    tags: ['cloud', 'server', 'remote', 'internet', 'api', 'hosted', 'service', 'weather'],
    roles: { neutral: 'the cloud (any role with `role`)' },
    options: [
      ['role', 'neutral', 'colour role of the cloud'],
      ['tone', 0, 'tone of its lit top']
    ],
    draw: cloud
  },
  'video-frames': {
    title: 'Video frames',
    tags: ['video', 'frames', 'clip', 'sequence', 'time', 'film', 'temporal', 'footage'],
    roles: { neutral: 'frames', accent: 'pictures', second: 'the sun' },
    options: [['count', 3, 'frames (2–5)']],
    draw: videoFrames
  }
}
