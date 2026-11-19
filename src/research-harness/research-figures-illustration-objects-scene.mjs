// Drawn objects for scenes: a car, people (a pictogram rig: capsules and a round head, no
// face), a person at a desk, a mobile manipulator, furniture, a room cut-away and small props.
// Same conventions as the other object tables: about a centimetre per unit, fronts on +y.
import { COMPUTE_OBJECTS } from './research-figures-illustration-objects-compute.mjs'
import { DEVICE_OBJECTS } from './research-figures-illustration-objects-devices.mjs'

const along = (p, d, k) => [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k]

/** A car seen from the front left: body, cabin with windows, four wheels. */
function car(b, { role = 'accent', lights = true } = {}) {
  const L = 46
  const W = 20
  b.shadow({ at: [1, 0], size: [L - 2, W], radius: 5, spread: 2.5, offset: 3 })
  const wheel = (x, y) => {
    const w = b.cylinder({ at: [x, y, 4.6], r: 4.6, h: 3.2, axis: 'y', role: 'neutral', tone: 9 })
    w.top.circle(4.6, 4.6, 2.3, { role: 'metal', tone: 2 })
  }
  wheel(10, -0.6)
  wheel(36, -0.6)
  b.extrude({
    at: [0, 1, 0],
    axis: 'y',
    h: W - 2,
    outline: [
      [6, 13.5],
      [33, 13.5],
      [28.5, 21],
      [12.5, 21]
    ],
    role: 'neutral',
    tone: 1
  })
  const body = b.box({ at: [0, 0, 3.4], size: [L, W, 10.4], radius: 4.2, role, tone: 3 })
  // Side windows on the cabin's +y face: two panes split by the pillar.
  const side = b.surface([0, W - 1 + 0.05, 0], [1, 0, 0], [0, 0, -1])
  side.polygon(
    [
      [8.2, -14.2],
      [19.6, -14.2],
      [19.6, -20],
      [13.2, -20]
    ],
    { role: 'neutral', tone: 7 }
  )
  side.polygon(
    [
      [21.2, -14.2],
      [31, -14.2],
      [27.6, -20],
      [21.2, -20]
    ],
    { role: 'neutral', tone: 7 }
  )
  // The windscreen on the cabin's sloped front.
  const slope = [4.5, 0, -7.5]
  const length = Math.hypot(...slope)
  const screen = b.surface(
    [28.5, W - 1, 21],
    [0, -1, 0],
    slope.map((v) => v / length)
  )
  screen.polygon(
    [
      [1.4, 0.8],
      [W - 3.4, 0.8],
      [W - 3.2, length - 1],
      [1.2, length - 1]
    ],
    { role: 'neutral', tone: 7 }
  )
  body.left.rect(3, 3.6, L - 6, 0.9, { radius: 0.45, role, tone: 5 })
  if (lights) {
    body.right.rect(1.6, 2.2, 3.6, 2, { radius: 0.8, role: 'white' })
    body.right.rect(W - 5.2, 2.2, 3.6, 2, { radius: 0.8, role: 'white' })
  }
  wheel(10, W - 2.6)
  wheel(36, W - 2.6)
}

/**
 * A person as a pictogram rig at `at`, facing `facing` degrees (0 = +x, 90 = +y): standing or
 * sitting, arms down, forward (typing) or reaching. Clothes take `role`; skin and hair their
 * materials. Returns the head's world point.
 */
