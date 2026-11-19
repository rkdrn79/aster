// Ray and cone templates: NeRF's two posed image planes with a ray through a pixel of each, and
// Mip-NeRF's ray against cone through one pixel. Their defaults are sized for a panel 200–330
// units wide: photo planes print 0.6 in or more, the two rays cross the box at clearly
// different angles, and a cone panel and a ray panel shared with `like` keep one size.
import { add, lerp3, mul, orbitEye, sub, unit } from './research-figures-perspective-camera.mjs'
import { warnKit } from './research-figures-cards.mjs'

export const asPhoto = (value) => (typeof value === 'string' ? { src: value } : value)

/**
 * Where a camera pose sits: azimuth is measured in the ground plane from +x (right), counter-
 * clockwise seen from above, so -90 is in front of the scene (the viewer's side), 0 on its right,
 * ±180 on its left and 90 behind it.
 */
export const AZIMUTH_NOTE =
  'azimuth in degrees round the scene, seen from above: 0 = its right (+x), -90 = in front (the viewer side, -y), ±180 = its left, 90 = behind; elevation lifts the camera above the scene centre (negative looks up at it)'

/**
 * The two default NeRF cameras: 40–45° to each side of the viewer, level with the scene (their
 * image planes stand upright and turn toward the viewer enough to show their photos); one ray
 * low, one high.
 */
export const NERF_POSES = [
  { azimuth: -140, elevation: 0, pixel: [0.42, 0.64] },
  { azimuth: -55, elevation: 0, pixel: [0.6, 0.34] }
]

/** Invisible dots at fixed points: the scene fits one volume whatever is drawn in it. */
function bounds(b, id, points) {
  points.forEach((at, index) => {
    b.point({ id: `${id}.bound${index}`, at, r: 5, role: 'none' })
    delete b.anchors[`${id}.bound${index}`]
  })
}

/** NeRF-style: two posed image planes, rays through a pixel each, samples inside the scene box. */
export function nerfRays(b, o) {
  const center = [0, 0, 0.55]
  const boxSize = o.boxSize ?? [2.3, 2.3, 1.15]
  if (o.box !== false) {
    b.box({ id: 'box', at: center, size: boxSize, wire: o.box ?? 'dotted' })
  }
  const viewer = { azimuth: -100, elevation: 15, ...o.viewer }
  if (o.scene) {
    const facing = orbitEye({ at: center, ...viewer, distance: 10 })
    b.plane({
      id: 'scene',
      at: add(center, [0, 0.15, 0]),
      facing,
      size: o.sceneSize ?? [2.1, 2.1],
      photo: { opacity: 0.42, ...asPhoto(o.scene) },
      role: 'none',
      edge: false,
      // Why first: the faded photo stands for the scene, so the rays and samples stay over it.
      layer: o.samplesInFront === false ? 0 : -1
    })
  }
  const poses = (o.poses ?? NERF_POSES).map((pose, index) => ({
    ...(o.poses ? { pixel: NERF_POSES[index]?.pixel } : NERF_POSES[index]),
    ...pose
  }))
  const views = o.views ?? []
  const anchors = { top: add(center, [0, 0, boxSize[2] / 2]), center }
  poses.forEach((pose, index) => {
    const n = index + 1
    const distance = pose.distance ?? 3.9
    const at =
      pose.at ??
      orbitEye({
        at: center,
        azimuth: pose.azimuth ?? -100,
        elevation: pose.elevation ?? 0,
        distance
      })
    const planeAt = pose.plane ?? distance - 1.75
    const cam = b.camera({
      id: `cam${n}`,
      at,
      lookAt: pose.lookAt ?? center,
      fov: 30,
      size: 0.22,
      style: o.cameras ? 'pyramid' : 'none',
      imagePlane: {
        id: `view${n}`,
        distance: planeAt,
        size: o.planeSize ?? [1.25, 1.45],
        grid: o.pixels ? { n: o.pixels, role: 'ink', tone: 6, pt: 0.3 } : undefined,
        photo: views[index] ? asPhoto(views[index]) : undefined,
        role: views[index] ? 'white' : 'neutral',
        tone: 0,
        edge: { pt: 0.9 }
      }
    })
    const through = cam.pixel(pose.pixel?.[0] ?? 0.5, pose.pixel?.[1] ?? 0.5, planeAt)
    const direction = unit(sub(through, at))
    const beyond = pose.length ?? 2.7
    const count = o.samples ?? 7
    const shares = Array.from(
      { length: count },
      (_, k) => 0.25 + (0.6 * k) / Math.max(1, count - 1)
    )
    const roles = o.sampleRoles?.[index] ?? []
    const colors = o.sampleColors?.[index] ?? []
    // Why per ray and per sample: a colour + density panel sizes each point by its σ.
    const sizes = Array.isArray(o.sampleSize) ? o.sampleSize[index] : o.sampleSize
    const sizeOf = (k) => (Array.isArray(sizes) ? sizes[k] : sizes) ?? 1.8
    b.ray({
      id: `ray${n}`,
      from: add(through, mul(direction, -(o.stub ?? 0.4))),
      through,
      extend: beyond,
      before: 'solid',
      role: o.rayRoles?.[index] ?? o.rayRole ?? 'accent',
      head: o.heads ?? 'end',
      headStyle: o.headStyle ?? 'open',
      samples: shares,
      sample: shares.map((_, k) => {
        const paint = colors[k] ?? roles[k] ?? null
        return {
          role: paint ?? 'ink',
          open: o.sampleStyle === 'open' && !paint,
          r: paint && !Array.isArray(sizes) ? sizeOf(k) * 1.25 : sizeOf(k)
        }
      })
    })
    anchors[`ray${n}.middle`] = add(through, mul(direction, beyond * 0.48))
    anchors[`view${n}.pixel`] = through
  })
  return { anchors }
}

