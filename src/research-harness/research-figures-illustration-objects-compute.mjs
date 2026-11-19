// Drawn objects for compute and robotics, in the house style: built from the illustration
// builder's iso primitives at the origin, about a centimetre per unit, fronts on the lit (+y)
// side, each with its contact shadow. `draw(b, options)` draws one; the kit places it.

const rad = (deg) => (deg * Math.PI) / 180
const along = (p, d, k) => [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k]

/** A server cabinet: units on its front, drive bays in the accent, a status light each. */
function gpuServer(b, { units = 5, lights = true } = {}) {
  const W = 56
  const D = 46
  const H = 100
  b.shadow({ at: [0, 0], size: [W, D], radius: 3, spread: 3, offset: 6 })
  b.box({ at: [0, 0, 0], size: [W, D, 4], radius: 1.5, role: 'neutral', tone: 6 })
  const body = b.box({ at: [0, 0, 4], size: [W, D, H], radius: 1.5, role: 'neutral', tone: 2 })
  body.left.rect(3, 4, W - 6, H - 8, { radius: 1.2, role: 'neutral', tone: 6 })
  const count = Math.max(1, Math.min(8, units))
  const gap = 2.5
  const unitH = (H - 12 - (count - 1) * gap) / count
  for (let i = 0; i < count; i += 1) {
    const z = 4 + H - 6 - (i + 1) * unitH - i * gap
    const unit = b.box({
      at: [5, D - 1, z],
      size: [W - 10, 2.4, unitH],
      radius: 0.6,
      role: 'neutral',
      tone: 0
    })
    const face = unit.left
    for (let k = 0; k < 5; k += 1) {
      face.rect(2.6 + k * 2.4, 2.4, 1.1, unitH - 4.8, { radius: 0.55, role: 'neutral', tone: 4 })
    }
    for (let k = 0; k < 4; k += 1) {
      face.rect(17 + k * 5.6, 2, 4.6, unitH - 4, { radius: 0.7, role: 'accent', tone: 2 })
      face.rect(17.9 + k * 5.6, unitH - 4.2, 2.8, 0.9, { radius: 0.45, role: 'accent', tone: 5 })
    }
    if (lights) {
      face.circle(W - 14, unitH / 2, 1, { role: 'accent', tone: 6 })
    }
  }
}

/** Joint positions of a planar arm: shoulder, elbow, wrist and tool tip. */
export function armJoints({
  base = [0, 0, 0],
  pan = -15,
  lift = 62,
  elbow = -108,
  wrist = -44,
  upper = 34,
  fore = 30,
  hand = 7,
  shoulder = 15
} = {}) {
  const d = [Math.cos(rad(pan)), Math.sin(rad(pan)), 0]
  const dir = (angle) => [
    d[0] * Math.cos(rad(angle)),
    d[1] * Math.cos(rad(angle)),
    Math.sin(rad(angle))
  ]
  const S = [base[0], base[1], base[2] + shoulder]
  const E = along(S, dir(lift), upper)
  const W = along(E, dir(lift + elbow), fore)
  const tool = dir(lift + elbow + wrist)
  const T = along(W, tool, hand)
  return { d, S, E, W, T, tool, side: [-d[1], d[0], 0], plane: (angle) => dir(angle) }
}

/** A six-axis arm (UR style): silver links, joint caps in the accent, a two-finger gripper. */
function robotArm(
  b,
  {
    pan = -15,
    lift = 62,
    elbow = -108,
    wrist = -44,
    gripper = 'open',
    base = [0, 0, 0],
    mount = true
  } = {}
) {
  const j = armJoints({ base, pan, lift, elbow, wrist })
  // Why toward the viewer: a joint cap faces whichever side of the arm the eye sees.
  const towardViewer = j.side[0] + j.side[1] >= 0 ? j.side : j.side.map((v) => -v)
  if (mount) {
    b.roundShadow({ at: [base[0], base[1]], r: 13, z: base[2], offset: 3 })
    b.cylinder({ at: base, r: 11, h: 3, role: 'neutral', tone: 7 })
  }
  b.cylinder({ at: along(base, [0, 0, 1], 3), r: 7.5, h: 9, role: 'metal', tone: 1 })
  b.cylinder({ at: along(base, [0, 0, 1], 12), r: 8, h: 3.5, role: 'accent', tone: 3 })
  const cap = (at, r, length) => {
    const start = along(at, towardViewer, -length / 2)
    const joint = b.cylinder({
      at: start,
      r,
      h: length,
      axis: towardViewer,
      role: 'metal',
      tone: 1,
      segments: 56
    })
    joint.top.circle(r, r, r * 0.86, { role: 'accent', tone: 3 })
    joint.top.circle(r, r, r * 0.4, { role: 'accent', tone: 5 })
  }
  b.tube({ from: j.S, to: j.E, r: 4.6, role: 'metal', tone: 1 })
  cap(j.S, 7, 11)
  b.tube({ from: j.E, to: j.W, r: 3.8, role: 'metal', tone: 1 })
  cap(j.E, 5.6, 9)
  b.tube({ from: j.W, to: along(j.W, j.tool, 4), r: 3.2, role: 'metal', tone: 2 })
  cap(j.W, 4.4, 7.5)
  // Gripper: a palm across the tool axis and two fingers, opened in the arm's plane.
  const palmAt = along(j.W, j.tool, 5.5)
  const across = j.plane(lift + elbow + wrist + 90)
  const open = gripper === 'open' ? 4.2 : 2.2
  b.tube({
    from: along(palmAt, across, -4.6),
    to: along(palmAt, across, 4.6),
    r: 1.9,
    role: 'neutral',
    tone: 7
  })
  for (const sign of [-1, 1]) {
    const root = along(palmAt, across, sign * open)
    b.tube({
      from: root,
      to: along(along(root, j.tool, 7), across, -sign * 0.8),
      r: 1.15,
      role: 'neutral',
      tone: 7
    })
  }
}

