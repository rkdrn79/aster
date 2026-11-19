// The worked examples drawn as perspective scenes (figures kit examples): rays through posed
// image planes, a ray beside a cone, a tri-plane, a camera rig and Swin's windows. Scripts are
// kept as text (orcad ships the harness as one bundle) and never use template literals.
// The round 14 engine shows in ray-cone (fig.perspectives, a translucent cone with Gaussians
// inside), object-scene (cel look, outlines, a light and its shadows, lathe, ellipsoid, blob,
// tube, photos on a box's faces) and volume-boxes (glass boxes, a sun, a camera body).

const rays = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// Rays through two posed image planes, samples in the scene box, a curve into the network.
const fig = await openFigure(new URL('../pixel-rays.excalidraw', import.meta.url))
fig.reset()
fig.style('vision')
const { width: W, height: H } = fig.page // every position below follows the page
// Stock photos stand in: use the project's own, e.g. scene: 'data/<figure>/scene.png'.
const bird = (crop) => ({ kind: 'bird', crop })
const a = fig.perspective({
  id: 'scene', template: 'nerf-rays', x: 12, y: 12, w: W - 152, h: H - 24,
  options: { scene: bird([0.05, 0, 0.75, 1]), views: [bird([0, 0, 0.5, 1]), bird([0.2, 0.05, 0.62, 1])] },
  labels: [{ at: 'ray1.start', text: 'ray 1', side: 'outside' }, { at: 'ray2.start', text: 'ray 2', side: 'outside' }]
})
const x = W - 108 // the network keeps the right margin; the curve spans the gap
const mlp = fig.nn({ id: 'mlp', x, y: H / 2 - 56, w: 96, h: 64, layers: [3, 4, 3], label: 'field $f_\\theta$' })
fig.curve({ id: 'to-mlp', from: a.anchors['ray2.s7'], to: [x - 4, H / 2 - 24], bend: 16, role: 'main' })
fig.math({ id: 'in', tex: '(\\mathbf{p}, \\mathbf{d})', cx: x + 48, y: H / 2 + 32, size: 16 })
fig.math({ id: 'out', tex: '(\\mathbf{c}, \\sigma)', cx: x + 48, y: H / 2 + 60, size: 16 })
console.log(JSON.stringify(await fig.save()))
`

const cone = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// A ray beside a cone through one pixel, then the cone's frustums approximated by Gaussians:
// three scenes in one fig.perspectives row (one camera, one scale), an arrow between the stages.
const fig = await openFigure(new URL('../ray-cone.excalidraw', import.meta.url))
fig.reset()
fig.style('vision')
const { width: W, height: H } = fig.page // every position below follows the page
const { scenes: [ray, cone, gauss] } = fig.perspectives({
  x: 12, y: 28, w: W - 24, h: H - 60,
  scenes: [
    { id: 'ray', template: 'mip-cone', options: { mode: 'ray', labels: true } },
    { id: 'cone', template: 'mip-cone', options: { mode: 'cone', labels: true } },
    { id: 'gauss', template: 'mip-cone', options: { mode: 'gaussians' } }
  ],
  arrows: [{ from: 'cone', to: 'gauss', label: '$\\mathcal{N}$' }]
})
// What each stage encodes, named above it with a short curve from the point or the Gaussians.
for (const [scene, at, tex] of [[ray, 'x', '\\gamma(\\mathbf{x})'], [gauss, 'g2', 'E[\\gamma(\\mathbf{x})]']]) {
  const [px, py] = scene.anchors[at]
  fig.math({ id: scene.id + '-enc', tex, cx: px - 24, y: 12, size: 16 })
  const m = fig.bounds(scene.id + '-enc')
  fig.curve({ id: scene.id + '-to-enc', from: [px - 3, py - 4], to: [m.x + m.width / 2, m.y + m.height + 4], bend: -10 })
}
fig.subcaption({ id: 'cap-a', under: 'ray', label: 'a)', text: 'NeRF', y: ray.bottom + 2 })
fig.subcaption({ id: 'cap-b', label: 'b)', text: 'Mip-NeRF', cx: (cone.x + gauss.right) / 2, y: ray.bottom + 2 })
console.log(JSON.stringify(await fig.save()))
`