export function person(
  b,
  {
    at = [0, 0, 0],
    facing = 90,
    pose = 'stand',
    arms = 'down',
    role = 'accent',
    legs = 'neutral',
    shadow = true
  } = {}
) {
  const f = [Math.cos((facing * Math.PI) / 180), Math.sin((facing * Math.PI) / 180), 0]
  const s = [-f[1], f[0], 0]
  const sit = pose === 'sit'
  const hip = along(at, [0, 0, 1], sit ? 47 : 74)
  const shoulder = along(hip, [0, 0, 1], 40)
  const head = along(shoulder, [0, 0, 1], 15)
  if (shadow && !sit) {
    b.roundShadow({ at: [at[0], at[1]], r: 13, z: at[2], offset: 2 })
  }
  // Legs: standing straight, or thighs forward and shins down when seated.
  for (const side of [-1, 1]) {
    const hipSide = along(hip, s, side * 5)
    if (sit) {
      const knee = along(hipSide, f, 36)
      b.tube({ from: hipSide, to: knee, r: 6.4, role: legs, tone: 7 })
      b.tube({ from: knee, to: along(knee, [0, 0, -1], 42), r: 5.6, role: legs, tone: 7 })
    } else {
      b.tube({
        from: hipSide,
        to: along(along(at, s, side * 5.5), [0, 0, 1], 5),
        r: 6.6,
        role: legs,
        tone: 7
      })
    }
  }
  // Arms: the far one first, then the torso, then the near one.
  const arm = (side) => {
    const from = along(along(shoulder, s, side * 11), [0, 0, 1], -4)
    const hand =
      arms === 'type'
        ? along(along(from, f, 30), [0, 0, 1], -14)
        : arms === 'reach'
          ? along(along(from, f, 36), [0, 0, 1], 2)
          : along(along(from, [0, 0, 1], -34), f, 2)
    const elbow = arms === 'down' ? null : along(along(from, f, 12), [0, 0, 1], -20)
    const parts = elbow ? [from, elbow, hand] : [from, hand]
    for (let i = 1; i < parts.length; i += 1) {
      b.tube({ from: parts[i - 1], to: parts[i], r: 4.4, role, tone: 4 })
    }
    b.sphere({ at: hand, r: 3.8, role: 'skin', tone: 3, highlight: false })
  }
  const nearSide = s[0] + s[1] >= 0 ? 1 : -1
  arm(-nearSide)
  b.tube({
    from: along(hip, [0, 0, 1], 6),
    to: along(shoulder, [0, 0, 1], -6),
    r: 13,
    role,
    tone: 3
  })
  b.tube({
    from: along(shoulder, [0, 0, 1], 0),
    to: along(shoulder, [0, 0, 1], 4),
    r: 4,
    role: 'skin',
    tone: 4
  })
  // Why the order: the face covers the hair when it turns toward the viewer, else the hair wins.
  const hair = () =>
    b.sphere({
      at: along(along(head, f, -1.4), [0, 0, 1], 1.6),
      r: 9.6,
      role: 'hair',
      tone: 8,
      highlight: false
    })
  const face = () =>
    b.sphere({
      at: along(along(head, f, 1.8), [0, 0, 1], -1),
      r: 8.6,
      role: 'skin',
      tone: 3,
      highlight: false
    })
  const seen = b.depth(f) - b.depth([0, 0, 0]) > 0
  for (const draw of seen ? [hair, face] : [face, hair]) {
    draw()
  }
  arm(nearSide)
  return head
}

/** A desk: a top on two panel legs, long along x. */
function desk(b, { at = [0, 0, 0], size = [110, 52, 74], role = 'neutral', tone = 1 } = {}) {
  const [x, y, z] = at
  const [dx, dy, h] = size
  b.box({ at: [x + 3, y + 3, z], size: [3, dy - 6, h - 3], role, tone: tone + 1 })
  b.box({ at: [x + dx - 6, y + 3, z], size: [3, dy - 6, h - 3], role, tone: tone + 1 })
  b.box({ at: [x + 6, y + 6, z + h - 22], size: [dx - 12, 2, 19], role, tone: tone + 2 })
  return b.box({ at: [x, y, z + h - 3], size: [dx, dy, 3], radius: 1, role, tone })
}