/** A laptop opened toward the viewer: keyboard, trackpad, a screen showing an app. */
function laptop(b, { screen = 'app' } = {}) {
  const W = 34
  const D = 23
  const tilt = rad(14)
  b.shadow({ at: [0, 0], size: [W, D], radius: 2, spread: 1.5, offset: 2.5 })
  const base = b.box({ at: [0, 0, 0], size: [W, D, 1.6], radius: 1.6, role: 'metal', tone: 1 })
  base.top.rect(3, 2.4, W - 6, 10.5, { radius: 0.8, role: 'metal', tone: 3 })
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 12; col += 1) {
      base.top.rect(3.6 + col * 2.25, 3 + row * 2.45, 1.75, 1.85, {
        radius: 0.3,
        role: 'metal',
        tone: 0
      })
    }
  }
  base.top.rect(W / 2 - 6, 14.6, 12, 6.4, { radius: 0.8, role: 'metal', tone: 2 })
  const height = 22
  const up = [0, -Math.sin(tilt), Math.cos(tilt)]
  const normal = [0, Math.cos(tilt), Math.sin(tilt)]
  const hinge = [0, 0.8, 1.2]
  const topBack = along(along(hinge, up, height), normal, -1)
  const lid = b.block({
    origin: topBack,
    u: [W, 0, 0],
    v: [0, -up[1] * height, -up[2] * height],
    w: normal,
    role: 'neutral',
    tone: 8
  })
  const face = lid.face
  face.rect(1.2, 1.2, W - 2.4, height - 2.6, { radius: 0.6, role: 'white' })
  if (screen === 'app') {
    face.rect(1.2, 1.2, W - 2.4, 2.6, { radius: 0.6, role: 'neutral', tone: 1 })
    face.rect(3, 5.6, 9, 13, { radius: 0.8, role: 'neutral', tone: 1 })
    face.rect(14, 5.6, 17, 6, { radius: 0.8, role: 'accent', tone: 2 })
    face.rect(14, 13.2, 17, 1.2, { radius: 0.6, role: 'neutral', tone: 3 })
    face.rect(14, 15.6, 11, 1.2, { radius: 0.6, role: 'neutral', tone: 3 })
  } else if (screen === 'code') {
    const widths = [14, 20, 10, 17, 22, 8, 15]
    widths.forEach((width, row) => {
      face.rect(3 + (row % 3 === 1 ? 3 : 0), 3.2 + row * 2.4, width, 1.1, {
        radius: 0.55,
        role: row % 2 ? 'accent' : 'neutral',
        tone: row % 2 ? 4 : 4
      })
    })
  }
}

export const COMPUTE_OBJECTS = {
  'gpu-server': {
    title: 'GPU server rack',
    tags: ['gpu', 'server', 'rack', 'cluster', 'compute', 'datacenter', 'training', 'hardware'],
    roles: { neutral: 'cabinet and units', accent: 'GPU fronts and status lights' },
    options: [
      ['units', 5, 'server units in the rack (1–8)'],
      ['lights', true, 'a status light per unit']
    ],
    draw: gpuServer
  },
  'robot-arm': {
    title: 'Robot arm (six-axis, gripper)',
    tags: [
      'robot',
      'arm',
      'manipulator',
      'manipulation',
      'gripper',
      'franka',
      'ur5',
      'robotics',
      'embodied'
    ],
    roles: { metal: 'links and turret', accent: 'joint caps', neutral: 'base and gripper' },
    options: [
      [
        'pan',
        -15,
        'turn of the arm about its base, degrees (−15 reaches right, toward the viewer)'
      ],
      ['lift', 62, 'upper arm above horizontal, degrees'],
      ['elbow', -108, 'elbow bend, degrees'],
      ['wrist', -44, 'wrist bend, degrees'],
      ['gripper', 'open', 'open | closed'],
      ['mount', true, 'draw the round base plate and its shadow']
    ],
    draw: robotArm,
    anchors: (options = {}) => {
      const j = armJoints(options)
      return {
        gripper: along(j.T, j.tool, 4),
        wrist: j.W,
        elbow: j.E,
        shoulder: j.S,
        base: [0, 0, 6]
      }
    }
  },
  laptop: {
    title: 'Laptop',
    tags: ['laptop', 'computer', 'notebook', 'developer', 'user', 'app', 'software', 'code'],
    roles: { metal: 'body and keys', neutral: 'lid', accent: 'what the screen shows' },
    options: [['screen', 'app', 'app | code | blank']],
    draw: laptop
  }
}
