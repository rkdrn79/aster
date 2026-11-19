// Plane and grid templates: EG3D's tri-plane, a multi-view camera rig, Swin's stacked windows
// and Instant-NGP's multiresolution grid. Each returns its anchors (and, when asked, native
// labels placed at them), so arrows and text meet the drawn parts rather than the scene's box.
import { add, mul, orbitEye, sub, unit } from './research-figures-perspective-camera.mjs'
import { asPhoto } from './research-figures-perspective-templates-rays.mjs'

const PLANES = ['xy', 'xz', 'yz']

/** A label spec for each named entry of `given` (a string, or { text | tex, side }). */
function labelsAt(given, anchorOf, sides = {}) {
  return Object.entries(given ?? {})
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([name, value]) => {
      const spec = typeof value === 'object' ? value : { [isTex(value) ? 'tex' : 'text']: value }
      return { at: anchorOf(name), side: sides[name] ?? 'outside', ...spec }
    })
}

const isTex = (value) => /[\\_^]/.test(String(value))

/** A tri-plane: three axis-aligned feature planes through one centre, a query point projected. */
export function triplane(b, o) {
  const size = o.size ?? 2
  const point = o.point === false || o.point === null ? null : (o.point ?? [0.42, -0.38, 0.32])
  const made = b.triplane({
    id: 'tri',
    at: [0, 0, 0],
    size,
    grid: o.grid ?? 8,
    layout: o.layout ?? 'cross',
    role: o.role ?? 'third',
    roles: o.roles,
    tone: 0,
    photos: o.photos,
    point,
    pointRole: o.pointRole,
    edge: { role: 'ink', tone: 11, pt: 0.6 }
  })
  const h = size / 2
  const corner = (o.layout ?? 'cross') === 'corner'
  // Where each plane's name goes: a tip the default camera shows clear of the other planes.
  const spots = corner
    ? { xy: [h * 0.2, -h, -h], xz: [0, h, h], yz: [-h, -h * 0.2, h] }
    : { xy: [-h, -h, 0], xz: [-h, 0, h], yz: [0, h, h] }
  const sides = corner
    ? { xy: 'below', xz: 'above', yz: 'above-left' }
    : { xy: 'below', xz: 'above-left', yz: 'above-right' }
  const anchors = {}
  for (const name of PLANES) {
    anchors[`${name}.label`] = spots[name]
    // Why a fallback: with no query point the foot anchors still exist (the plane's label spot).
    anchors[name] = made.feet[name] ?? spots[name]
  }
  if (point) {
    anchors.point = point
  }
  const labels = labelsAt(o.labels, (name) => `${name}.label`, sides)
  return { anchors, labels }
}

/** Cameras around an object: solid camera glyphs with view frustums, the object in a box. */
export function cameraRig(b, o) {
  const center = [0, 0, 0]
  const photo = o.object ? asPhoto(o.object) : null
  // Why the photo's aspect: a landscape picture on a portrait card is cropped to its middle.
  const loaded = photo ? b.loadPhoto(photo) : null
  const aspect = loaded ? loaded.width / loaded.height : 1.4 / 2.1
  const longest = 2
  const size =
    o.objectSize ?? (aspect >= 1 ? [longest, longest / aspect] : [longest * aspect, longest])
  const box = [size[0] * 1.15, size[0] * 1.15, size[1] * 1.08]
  if (o.box !== false) {
    b.box({ id: 'box', at: center, size: box, wire: o.box ?? 'dotted' })
  }
  if (photo) {
    const facing = orbitEye({ at: center, azimuth: -90, elevation: 8, distance: 10 })
    b.plane({ id: 'object', at: center, facing, size, photo, role: 'none', edge: false })
  } else {
    b.sphere({ id: 'object', at: center, r: size[0] * 0.4, role: o.objectRole ?? 'neutral' })
  }
  const reach = Math.max(...size)
  const cameras = o.cameras ?? [
    { azimuth: 200, elevation: 28 },
    { azimuth: 160, elevation: -6 },
    { azimuth: -14, elevation: 14 },
    { azimuth: 95, elevation: 78 }
  ]
  const anchors = {}
  cameras.forEach((spot, index) => {
    const n = index + 1
    const distance = spot.distance ?? reach * 1.05
    const at = orbitEye({ at: center, azimuth: spot.azimuth, elevation: spot.elevation, distance })
    const bodySize = o.cameraSize ?? reach * 0.17
    b.camera({
      id: `cam${n}`,
      at,
      lookAt: center,
      up: Math.abs(spot.elevation) > 60 ? [0, 1, 0] : [0, 0, 1],
      fov: 30,
      size: bodySize,
      style: 'body',
      role: 'ink',
      frustum:
        o.frustum === false
          ? null
          : {
              far: spot.reach ?? distance * 0.85,
              role: o.frustumRole ?? 'accent',
              opacity: 0.3,
              tone: 3
            }
    })
    anchors[`cam${n}`] = at
    // Why behind the body: the centre of projection sits inside the glyph; a name goes past it.
    anchors[`cam${n}.label`] = add(at, mul(unit(sub(at, center)), bodySize * 1.5))
  })
  anchors.bottom = [0, 0, -box[2] / 2]
  anchors.top = [0, 0, box[2] / 2]
  return { anchors }
}