const triplane = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// Three feature planes named natively, a query point projected; curves from the feet onward.
const fig = await openFigure(new URL('../triplane-render.excalidraw', import.meta.url))
fig.reset()
fig.style('vision')
const { width: W, height: H } = fig.page // every position below follows the page
const g8 = (v) => Math.round(v / 8) * 8
const t = fig.perspective({ id: 'tri', template: 'triplane', x: 12, y: 12, w: W * 0.44, h: H - 24,
  options: { labels: { xy: 'F_{xy}', xz: 'F_{xz}', yz: 'F_{yz}' } } })
const [cx, top, low] = [g8(t.right + 32), g8(H * 0.22), g8(H * 0.62)]
fig.box({ id: 'sum', label: 'sum', x: cx, y: top, w: 64, h: 40, color: 'c' })
for (const [plane, bend] of [['xy', 12], ['xz', -10], ['yz', -4]]) {
  fig.curve({ id: plane + '-sum', from: t.anchors[plane], to: [cx - 4, top + 20], bend, role: 'cond' })
}
fig.box({ id: 'dec', label: 'decoder', x: cx - 8, y: low, w: 80, h: 40, color: 'a' })
fig.arrow({ id: 'sum-dec', from: 'sum', to: 'dec' })
const side = Math.min(112, H - 32)
fig.image({ id: 'img', kind: 'bird', x: W - 12 - side, y: g8((H - side) / 2), w: side, h: side })
fig.arrow({ id: 'dec-img', from: 'dec', to: 'img' })
console.log(JSON.stringify(await fig.save()))
`

const rig = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// Cameras with view cones around the object photo; one input view picked out beside the rig.
const fig = await openFigure(new URL('../multiview-rig.excalidraw', import.meta.url))
fig.reset()
fig.style('vision')
const { width: W, height: H } = fig.page // every position below follows the page
const bird = { kind: 'bird', crop: [0.05, 0, 0.75, 1] }
const r = fig.perspective({ id: 'rig', template: 'camera-rig', options: { object: bird }, x: 12, y: 12, w: W - 160, h: H - 24,
  labels: [{ at: 'cam1.label', tex: '\\pi_1', side: 'outside' }, { at: 'cam4.label', tex: '\\pi_4', side: 'right' }] })
const x = r.right + 24
fig.image({ id: 'view', kind: 'bird', x, y: H / 2 - 32, w: 104, h: 80 })
fig.arrow({ id: 'cam3-view', from: r.anchors.cam3, to: 'view', role: 'cond' })
fig.text({ id: 'view-t', text: 'input view', cx: x + 52, y: H / 2 - 58, size: 14 })
console.log(JSON.stringify(await fig.save()))
`