/** Mip-NeRF-style: a camera at o, a pixel grid, and a ray, a cone and/or Gaussians through one pixel. */
export function mipCone(b, o) {
  const apex = [0, 0, 0]
  // Why a gentle rise: the axis recedes into the scene and climbs about 15°, a clean direction
  // a designer would draw; the image plane still stands upright across it.
  const axis = unit(o.axis ?? [0, 1, 0.27])
  const planeAt = o.planeDistance ?? 1.35
  const size = o.planeSize ?? 1.3
  const grid = o.grid ?? 3
  // Why 'cone+gaussians': the cone turns translucent and the Gaussians sit inside it (the engine
  // sorts them between its walls), one per frustum, the highlighted one strongest.
  const given = [o.mode ?? 'cone'].flat().map(String)
  const inside = o.inside === true || given.some((mode) => mode.includes('+'))
  const modes = new Set(given.flatMap((mode) => mode.split('+')))
  if (o.gaussians === true || o.gaussians === 'all') {
    modes.add('gaussians')
  }
  // Why a warning: in round 14 a cone already holding its Gaussians hid the step the figure is
  // about (a frustum approximated by a Gaussian); the two stages read only as two scenes.
  if (modes.has('cone') && modes.has('gaussians') && o.inside !== true && !o.quiet) {
    warnKit([
      "mip-cone: the cone and its Gaussians in one scene hide the step from frustum to Gaussian. For a ray-vs-cone story draw mode 'cone' and mode 'gaussians' as two scenes joined by an arrow: fig.perspectives({ scenes, arrows: [{ from: 'cone', to: 'gauss', label: '$\\mathcal{N}$' }] }) (figures kit examples ray-cone); inside: true keeps them together on purpose"
    ])
  }
  const halfAngle = o.angle ?? 9
  const slope = Math.tan((halfAngle * Math.PI) / 180)
  const end = o.length ?? 4.3
  const planeCenter = add(apex, mul(axis, planeAt))
  const footprintR = o.footprint ?? planeAt * slope
  // Why a little behind the plane: the cone's first rim is square to the rising axis, so on an
  // upright plane it would cut through the footprint; set back, the plane covers it.
  const coneStart =
    planeAt + (o.upright === false ? 0 : footprintR * Math.abs(axis[2]) * 1.1 + 0.01)
  const down = unit(sub([0, 0, -1], mul(axis, -axis[2])))
  const side = unit([axis[1], -axis[0], 0])
  // The image plane stands upright (its sides vertical) square to the axis's heading.
  const normal = unit([axis[0], axis[1], 0])
  const planeDown = o.upright === false ? down : [0, 0, -1]
  // Why fixed bounds: a ray panel and a cone panel (like) must keep one size and position.
  bounds(b, 'mip', [
    apex,
    add(add(apex, mul(axis, end * 1.04)), mul(down, end * slope * 1.1)),
    add(add(apex, mul(axis, end * 1.04)), mul(down, -end * slope * 1.1)),
    add(add(apex, mul(axis, end)), mul(side, end * slope * 1.1)),
    add(add(apex, mul(axis, end)), mul(side, -end * slope * 1.1)),
    ...[
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1]
    ].map(([s, t]) =>
      add(add(planeCenter, mul(side, (s * size) / 2)), mul(planeDown, (t * size) / 2))
    )
  ])
  // Why the footprint cell: the pixel the ray or cone passes is the centre cell of the plane.
  b.plane({
    id: 'image',
    at: planeCenter,
    facing: apex,
    upright: o.upright !== false,
    size: [size, size],
    grid: { n: grid, role: 'ink', tone: 11, pt: 0.6 },
    role: 'neutral',
    tone: 0,
    opacity: o.planeOpacity ?? 0.86,
    edge: { pt: 0.8 }
  })
  // Why a dot by default: the eye's angle glyph at o read as an arrowhead pointing back.
  if (o.camera === undefined || o.camera === 'dot') {
    b.point({ id: 'eye', at: apex, r: 2.2, role: 'ink' })
  } else if (o.camera !== false) {
    b.camera({ id: 'eye', at: apex, lookAt: planeCenter, fov: 24, size: 0.22, style: o.camera })
  }
  const role = o.role ?? 'accent'
  const sampleSize = o.sampleSize ?? 2.6
  const anchors = { o: apex, pixel: planeCenter, d: lerp3(apex, planeCenter, 0.45) }
  const slices = o.slices ?? [planeAt + (end - planeAt) * 0.34, planeAt + (end - planeAt) * 0.62]
  if (modes.has('ray')) {
    b.ray({
      id: 'ray',
      from: apex,
      dir: axis,
      length: end,
      role: 'ink',
      pt: 0.8,
      head: 'end',
      headStyle: 'filled',
      samples: [],
      before: 'solid'
    })
    // Why short of the end: a sample near the tip hid under the arrowhead.
    const shares = o.samples ?? [0.5, 0.84]
    shares.forEach((share, index) => {
      b.point({
        id: `x${index + 1}`,
        at: add(apex, mul(axis, end * share)),
        r: sampleSize * 0.8,
        // Why per sample: a colour + density panel paints each point in its predicted colour.
        role: o.sampleColors?.[index] ?? o.sampleRole ?? role,
        tone: 4
      })
      anchors[`x${index + 1}`] = add(apex, mul(axis, end * share))
    })
    const hero = o.hero ?? 0.67
    anchors.x = add(apex, mul(axis, end * hero))
    b.point({
      id: 'x',
      at: anchors.x,
      r: sampleSize * 1.1,
      role: o.heroColor ?? o.sampleRole ?? role,
      tone: 9
    })
    b.disc({
      id: 'pixel-dot',
      at: planeCenter,
      normal: o.upright === false ? axis : normal,
      r: o.footprint ?? 0.045,
      role: o.footprintRole ?? 'bad',
      tone: 6,
      edge: false
    })
  }
  const coned = modes.has('cone') || modes.has('gaussians')
  if (coned) {
    b.disc({
      id: 'footprint',
      at: planeCenter,
      normal: o.upright === false ? axis : normal,
      r: o.footprint ?? planeAt * slope,
      role: o.footprintRole ?? 'bad',
      tone: 2,
      opacity: 0.9,
      edge: { pt: 1 }
    })
    b.cone({
      id: 'near',
      apex,
      dir: axis,
      start: 0.0001,
      length: planeAt,
      angle: halfAngle,
      fill: false,
      rims: false,
      edge: { role: 'ink', tone: 11, pt: 0.8 }
    })
  }
  if (modes.has('cone')) {
    b.cone({
      id: 'cone',
      apex,
      dir: axis,
      start: coneStart,
      length: end,
      angle: halfAngle,
      slices,
      highlight: [slices[0], slices[1]],
      role,
      tone: 1,
      ...(inside ? { opacity: o.coneOpacity ?? 0.4, tone: 0 } : {})
    })
  } else if (modes.has('gaussians')) {
    b.cone({
      id: 'cone',
      apex,
      dir: axis,
      start: coneStart,
      length: end,
      angle: halfAngle,
      slices,
      fill: false,
      edge: { role, tone: 6, pt: 0.6, dash: [2.2, 1.6] }
    })
  }
  if (modes.has('gaussians')) {
    const cuts = [planeAt, ...slices, end]
    // With the cone drawn: one Gaussian on the highlighted frustum; alone: one per frustum.
    const spans = modes.has('cone') && o.gaussians !== 'all' && !inside ? [1] : [0, 1, 2]
    for (const k of spans.filter((index) => index < cuts.length - 1)) {
      const t = (cuts[k] + cuts[k + 1]) / 2
      const r = t * slope
      b.gaussian({
        id: `g${k + 1}`,
        at: add(apex, mul(axis, t)),
        axis,
        radii: [(cuts[k + 1] - cuts[k]) * 0.62, r * 0.86, r * 0.86],
        role: o.gaussianColors?.[k] ?? o.gaussianRole ?? role,
        tone: inside ? (k === 1 ? 6 : 3) : modes.has('cone') ? 4 : k === 1 ? 4 : 2,
        levels: 3,
        opacity: modes.has('cone') ? 0.85 : 0.72,
        edge: modes.has('cone') ? {} : undefined
      })
      // Why on top: a Gaussian drawn on an opaque cone would be hidden by its face; inside a
      // translucent one the engine's sort puts it between the walls.
      b.units.at(-1).layer = modes.has('cone') && !inside ? 1 : 0
      anchors[`g${k + 1}`] = add(apex, mul(axis, t))
    }
  }
  if (coned) {
    // Why a little past the rim: a label set 'below' a point on the rim overlapped the cone's
    // lower wall nearer the camera; just outside it, it names the cut and stays clear.
    anchors.t0 = add(add(apex, mul(axis, slices[0])), mul(down, slices[0] * slope * 1.35))
    anchors.t1 = add(add(apex, mul(axis, slices[1])), mul(down, slices[1] * slope * 1.35))
    anchors.top = add(add(apex, mul(axis, end)), mul(down, -end * slope))
    // The pixel footprint's radius (Mip-NeRF's r-dot): a short ink line from the pixel centre
    // to the rim, its anchor at the rim and the label spot just outside it.
    const rim = add(planeCenter, mul(side, -footprintR))
    const edge = add(planeCenter, mul(side, -(size / 2 + 0.06)))
    if (o.radius !== false) {
      b.line({ id: 'radius', points: [planeCenter, rim], role: 'ink', pt: 0.7 })
      // Why a leader to the plane's edge: the name sits off the pixel grid, tied to the radius.
      if (o.labels) {
        b.line({ id: 'radius-leader', points: [rim, edge], role: 'ink', tone: 8, pt: 0.4 })
      }
    }
    anchors.rdot = rim
    anchors['rdot.label'] = edge
  } else {
    anchors.rdot = planeCenter
  }
  anchors.end = add(apex, mul(axis, end))
  return { anchors, labels: defaultLabels(o, modes) }
}

