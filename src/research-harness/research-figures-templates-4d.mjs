// The 4D (dynamic scene) reconstruction teaser: the input video as a space-time volume with the
// objects' tracks threading its frames, a model, and the reconstructed scene at several times on
// one camera with a novel-view frustum, keyed by a time colourbar. The registry in
// research-figures-templates.mjs spreads it in.
import { makeSnapshots3d } from './research-figures-glyphs-4d.mjs'

/** The default scene: a ball thrown over a box, and the camera of a novel view. */
const SCENE = {
  objects: [
    {
      kind: 'sphere',
      at: [-0.7, -0.45, 0.12],
      to: [0.65, 0.35, 0.12],
      arc: 0.75,
      r: 0.13,
      ghosts: 2
    },
    { kind: 'box', at: [0.05, -0.05, 0], size: [0.4, 0.4, 0.34], color: 'mid' }
  ],
  cameras: [{ at: [-1.05, -1.1, 0.85], look: [0, 0, 0.2], size: 0.34, fov: 50 }]
}

function dynamicTeaser(fig, spec) {
  const { id, x = 0, y = 0, w = 900, h = 214, gap = 28 } = spec
  const frames = spec.frames ?? 5
  const times = spec.times ?? [0, 0.5, 1]
  const captions = spec.captions ?? [
    'input video as a space-time volume',
    'reconstructed scene at new times and views'
  ]
  const captionRoom = 24
  const volumeW = Math.round(w * 0.27)
  const modelW = spec.modelWidth ?? 84
  const body = h - captionRoom
  fig.spacetime({
    id: `${id}-input`,
    x,
    y,
    w: volumeW,
    h: body,
    frames,
    content: 'grid',
    tracks: spec.tracks ?? [
      { from: [0.12, 0.25], to: [0.85, 0.3], bend: 0.45 },
      { from: [0.5, 0.15], to: [0.5, 0.15], bend: 0, color: 'mid', r: 2.6 }
    ]
  })
  const modelX = x + volumeW + gap
  fig.box({
    id: `${id}-model`,
    x: modelX,
    y: y + body / 2 - 22,
    w: modelW,
    h: 44,
    ...(spec.model === undefined || /\\|_|\^/.test(spec.model)
      ? { math: spec.model ?? '\\mathcal{G}_\\theta(x, t)' }
      : { label: spec.model }),
    color: spec.color ?? 'accent'
  })
  const sceneX = modelX + modelW + gap
  const sceneW = x + w - sceneX
  const scene = { ...SCENE, ...spec.scene }
  // Why a dry run: the panels' drawn height follows their width, and the block (scenes, t labels,
  // the timebar) is centred on the volume's middle, level with the model.
  const sceneSpec = {
    x: sceneX,
    w: sceneW,
    h: body - 20,
    times,
    elevation: 30,
    ...scene,
    axis: false,
    color: spec.color
  }
  const drawn = makeSnapshots3d({ id: `${id}-probe`, y: 0, ...sceneSpec }).extra.panels[0].height
  const block = drawn + 22 + (spec.timebar === false ? 0 : 30)
  const sceneY = y + Math.max(0, (body - block) / 2)
  // Why that height: the box arrows bind to is then the panels and their t labels, no more.
  fig.snapshots3d({ id: `${id}-scene`, y: sceneY, ...sceneSpec, h: drawn + 25 })
  fig.arrow({ id: `${id}-in`, from: `${id}-input`, to: `${id}-model` })
  fig.arrow({ id: `${id}-out`, from: `${id}-model`, to: `${id}-scene` })
  if (spec.timebar !== false) {
    fig.timebar({
      id: `${id}-time`,
      x: sceneX + sceneW / 2 - 60,
      y: sceneY + drawn + 28,
      w: 120,
      h: 6,
      labels: ['$t_0$', '$t_1$'],
      color: spec.color
    })
  }
  // Why one line for both: sub-captions of side-by-side parts read as a row.
  const captionY = y + h - 18
  fig.subcaption({
    id: `${id}-input-caption`,
    cx: x + volumeW / 2,
    y: captionY,
    label: '(a)',
    text: captions[0]
  })
  fig.subcaption({
    id: `${id}-scene-caption`,
    cx: sceneX + sceneW / 2,
    y: captionY,
    label: '(b)',
    text: captions[1]
  })
  return {
    ids: {
      input: `${id}-input`,
      model: `${id}-model`,
      scene: `${id}-scene`,
      ...(spec.timebar === false ? {} : { time: `${id}-time` })
    },
    in: [x, y + body / 2],
    out: [x + w, y + body / 2]
  }
}

export const DYNAMIC_TEMPLATES = {
  'dynamic-teaser': [
    dynamicTeaser,
    '4D reconstruction teaser: the input video as a space-time volume with tracks → the model → the scene at several times with a novel-view camera, a time colourbar',
    "{ id, x, y, w: 900, h: 214, frames: 5, times: [0, 0.5, 1], tracks: [{ from: [u, v], to, bend, color }], scene: { objects, cameras }, model: '\\\\mathcal{G}_\\\\theta(x, t)' | 'words', modelWidth: 84, captions: ['…', '…'], timebar: true, color }"
  ]
}