const swin = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// Hierarchical windows beside one global window: stacked oblique maps on one camera and scale.
const fig = await openFigure(new URL('../swin-vit.excalidraw', import.meta.url))
fig.reset()
fig.style('vision')
const { width: W, height: H } = fig.page // every position below follows the page
const photo = { kind: 'street' }
const [w, h] = [W / 2 - 56, H - 46]
const a = fig.perspective({ id: 'swin', template: 'swin', options: { photo }, x: 12, y: 12, w, h })
const b = fig.perspective({ id: 'vit', template: 'swin', options: { photo, vit: true }, like: 'swin', x: W / 2 + 12, y: 12 })
for (const [scene, names] of [[a, ['4×', '8×', '16×']], [b, ['16×', '16×', '16×']]]) {
  names.forEach((text, i) => {
    const [x, y] = scene.anchors['level' + (i + 1) + '.right']
    fig.text({ id: scene.id + '-n' + i, text, x: x + 8, cy: y, size: 14 })
  })
}
fig.subcaption({ id: 'cap-a', under: 'swin', label: '(a)', text: 'local windows' })
fig.subcaption({ id: 'cap-b', under: 'vit', label: '(b)', text: 'one global window', y: a.bottom + 6 })
console.log(JSON.stringify(await fig.save()))
`

const objects = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// A small lit 3D scene: objects on a floor in one cel-shaded look with ink outlines, a sun that
// casts their shadows, a photo on a crate's faces and the path a gripper follows. Labels native.
const fig = await openFigure(new URL('../object-scene.excalidraw', import.meta.url))
fig.reset()
fig.style('robotics')
const { width: W, height: H } = fig.page // every position below follows the page
const s = fig.perspective({
  id: 'scene', x: 12, y: 12, w: W - 148, h: H - 24, view: 'three-quarter',
  draw: (b) => {
    b.look({ shading: 'cel', outline: { pt: 0.6, tone: 9 } })
    b.floor({ id: 'floor', z: 0, size: [2.8, 2], step: 0.4 })
    b.light({ id: 'sun', at: [-1.3, -0.9, 1.5], r: 4 })
    b.box({ id: 'crate', at: [-0.65, 0.35, 0.5], size: [1, 1, 1], photos: { front: { kind: 'street' }, right: { kind: 'street' } } })
    b.lathe({ id: 'cup', at: [0.45, 0.45, 0], profile: [[0, 0], [0.24, 0], [0.3, 0.6], [0.27, 0.6]], role: 'b' })
    b.ellipsoid({ id: 'ball', at: [0.75, -0.35, 0.24], r: 0.24, role: 'accent' })
    b.blob({ id: 'cell', balls: [{ at: [-0.1, -0.5, 0.2], r: 0.22 }, { at: [0.18, -0.45, 0.22], r: 0.17 }], role: 'c' })
    b.tube({ id: 'path', points: [[-1.2, -0.7, 1.1], [-0.4, -0.3, 1.25], [0.4, 0.1, 1.05], [0.75, -0.35, 0.6]], r: 0.03, role: 'a' })
  },
  labels: [{ at: 'cup', text: 'target', side: 'right', gap: 30 }, { at: 'ball', text: 'obstacle', side: 'below', gap: 30 }]
})
const x = W - 12 - 96 // the policy at the page's right margin, the scene's arrow runs to it
fig.box({ id: 'policy', label: 'policy $\\pi_\\theta$', x, y: Math.round(H / 2 / 8) * 8 - 16, w: 96, h: 40, color: 'a' })
fig.arrow({ id: 'obs', from: [s.right + 4, Math.round(H / 2 / 8) * 8 + 4], to: 'policy', label: 'view' })
console.log(JSON.stringify(await fig.save()))
`