/**
 * The usual names, placed clear of the drawing, when `labels` is true or a map of TeX by anchor
 * name ({ o: '\\mathbf{o}', t0: 't_0', rdot: '\\dot{r}' }; false drops one).
 */
function defaultLabels(o, modes) {
  if (!o.labels) {
    return []
  }
  const tex = {
    o: '\\mathbf{o}',
    d: '\\mathbf{d}',
    x: '\\mathbf{x}',
    rdot: '\\dot{r}',
    t0: 't_0',
    t1: 't_1',
    ...(typeof o.labels === 'object' ? o.labels : {})
  }
  const wanted = [
    { name: 'o', at: 'o', side: 'below' },
    ...(modes.has('ray')
      ? [
          { name: 'd', at: 'd', side: 'above-left' },
          { name: 'x', at: 'x', side: 'above-left' }
        ]
      : []),
    ...(modes.has('cone')
      ? [
          { name: 'rdot', at: 'rdot.label', side: 'left' },
          // Why apart: on a 1.1 in page the two names printed as one "t0t1"; each leans away.
          { name: 't0', at: 't0', side: 'below' },
          { name: 't1', at: 't1', side: 'below-right' }
        ]
      : [])
  ]
  return wanted
    .filter((label) => tex[label.name])
    .map((label) => ({ at: label.at, side: label.side, tex: tex[label.name] }))
}