/** Someone working at a desk, seen from behind on the left: monitor, keyboard, chair. */
function personAtDesk(b, { role = 'accent', screen = 'app' } = {}) {
  b.shadow({ at: [0, 0], size: [110, 96], radius: 6, spread: 3, offset: 4 })
  desk(b, { at: [0, 0, 0] })
  b.place({ at: [14, 8, 74], scale: 1.3 }, (inner) =>
    DEVICE_OBJECTS.monitor.draw(inner, { screen })
  )
  b.box({ at: [30, 30, 74], size: [34, 12, 1.4], radius: 1, role: 'metal', tone: 1 })
  b.box({ at: [72, 32, 74], size: [8, 11, 1.4], radius: 3, role: 'metal', tone: 1 })
  b.cylinder({ at: [58, 80, 3], r: 2.4, h: 38, role: 'metal', tone: 4 })
  b.cylinder({ at: [58, 80, 0], r: 14, h: 3, role: 'neutral', tone: 7 })
  b.box({ at: [43, 64, 41], size: [30, 30, 5], radius: 4, role: 'neutral', tone: 6 })
  person(b, { at: [58, 76, 0], facing: 258, pose: 'sit', arms: 'type', role, shadow: false })
  b.box({ at: [45, 92, 48], size: [26, 4, 30], radius: 2, role: 'neutral', tone: 6 })
}

/** A mobile manipulator: a round base, a column, a camera head and one arm. */
function mobileRobot(b, { arm = true, role = 'accent' } = {}) {
  b.roundShadow({ at: [0, 0], r: 22, offset: 3 })
  b.cylinder({ at: [0, 0, 0], r: 20, h: 4, role: 'neutral', tone: 8 })
  b.cylinder({ at: [0, 0, 4], r: 19, h: 12, role: 'neutral', tone: 1 })
  b.cylinder({ at: [0, 0, 16], r: 19, h: 1.4, role, tone: 3 })
  b.box({ at: [-5, -5, 17], size: [10, 10, 82], radius: 2, role: 'neutral', tone: 1 })
  const head = b.box({
    at: [-7, -4, 99],
    size: [14, 12, 10],
    radius: 2.5,
    role: 'neutral',
    tone: 7
  })
  head.left.rect(2, 2.6, 10, 4.8, { radius: 2.4, role: 'neutral', tone: 9 })
  head.left.circle(5, 5, 1.7, { role, tone: 4 })
  if (arm) {
    b.box({ at: [-6, 5, 60], size: [12, 7, 9], radius: 1.5, role: 'neutral', tone: 6 })
    b.place({ at: [0, 9, 49], scale: 0.62 }, (inner) =>
      COMPUTE_OBJECTS['robot-arm'].draw(inner, {
        mount: false,
        pan: 60,
        lift: 22,
        elbow: -38,
        wrist: -70
      })
    )
  }
}

/** A table: a top on four legs, or with `legs: false` a thick tabletop alone (a workcell). */
function table(b, { size = [70, 50, 72], role = 'wood', tone = 2, legs = true } = {}) {
  const [dx, dy, h] = size
  b.shadow({ at: [0, 0], size: [dx, dy], radius: 3, spread: 2, offset: legs ? 4 : 2 })
  if (!legs) {
    b.box({ at: [0, 0, 0], size: [dx, dy, 8], radius: 2, role, tone })
    return
  }
  for (const [x, y] of [
    [3, 3],
    [dx - 7, 3],
    [3, dy - 7],
    [dx - 7, dy - 7]
  ]) {
    b.box({ at: [x, y, 0], size: [4, 4, h - 4], role, tone: tone + 2 })
  }
  b.box({ at: [0, 0, h - 4], size: [dx, dy, 4], radius: 1.5, role, tone })
}