/** Swin-style hierarchical windows: stacked oblique feature maps, patches merging upward. */
export function swinWindows(b, o) {
  const levels =
    o.levels ??
    (o.vit
      ? [
          { patches: 4, windows: 1 },
          { patches: 4, windows: 1 },
          { patches: 4, windows: 1 }
        ]
      : [
          { patches: 16, windows: 4, gap: 0.09 },
          { patches: 8, windows: 2, gap: 0.09 },
          { patches: 4, windows: 1 }
        ])
  const spacing = o.spacing ?? 1.05
  const size = o.size ?? 2
  // Why washed: a busy photo on every map drowned the window lines (judges); 0.35 keeps it a hint.
  const photo = o.photo ? { wash: 0.35, ...asPhoto(o.photo) } : undefined
  levels.forEach((level, index) => {
    const dense = level.patches / (level.windows || 1) > 3 && level.gap
    b.patchGrid({
      id: `level${index + 1}`,
      at: [0, 0, index * spacing],
      size,
      patches: level.patches,
      windows: level.windows,
      gap: level.gap ?? 0,
      photo,
      role: o.role ?? 'bad',
      tone: 6,
      pt: o.windowPt ?? 0.8,
      patchRole: o.patchRole ?? (photo ? 'white' : 'ink'),
      patchPt: o.patchPt ?? (dense ? 0.4 : 0.5),
      ...(o.patchGap ? { patchGap: o.patchGap } : {})
    })
  })
  // The levels' own anchors (level1.right, level1.top …) are the ones a custom b.patchGrid has.
  return { anchors: { top: [0, size / 2, (levels.length - 1) * spacing] } }
}

