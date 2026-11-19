// The kit reference for perspective scenes (topic perspective, its own page): fig.perspective,
// its camera, the scene primitives (b.*) and the templates, built from the templates' own option
// lists so the page never drifts from them.
import { AZIMUTH_NOTE, PERSPECTIVE_TEMPLATES } from './research-figures-perspective-templates.mjs'
import { PERSPECTIVE_ENGINE_REFERENCE } from './research-figures-kit-reference-perspective-engine.mjs'
import { VIEW_PRESETS } from './research-figures-perspective-views.mjs'

/** The named views, one clause each. */
function viewText() {
  return Object.entries(VIEW_PRESETS)
    .map(([name, view]) => `view: '${name}' (${view.does})`)
    .join('; ')
}

const STROKE = "{ role, tone, pt, dash: 'dashed' | 'dotted' }"

export const PERSPECTIVE_REFERENCE = [
  {
    topic: 'perspective',
    name: 'perspective',
    call: "fig.perspective({ id, x, y, w, h, view: 'three-quarter' | 'side' | 'front' | 'top-oblique', camera, draw: (b) => … | template, options, like, scale, roles, labels, look: 'line' }) → { x, y, width, height, right, bottom, anchors, point([x, y, z]), camera, cues }",
    does: `A 3D scene seen through one camera, drawn as one vector image that repaints with the palette (NeRF rays and image planes, Mip-NeRF cones, tri-planes, camera rigs, Swin windows, voxel grids). Pick a view, not free angles: ${viewText()}. The camera never rolls and stays upright (two-point perspective): world verticals print as exact verticals, as a designer draws. camera: { azimuth, elevation, fov: 38, distance } (the default is the three-quarter view; angles snap to 5° steps and the elevation to 0–40°, with a kit note for odd ones) | { eye, at, fov } | 'oblique' | { kind: 'oblique', angle: 40, depth: 0.55 } | 'iso' | 'ortho' | 'front' (a flat 2D figure) | 'top' | another scene's id (its camera). like: '<scene id>' shares the camera, the scale and the baseline, so panels a/b show the same geometry at the same size and height; its size comes from that scale, in its own w × h or, without them, in the box of the scene it is like. The scene is fitted to w × h: size the box to the scene so it fills about 70–85% of it. Three panels of one scene (a ray, a cone, Gaussians: one template, three modes) are one fig.perspectives row with arrows between the stages. World axes: x right, y away from the viewer, z up; units are yours (the scene is fitted into w × h). Camera and pose angles: ${AZIMUTH_NOTE}. Lines farther away print thinner and lighter, faces are shaded in their own hue by a light from the upper left, planes hide what is behind them, rays split where they pierce a plane. Roles: a | ours | accent, b | output, c | model, d | input | data, neutral, ink, white, good, bad. anchors: every primitive's named points (an id, '<ray>.s3', '<plane>.tl', '<cone>.t1', 'cam1') in figure units; point([x, y, z]) any world point. labels: [{ at: anchor | [x, y, z], text | tex, side: 'right' | 'left' | 'above' | 'below' | 'above-right' | 'center' | 'outside' (away from the scene's middle), gap: 4, size }] places native text or math there. Anchors are figure points (absolute page units, not offsets inside the scene): aim arrows with from: anchors['ray1.s4'] and place text at them; the scene's own box is larger than what is drawn, so bind arrows to anchors, not to the scene id. Every template lists its anchors below; an unknown label anchor prints them all. Photos: src is relative to the project folder (data/<figure>/x.png), never to the script; kind picks a stock photo. Labels, arrows and boxes stay native around the image; never put text in the scene.`,
    options: [
      ['template', '—', `${Object.keys(PERSPECTIVE_TEMPLATES).join(' | ')} (options below)`],
      ['w, h', 'either', 'the box the scene is fitted into, aspect kept, centred'],
      ['roles', '{}', "repaint a role: { accent: 'second' | '#hex' }"]
    ]
  },
  {
    topic: 'perspective',
    name: 'b.plane',
    call: "b.plane({ id, at, axes: 'xy' | 'xz' | 'yz' | u, v | facing: [x, y, z], size: [w, h], grid: n | [nu, nv] | { n, role, tone, pt }, windows: n | { n, role, pt }, cells: [{ at: [i, j], role }], photo: path | { src | kind, crop: [x0, y0, x1, y1], fit: 'cover' | 'stretch', opacity }, role, tone, opacity, edge }) → { corners, point(s, t) }",
    does: "A flat rectangle in the scene: an image plane, a feature map, a floor tile. photo maps a picture onto it in true perspective (a project image by src, or a stock photo by kind); its rows run along u, its columns down v. grid draws pixel or patch lines that converge with the plane, windows a coarser grid in colour, cells fills pixels (a footprint). facing turns it toward a point (a camera, the viewer) and stands it upright (it turns round the vertical only; upright: false tips it fully). Anchors <id>, <id>.tl | tr | br | bl. b.onPlane(id, { cell: [i, j] }) is a pixel centre for a ray's through."
  },
  {
    topic: 'perspective',
    name: 'b.ray',
    call: "b.ray({ id, from: [x, y, z] | cameraId, through: [x, y, z] | { plane, cell: [i, j] | at: [s, t] }, to | length | extend: 3, samples: n | [shares], sample: { r, role (a role or a #hex: a sample's predicted colour), open } | [per sample], role: 'accent', pt: 0.9, head: 'end' | 'start' | 'both' | 'none', headStyle: 'filled' | 'open', before: 'solid' | 'faint' | 'none', dash })",
    does: "A camera ray through a pixel: from the camera centre (or a point) through a point or a plane's cell, on past it; samples are dots along the part after the pixel (anchors <id>.s1 …, <id>.start, <id>.end, <id>.through). Rays from one camera converge at it; the lint warns on rays parallel in a perspective scene. before: 'faint' draws the camera-to-pixel part pale."
  },
  {
    topic: 'perspective',
    name: 'b.camera',
    call: "b.camera({ id, at, lookAt, up, fov: 40, aspect: 1, size: 0.4, style: 'pyramid' | 'body' | 'eye' | 'none', role, frustum: { far, role, opacity, tone }, imagePlane: { distance, size, grid, photo, edge } }) → { center, forward, right, up, pixel(s, t, distance) }",
    does: "A camera glyph in the scene: a wire pyramid, a solid camera body (multi-view rigs), the angle-and-arc eye of a centre of projection, or nothing (just its axes for rays). frustum draws its translucent view cone; imagePlane a picture plane in front of it (photo, grid), standing upright like a shift lens's film (upright: false tilts it with the camera). pixel(s, t, d) is the world point of a pixel at distance d, for a ray's through."
  },
  {
    topic: 'perspective',
    name: 'b.cone',
    call: "b.cone({ id, apex | from: cameraId, dir | through, start: 0, length: 4, angle: 12 | radius, slices: [t…], highlight: [t0, t1], role, tone, fill: true, opacity, edge: { role, tone, pt, dash } | false, hidden: 'dash' | 'none', rims: true })",
    does: 'A cone or conical frustum (Mip-NeRF): from the apex along dir, drawn from start to length, its surface shaded in bands, rims at slices (front solid, back dashed), one frustum between highlight t0 and t1 stronger. fill: false draws only the outline (a dashed cone around Gaussians). Anchors <id>.apex, <id>.end, <id>.t0 … (under each cut) and <id>.top0 … (over it).'
  },
  {
    topic: 'perspective',
    name: 'b.gaussian',
    call: 'b.gaussian({ id, at, axis, radii: [along, across, across] | r, levels: 3, role, tone, opacity: 0.55, edge })',
    does: 'A 3D Gaussian as nested ellipsoid shells, pale to strong, its first radius along axis (Gaussians along a cone, splats). b.sphere({ id, at, r, role, tone }) is a lit sphere; b.disc({ id, at, normal, r, role }) a flat disc (a pixel footprint); b.point({ id, at, r, role, open, ring }) a dot (r in printed pt; role may be a #hex for a computed colour).'
  },
  {
    topic: 'perspective',
    name: 'b.box',
    call: `b.box({ id, at | min, size: [x, y, z], axes, role, tone, fill, wire: 'solid' | 'dashed' | 'dotted' | ${STROKE}, edge }) and b.voxels({ id, origin, cell, n: [nx, ny, nz], cells: [[i, j, k, role]] | (i, j, k) => true | role, lattice: { role, pt, dash, outer } })`,
    does: "A lit box, or with wire its twelve edges (a dotted scene bounding box); voxels draws cubes on an integer grid with only their outside faces, and lattice the grid's lines (a hash grid, a voxel volume). Anchors <id>, <id>.top, <id>.c0 … c7."
  },
  {
    topic: 'perspective',
    name: 'b.triplane',
    call: "b.triplane({ id, at, size: 2, layout: 'cross' | 'corner', grid: 8, gridStroke, role, roles: { xy, xz, yz }, photos: { xy, xz, yz }, point: [x, y, z], edge }) · b.patchGrid({ id, at, size, axes: 'xy', patches: 8, windows: 2, gap: 0, photo, role, patchRole, pt }) · b.stack({ id, count, offset: [dx, dy, dz], …plane })",
    does: 'Structured planes: three axis-aligned feature planes (cross: through one centre, cut into quarters so they occlude right; corner: three walls) with a query point projected onto each (anchors <id>.xy.foot, <id>.yz.foot …, <id>.point); a picture cut into patches with a coloured window overlay, gap separating the windows into tiles (Swin; anchors <id>, <id>.right | left | top | bottom edge middles, <id>.tl …; patchRole, patchPt, pt the window weight); count parallel planes offset apart (feature maps, layers; anchors <id>.front, <id>.back).'
  },
  {
    topic: 'perspective',
    name: 'b.floor',
    call: 'b.floor({ id, z: 0, at: [x, y], size: [w, d], step: 0.5 | grid: n, role, tone, lineTone }) · b.path({ id, points, smooth: true, role, pt, dash, head }) · b.line({ id, points }) · b.anchor(name, [x, y, z])',
    does: 'A floor under the scene with a grid that fades with distance (always painted first); a smooth curve through 3D points (a camera path, a trajectory) with an optional head; a straight line (a projection, an axis); a named point for a label.'
  },
  ...PERSPECTIVE_ENGINE_REFERENCE,
  ...Object.entries(PERSPECTIVE_TEMPLATES).map(([name, entry]) => ({
    topic: 'perspective',
    name: `template ${name}`,
    call: `fig.perspective({ id, template: '${name}', options: { … }, x, y, w, h })`,
    does: [
      entry.does,
      entry.anchors ? `Anchors: ${entry.anchors}.` : null,
      `Camera: ${cameraText(entry.camera)} unless you pass camera (like: '<scene>' shares it).`
    ]
      .filter(Boolean)
      .join(' '),
    options: entry.options
  }))
]

/** A template's own camera as the reference prints it. */
function cameraText(camera) {
  const named = (value) =>
    Object.entries(VIEW_PRESETS).find(([, view]) => view.camera === value)?.[0]
  const text = (value) =>
    named(value)
      ? `view '${named(value)}'`
      : typeof value === 'string'
        ? `'${value}'`
        : `{ ${Object.entries(value)
            .map(([key, item]) => `${key}: ${typeof item === 'string' ? `'${item}'` : item}`)
            .join(', ')} }`
  return typeof camera === 'function'
    ? `${text(camera({ dims: 3 }))}, 'front' with dims: 2`
    : text(camera)
}