/** A kitchen counter run: cabinets with doors and handles, a worktop, an optional sink. */
function counter(b, { length = 120, sink = true } = {}) {
  const D = 60
  const H = 88
  b.shadow({ at: [0, 0], size: [length, D], radius: 2, spread: 2, offset: 4 })
  b.box({ at: [0, 0, 0], size: [length, D - 2, 8], role: 'neutral', tone: 6 })
  const body = b.box({ at: [0, 0, 8], size: [length, D - 4, H - 12], role: 'neutral', tone: 1 })
  const doors = Math.max(2, Math.round(length / 40))
  const w = (length - 4) / doors
  for (let i = 0; i < doors; i += 1) {
    body.left.rect(2 + i * w + 1, 3, w - 2, H - 18, { radius: 1, role: 'neutral', tone: 0 })
    body.left.rect(2 + i * w + w / 2 - 5, 7, 10, 1.6, { radius: 0.8, role: 'metal', tone: 5 })
  }
  const top = b.box({ at: [0, 0, H - 4], size: [length, D, 4], radius: 0.8, role: 'wood', tone: 2 })
  if (sink) {
    top.top.rect(length * 0.6, 12, 34, 30, { radius: 4, role: 'metal', tone: 3 })
    top.top.rect(length * 0.6 + 2, 14, 30, 26, { radius: 3, role: 'metal', tone: 5 })
  }
}

/** A room cut-away: a floor tile and two back walls cut at about half height. */
function room(b, { size = [240, 200], wall = 110, floor = 'neutral', walls = 'neutral' } = {}) {
  const [dx, dy] = size
  const t = 8
  b.box({ at: [0, 0, -t], size: [dx, dy, t], role: floor, tone: 1 })
  b.box({ at: [-t, -t, -t], size: [t, dy + t, wall + t], role: walls, tone: 2 })
  b.box({ at: [0, -t, -t], size: [dx, t, wall + t], role: walls, tone: 2 })
}

/** A mug with a handle. */
function cup(b, { role = 'accent' } = {}) {
  b.roundShadow({ at: [0, 0], r: 5, offset: 1 })
  b.tube({ from: [0, 4.6, 3], to: [0, 4.6, 7], r: 2.2, role, tone: 4 })
  b.cylinder({ at: [0, 0, 0], r: 4.2, h: 9, role, tone: 2 })
  b.cylinder({ at: [0, 0, 8.2], r: 3.6, h: 0.6, role: 'wood', tone: 8 })
}

/** A potted plant: a pot and a few leaves. */
function plant(b) {
  b.roundShadow({ at: [0, 0], r: 9, offset: 2 })
  b.cylinder({ at: [0, 0, 0], r: 7.5, h: 14, role: 'wood', tone: 4 })
  for (const [x, y, z, r] of [
    [-3, 1, 24, 6.5],
    [4, -2, 27, 6],
    [0, 3, 32, 6.2],
    [-4, -3, 31, 5.4],
    [3, 4, 22, 5]
  ]) {
    b.sphere({ at: [x, y, z], r, role: 'leaf', tone: 4, highlight: false })
  }
}

/** A piece of fruit (or any round item): one sphere on its shadow. */
function fruit(b, { role = 'second', r = 4.5 } = {}) {
  b.roundShadow({ at: [0, 0], r: r * 0.9, offset: 1 })
  b.sphere({ at: [0, 0, r], r: r * 1.2, role, tone: 4 })
  b.tube({ from: [0, 0, r * 2], to: [0.6, -0.6, r * 2 + 2], r: 0.5, role: 'wood', tone: 7 })
}

const person1 = (b, options = {}) => person(b, { facing: 70, ...options })