/** Multiresolution hash grid: two levels of voxel lattices around x, corner vertices marked. */
export function hashGrid(b, o) {
  const dims = o.dims ?? 3
  const size = o.size ?? 2
  const levels = o.levels ?? [2, 3]
  const roles = o.roles ?? ['bad', 'third']
  const anchors = {}
  const labels = []
  // Why `level`: a figure that draws each resolution in its own row (Instant-NGP's 2D view, one
  // row per level beside its hash table) draws one level per scene, in that level's colour and
  // numbering, over the same domain.
  const drawn = (level) => o.level === undefined || o.level === null || o.level === level
  if (o.level !== undefined && o.level !== null && !(o.level >= 0 && o.level < levels.length)) {
    throw new Error(
      `hash-grid level ${o.level}: levels has ${levels.length} entries (0 … ${levels.length - 1})`
    )
  }
  if (dims === 2) {
    // A 2D point is [x, y] shares of the domain, x right and y up; [x, _, z] is read as x, z.
    const given = o.point ?? [0.62, 0.38]
    const [px, py] = given.length >= 3 ? [given[0], given[2]] : given
    if (![px, py].every(Number.isFinite)) {
      throw new Error(
        `hash-grid dims 2: point is [x, y] shares of the domain, not ${JSON.stringify(given)}`
      )
    }
    const plane = b.plane({
      id: 'domain',
      at: [0, 0, 0],
      axes: 'xz',
      size: [size, size],
      photo: o.photo ? { opacity: 0.45, ...asPhoto(o.photo) } : undefined,
      role: o.photo ? 'white' : 'neutral',
      tone: 0,
      edge: { pt: 0.8 }
    })
    const at = (s, t) => plane.point(s, t)
    anchors['domain.left'] = at(0, 0.5)
    anchors['domain.right'] = at(1, 0.5)
    anchors['domain.top'] = at(0.5, 0)
    anchors['domain.bottom'] = at(0.5, 1)
    levels.forEach((n, level) => {
      if (!drawn(level)) {
        return
      }
      const role = roles[level]
      for (let k = 1; k < n; k += 1) {
        for (const [name, points] of [
          [`l${level}.gu${k}`, [at(k / n, 0), at(k / n, 1)]],
          [`l${level}.gv${k}`, [at(0, k / n), at(1, k / n)]]
        ]) {
          b.line({ id: name, points, role, tone: 5, pt: 0.6, dash: 'dashed' })
        }
      }
      const [i, j] = [
        Math.min(n - 1, Math.floor(px * n)),
        Math.min(n - 1, Math.floor((1 - py) * n))
      ]
      const cell = [
        [i, j],
        [i + 1, j],
        [i + 1, j + 1],
        [i, j + 1]
      ]
      const corners = cell.map(([a, c]) => at(a / n, c / n))
      b.path({
        id: `l${level}.cell`,
        points: [...corners, corners[0]],
        smooth: false,
        role,
        tone: 6,
        pt: 1.4
      })
      corners.forEach((corner, v) => {
        b.point({ id: `l${level}.v${v}`, at: corner, r: 4.2, role, tone: 6, open: true })
      })
      labels.push(
        ...vertexLabels(
          o.numbers,
          level,
          cell.map(([a, c]) => [a / n - 0.5, c / n - 0.5])
        )
      )
    })
    b.point({ id: 'x', at: at(px, 1 - py), r: 2.2, role: 'ink', open: true })
    return { anchors, labels }
  }
  b.box({
    id: 'domain',
    at: [size / 2, size / 2, size / 2],
    size: [size, size, size],
    wire: { role: 'ink', tone: 9, pt: 0.5 }
  })
  const share = o.point ?? [0.56, 0.38, 0.6]
  if (share.length !== 3 || !share.every(Number.isFinite)) {
    throw new Error(
      `hash-grid: point is [x, y, z] shares of the domain (dims 2: [x, y]), not ${JSON.stringify(share)}`
    )
  }
  const point = mul(share, size)
  levels.forEach((n, level) => {
    if (!drawn(level)) {
      return
    }
    const cell = size / n
    const role = roles[level]
    b.voxels({
      id: `l${level}.lattice`,
      origin: [0, 0, 0],
      cell,
      n: [n, n, n],
      cells: [],
      lattice: { role, tone: 4, pt: 0.4, dash: level > 0, outer: true }
    })
    const ijk = point.map((value) => Math.min(n - 1, Math.floor(value / cell)))
    const corner = (a, c, d) => [(ijk[0] + a) * cell, (ijk[1] + c) * cell, (ijk[2] + d) * cell]
    b.box({
      id: `l${level}.cell`,
      min: corner(0, 0, 0),
      size: [cell, cell, cell],
      wire: { role, tone: 7, pt: 1.1 }
    })
    let v = 0
    const offsets = []
    for (const a of [0, 1]) {
      for (const c of [0, 1]) {
        for (const d of [0, 1]) {
          b.point({ id: `l${level}.v${v}`, at: corner(a, c, d), r: 2.4, role, tone: 6, open: true })
          offsets.push([a - 0.5, 0.5 - d])
          v += 1
        }
      }
    }
    labels.push(...vertexLabels(o.numbers, level, offsets))
  })
  b.point({ id: 'x', at: point, r: 2.2, role: 'ink' })
  anchors.x = point
  return { anchors, labels }
}

/**
 * Native numbers beside a level's vertex rings (`numbers: true` counts 0…, or per level a list
 * such as [[0, 1, 2, 3], [4, 5, 6, 7]]): each on the side away from its cell's centre.
 */
function vertexLabels(numbers, level, offsets) {
  if (!numbers) {
    return []
  }
  const names = numbers === true ? null : numbers[level]
  if (numbers !== true && !names) {
    return []
  }
  return offsets.map(([dx, dy], v) => ({
    at: `l${level}.v${v}`,
    text: String(names ? names[v] : v),
    side: `${dy < 0 ? 'above' : 'below'}-${dx < 0 ? 'left' : 'right'}`,
    gap: 3,
    size: 14
  }))
}