const volume = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// 3D fields rendered by a camera: glass boxes holding a density (splats) and two pictures, beams
// between them, a sun lighting the first, and a camera body rendering the last onto its plane.
const fig = await openFigure(new URL('../volume-boxes.excalidraw', import.meta.url))
fig.reset()
fig.style('generative')
const { width: W, height: H } = fig.page // every position below follows the page
const bird = { kind: 'bird', crop: [0.1, 0, 0.75, 1] }
const v = fig.perspective({
  id: 'vol', template: 'volume-boxes', x: 12, y: 12, w: W - 160, h: H - 24,
  options: { photos: [null, bird, bird], render: bird },
  labels: [
    { at: 'box1.bottom', tex: '\\text{density } \\sigma', side: 'below', gap: 6 },
    { at: 'box2.bottom', tex: '\\text{albedo } \\rho', side: 'below', gap: 6 },
    { at: 'box3.bottom', tex: '\\text{colour } \\mathbf{c}', side: 'below', gap: 6 },
    { at: 'sun', text: 'light', side: 'below', gap: 24 },
    { at: 'cam', text: 'camera', side: 'below', gap: 14 }
  ]
})
// What the render is used for sits beside the scene, native: an arrow from the camera's anchor.
fig.box({ id: 'loss', label: 'image loss', x: W - 120, y: Math.round(H * 0.6 / 8) * 8, w: 104, h: 40, color: 'a' })
fig.arrow({ id: 'cam-loss', from: v.anchors.cam, to: 'loss', role: 'grad' })
console.log(JSON.stringify(await fig.save()))
`

export const SCENE_EXAMPLES = [
  {
    name: 'pixel-rays',
    title: 'camera rays through two posed image planes into a scene box, then a network',
    page: '3.25x1.6',
    uses: "perspective template 'nerf-rays' (photos, labels at 'ray1.start'), nn, curve from a sample anchor, math",
    render:
      'a faded photo floating in a dotted 3D box, two upright photo planes left and right (about 0.65 in each) with an orange ray through a pixel of each, dark sample dots along both rays crossing inside the box, "ray 1"/"ray 2" outside the planes; a dark curve from the last sample into a network drawn as three thin bars named field f_θ at the right margin, with (p, d) and (c, σ) under it',
    script: rays
  },
  {
    name: 'ray-cone',
    title:
      'a ray with point samples beside a cone with conical frustums and a Gaussian, one camera',
    page: '3.25x1.6',
    uses: "fig.perspectives (one camera and scale for both), template 'mip-cone' (mode 'ray', mode 'cone+gaussians'), labels at anchors, a curve pointer, subcaption with y",
    render:
      'two panels of the same size: (a) a gridded pixel plane, a black ray from the eye o through the centre pixel with orange sample dots and a larger one labelled x; (b) the same plane and eye with a translucent orange cone opening through the pixel, a Gaussian inside each frustum (the one between t0 and t1 strongest), named 𝒩(μ, Σ) above-left with a short curved pointer',
    script: cone
  },
  {
    name: 'triplane-render',
    title: 'three feature planes with a query point projected, summed and decoded to an image',
    page: '3.25x1.6',
    uses: "perspective template 'triplane' (labels), curves from the plane feet (anchors xy, xz, yz), box, arrow, image",
    render:
      'three light-blue gridded planes crossing in 3D labelled F_xy, F_xz, F_yz, a red query point with its dashed projections and three green curves from the feet into a blue "sum" box, an arrow down to an orange "decoder" box and on to a photo',
    script: triplane
  },
  {
    name: 'multiview-rig',
    title: 'cameras with view cones around an object, one view taken as input',
    page: '3.25x1.6',
    uses: "perspective template 'camera-rig' (object photo, cam labels), image, arrow from a camera anchor",
    render:
      'the object photo standing in a dotted box with four black camera bodies around it, each casting a pale orange view cone, π1 and π4 named; a green arrow from one camera to the input-view photo on the right under its title',
    script: rig
  },
  {
    name: 'swin-vit',
    title: 'hierarchical local windows beside a single global window, stacked feature maps',
    page: '3.25x1.6',
    uses: "perspective template 'swin' (photo; vit: true with like), text at 'level<n>.right' anchors, subcaption",
    render:
      'two stacks of three oblique photo maps with red window outlines: on the left the windows shrink in number up the stack (16, 4, 1 windows; 4×, 8×, 16× beside them), on the right three equal single-window maps (16× each); (a) and (b) captions on one baseline',
    script: swin
  },
  {
    name: 'object-scene',
    title:
      'a lit 3D scene: objects on a floor with their shadows, a photo on a box, a path above them',
    page: '3.25x1.6',
    uses: "fig.perspective draw: b.look({ shading: 'cel', outline }), b.floor, b.light({ at }), b.box({ photos }), b.lathe, b.ellipsoid, b.blob, b.tube; labels; a native box and arrow",
    render:
      'a pale gridded floor in perspective with a crate wearing a street photo on two faces, a tan cup, a pink two-lobed blob and a green ball, all cel-shaded with ink outlines and soft shadows cast away from a small sun at the upper left; a green tube arcs over them to the ball; "target" and "obstacle" beside their objects; an arrow "view" to a green policy box',
    script: objects
  },
  {
    name: 'volume-boxes',
    title: 'a pipeline of 3D fields in glass boxes, lit by a sun and rendered by a camera',
    page: '6.75x1.9',
    uses: "perspective template 'volume-boxes' (photos per box, a splat cloud for a density, render), labels at box<n>.bottom, sun and cam; a native box with a grad arrow from the camera anchor",
    render:
      'a sun with a pale beam into the first of three thin-edged glass boxes in a row (orange splats for the density, then a bird picture standing in each of the next two), gray beams between the boxes, a black camera body at the end whose view cone casts the last box onto its image plane; density σ, albedo ρ, colour c under the boxes, light and camera named, an orange arrow from the camera to an image loss box',
    script: volume
  }
]