export const SCENE_OBJECTS = {
  car: {
    title: 'Car',
    tags: ['car', 'vehicle', 'driving', 'autonomous', 'ego', 'traffic', 'road'],
    roles: { accent: 'the body', neutral: 'cabin, windows and tyres', metal: 'hubs' },
    options: [
      ['role', 'accent', 'the body colour role (second or neutral for other cars)'],
      ['lights', true, 'headlights']
    ],
    draw: car
  },
  person: {
    title: 'Person (pictogram, standing)',
    tags: ['person', 'human', 'user', 'annotator', 'operator', 'participant', 'people'],
    roles: {
      accent: 'clothes (the role: annotator, user)',
      skin: 'skin',
      hair: 'hair',
      neutral: 'trousers'
    },
    options: [
      ['role', 'accent', 'the clothes role: accent, second or neutral'],
      ['arms', 'down', 'down | reach | type'],
      ['facing', 70, 'degrees, 0 = toward the lower right, 90 = lower left']
    ],
    draw: person1,
    anchors: () => ({ head: [0, 0, 131], hand: [0, 8, 60] })
  },
  'person-at-desk': {
    title: 'Person working at a desk',
    tags: [
      'person',
      'desk',
      'computer',
      'user',
      'annotator',
      'labeller',
      'developer',
      'office',
      'workstation'
    ],
    roles: {
      accent: 'the person (clothes) and the screen',
      neutral: 'desk and chair',
      skin: 'skin',
      hair: 'hair'
    },
    options: [
      ['role', 'accent', 'the person’s clothes role'],
      ['screen', 'app', 'app | blank']
    ],
    draw: personAtDesk
  },
  'mobile-robot': {
    title: 'Mobile manipulator robot',
    tags: [
      'robot',
      'mobile',
      'manipulator',
      'home',
      'household',
      'embodied',
      'agent',
      'stretch',
      'fetch'
    ],
    roles: { neutral: 'base, column and head', accent: 'trim and camera', metal: 'arm' },
    options: [
      ['arm', true, 'mount the arm'],
      ['role', 'accent', 'trim and camera role']
    ],
    draw: mobileRobot,
    anchors: () => ({ head: [0, 2, 104], base: [0, 0, 10] })
  },
  table: {
    title: 'Table',
    tags: ['table', 'tabletop', 'desk', 'furniture', 'workbench'],
    roles: { wood: 'top and legs' },
    options: [
      ['size', [70, 50, 72], 'width, depth and height'],
      ['role', 'wood', 'material role']
    ],
    draw: table,
    anchors: (options = {}) => {
      const [dx, dy, h] = options.size ?? [70, 50, 72]
      return { top: [dx / 2, dy / 2, options.legs === false ? 8 : h] }
    }
  },
  counter: {
    title: 'Kitchen counter',
    tags: ['kitchen', 'counter', 'cabinet', 'sink', 'household', 'home', 'embodied'],
    roles: { neutral: 'cabinets', wood: 'worktop', metal: 'sink and handles' },
    options: [
      ['length', 120, 'length'],
      ['sink', true, 'a sink in the worktop']
    ],
    draw: counter
  },
  room: {
    title: 'Room cut-away',
    tags: ['room', 'floor', 'wall', 'house', 'indoor', 'scene', 'environment', 'simulation'],
    roles: { neutral: 'floor and walls' },
    options: [
      ['size', [240, 200], 'floor size'],
      ['wall', 110, 'wall height']
    ],
    draw: room
  },
  cup: {
    title: 'Mug',
    tags: ['cup', 'mug', 'object', 'household', 'grasp'],
    roles: { accent: 'the mug' },
    options: [['role', 'accent', 'colour role']],
    draw: cup
  },
  plant: {
    title: 'Potted plant',
    tags: ['plant', 'pot', 'decor', 'household'],
    roles: { leaf: 'leaves', wood: 'pot' },
    options: [],
    draw: plant
  },
  fruit: {
    title: 'Fruit (an apple, an orange)',
    tags: ['fruit', 'apple', 'orange', 'object', 'food', 'grasp'],
    roles: { second: 'the fruit' },
    options: [
      ['role', 'second', 'colour role'],
      ['r', 4.5, 'radius']
    ],
    draw: fruit,
    anchors: (options = {}) => ({ top: [0, 0, (options.r ?? 4.5) * 2.2] })
  }
}
