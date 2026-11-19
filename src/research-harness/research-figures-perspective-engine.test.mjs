// The round-14 perspective engine: BSP depth order for crossing and see-through faces, splats
// inside a translucent cone, meshes (surfaces, tubes, lathes, ellipsoids, blobs), cel bands cut
// along the light, shadows and the sun glyph, outlines with hidden-line removal, photos on any
// face, tiled and washed photos, the hand-drawn line, and small SVG output.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import {
  illustrationPalette,
  paintIllustrationSvg
} from './research-figures-illustration-paint.mjs'
import { figureStyle } from './research-figures-style.mjs'
import { makeCamera } from './research-figures-perspective-camera.mjs'
import {
  buildBsp,
  backToFront,
  insertItem,
  pieceOf,
  splitPiece
} from './research-figures-perspective-bsp.mjs'
import { buildMesh, signedVolume } from './research-figures-perspective-meshcore.mjs'
import { metaballMesh } from './research-figures-perspective-blob.mjs'
import { perspectiveScene } from './research-figures-perspective-scene.mjs'
import { renderPerspective } from './research-figures-perspective-render.mjs'
import { bandPieces, SHADING_BANDS } from './research-figures-perspective-shade.mjs'
import { edgeVisibility } from './research-figures-perspective-hlr.mjs'
import { texturedFaceSvg, planarUvs } from './research-figures-perspective-photo.mjs'
import { roughD } from './research-figures-perspective-sketch.mjs'
import { mergePaths } from './research-figures-perspective-svg.mjs'
import { unionLoops } from './research-figures-perspective-faces.mjs'

async function withFigure(run) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-engine-')))
  try {
    await mkdir(path.join(project, '.aster/figures'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const file = path.join(project, '.aster/figures/fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene({ widthIn: 3.5, heightIn: 1.2 })))
    await run(file)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const PHOTO = { key: 'k', href: 'data:image/png;base64,AA==', width: 40, height: 20 }
const photos = { load: () => PHOTO }
const quad = (z, size = 1) => ({
  pts: [
    [-size, -size, z],
    [size, -size, z],
    [size, size, z],
    [-size, size, z]
  ],
  normal: [0, 0, 1]
})

/** The order (indices in the SVG) of the first path painted with each data-r role. */
const firstIndex = (svg, needle) => svg.indexOf(needle)

test('BSP: a face cut by a plane keeps its outline edges and shares the cut vertex names', () => {
  const piece = pieceOf(quad(0), 0)
  const cut = splitPiece(piece, { n: [1, 0, 0], d: 0 }, 1e-9, 'k1', (name) => name)
  assert.equal(cut.front.verts.length, 4)
  assert.equal(cut.back.verts.length, 4)
  const shared = cut.front.verts.filter((v) => cut.back.verts.some((w) => w.id === v.id))
  assert.equal(shared.length, 2, 'the two pieces meet at the two cut vertices')
  // Crossing faces sort with no cycle: each half of a vertical plane on its side of a floor.
  const floor = { ...quad(0, 2), owner: 'floor' }
  const wall = {
    owner: 'wall',
    pts: [
      [-1, 0, -1],
      [1, 0, -1],
      [1, 0, 1],
      [-1, 0, 1]
    ],
    normal: [0, -1, 0]
  }
  const tree = buildBsp([pieceOf(floor, 0), pieceOf(wall, 1)], 1e-9)
  const cam = makeCamera({ azimuth: -60, elevation: 30 }, { center: [0, 0, 0], radius: 2 })
  const eyeSide = (n, p) => cam.eyeSide(n, p)
  const order = backToFront(tree, eyeSide)
  assert.equal(order.length, 3, 'the wall is cut into two by the floor')
  const owners = order.map((piece) => piece.face.owner)
  assert.deepEqual(owners, ['wall', 'floor', 'wall'], 'lower wall, floor, upper wall')
  const loose = insertItem(null, { at: [0, 0, 0], depth: 1, serial: 0 }, 1e-9, eyeSide, null)
  assert.ok(loose, 'with no faces an item stays loose')
})

test('a Gaussian inside a translucent cone paints between its far and near walls', () => {
  const b = perspectiveScene()
  b.cone({
    id: 'c',
    apex: [0, -3, 0],
    dir: [0, 1, 0],
    start: 1,
    length: 5,
    angle: 14,
    opacity: 0.5,
    role: 'accent'
  })
  b.gaussian({ id: 'g', at: [0, 0, 0], r: 0.2, role: 'second', levels: 1 })
  const out = renderPerspective(b.units, {
    camera: { azimuth: -30, elevation: 20 },
    box: { w: 300 }
  })
  const svg = out.svg
  const splat = firstIndex(svg, 'data-r="second"')
  const walls = [...svg.matchAll(/data-r="accent"/g)].map((match) => match.index)
  assert.ok(
    walls.some((at) => at < splat),
    'some of the cone is painted before the splat'
  )
  assert.ok(
    walls.some((at) => at > splat),
    'and some after it: its near wall tints it'
  )
})

test('meshes: closed outward solids from surfaces, tubes, lathes, ellipsoids and blobs', () => {
  const b = perspectiveScene()
  const ball = b.ellipsoid({ id: 'e', at: [0, 0, 0], r: 1 })
  assert.ok(ball.closed && ball.faces > 100)
  const tube = b.tube({
    id: 't',
    points: [
      [0, 0, 0],
      [1, 0, 1],
      [2, 1, 1]
    ],
    r: 0.2
  })
  assert.ok(tube.closed, 'a capped tube is closed')
  const vase = b.lathe({
    id: 'v',
    profile: [
      [0, 0],
      [0.4, 0],
      [0.3, 1],
      [0, 1]
    ]
  })
  assert.ok(vase.closed)
  const land = b.surface({ id: 's', x: [-1, 1], y: [-1, 1], n: 8, z: (x, y) => x * y })
  assert.equal(land.closed, false, 'a height field is an open sheet')
  assert.throws(() => b.surface({ id: 'bad' }), /surface needs/)
  const blob = metaballMesh(
    [
      { at: [0, 0, 0], r: 0.5 },
      { at: [0.6, 0, 0], r: 0.4 }
    ],
    { n: 14 }
  )
  const mesh = buildMesh(blob.verts, blob.faces)
  assert.ok(mesh.closed, 'the metaball surface is closed')
  assert.ok(signedVolume(blob.verts, blob.faces) > 0, 'its faces turn outward')
  const tris = b.mesh({
    id: 'm',
    triangles: [
      [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0]
      ],
      [
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0]
      ]
    ]
  })
  assert.equal(tris.verts.length, 4, 'triangles weld at shared corners')
})

test('cel bands follow the light: a face whose light crosses a level is cut along it', () => {
  const verts = [
    { p: [0, 0, 0], id: 'a' },
    { p: [1, 0, 0], id: 'b' },
    { p: [0, 1, 0], id: 'c' }
  ]
  const pieces = bandPieces(verts, [0.1, 0.9, 0.1], SHADING_BANDS.cel)
  assert.equal(pieces.length, 2)
  assert.deepEqual(pieces.map((piece) => piece.band).toSorted(), [0, 1])
  const cutIds = pieces
    .flatMap((piece) => piece.verts.map((v) => v.id))
    .filter((id) => id.includes('@'))
  assert.ok(
    cutIds.includes('a|b@0.42'),
    'a cut on an edge is named by the edge, so neighbours join'
  )
  const b = perspectiveScene()
  b.ellipsoid({ id: 'e', at: [0, 0, 0], r: 1, shading: 'cel' })
  const out = renderPerspective(b.units, {
    camera: { azimuth: -50, elevation: 20 },
    box: { w: 200 }
  })
  const tones = new Set([...out.svg.matchAll(/data-r="neutral" data-t="(\d+)"/g)].map((m) => m[1]))
  assert.equal(tones.size, 2, 'a cel-shaded ball prints two tones')
  assert.ok((out.svg.match(/data-r="neutral"/g) ?? []).length <= 4, 'each band is one merged path')
})

test('shadows: a sun casts one union shadow on the floor, contact shadows, a sun glyph', () => {
  const b = perspectiveScene()
  b.floor({ size: [6, 6] })
  b.light({ at: [-2, -2, 4], dir: [-0.5, -0.4, 0.8] })
  b.box({ id: 'a', at: [-1, 0, 0.5], size: [1, 1, 1] })
  b.box({ id: 'b', at: [-0.4, 0.3, 0.5], size: [1, 1, 1] })
  b.ellipsoid({ id: 'ball', at: [1.2, 0, 0.5], r: 0.5 })
  const out = renderPerspective(b.units, {
    camera: { azimuth: -60, elevation: 25 },
    box: { w: 300 }
  })
  const shadows = [...out.svg.matchAll(/data-k="shadow"[^>]*fill-opacity="([\d.]+)"/g)]
  assert.ok(shadows.length >= 4, 'a cast shadow and contact steps')
  assert.ok(out.svg.includes('<circle'), 'the sun glyph is drawn')
  const castShadow = shadows.filter((match) => Number(match[1]) > 0.12)
  assert.equal(castShadow.length, 1, 'every caster in one path, so overlaps do not darken')
  const loops = unionLoops([
    {
      ids: ['a', 'b', 'c', 'd'],
      pts: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1]
      ]
    },
    {
      ids: ['b', 'e', 'f', 'c'],
      pts: [
        [1, 0],
        [2, 0],
        [2, 1],
        [1, 1]
      ]
    }
  ])
  assert.equal(loops.length, 1)
  assert.equal(loops[0].length, 6, 'the shared edge is dissolved')
  const dark = perspectiveScene()
  dark.floor({ size: [4, 4] })
  dark.light({ dir: [0, 0, 1], shadows: false })
  dark.box({ at: [0, 0, 0.5], size: [1, 1, 1] })
  const none = renderPerspective(dark.units, { camera: {}, box: { w: 200 } })
  assert.ok(!none.svg.includes('data-k="shadow"'), 'shadows: false casts none')
})

test('outlines: silhouettes solid, hidden parts dashed or gone, wireframes cut by solids', () => {
  const at = (p) => p[0] > 0.5
  const parts = edgeVisibility([0, 0, 0], [1, 0, 0], at, 4)
  assert.equal(parts.length, 2)
  assert.ok(Math.abs(parts[0].to - 0.5) < 0.02, 'the change point is found by bisection')
  const b = perspectiveScene()
  b.ellipsoid({
    id: 'globe',
    at: [0, 0, 0],
    r: 1,
    rings: 8,
    segments: 12,
    fill: false,
    wire: { hidden: 'dash' },
    role: 'accent'
  })
  const out = renderPerspective(b.units, {
    camera: { azimuth: -40, elevation: 20 },
    box: { w: 300 }
  })
  assert.ok(/data-sr="accent"[^>]*stroke-dasharray/.test(out.svg), 'the far side is dashed')
  assert.ok(
    /data-sr="accent"(?:(?!stroke-dasharray)[^>])*\/>/.test(out.svg),
    'the near side is solid'
  )
  const solid = perspectiveScene()
  solid.ellipsoid({ id: 'ball', at: [0, 0, 0], r: 1, role: 'second', outline: { pt: 0.9 } })
  const ink = renderPerspective(solid.units, { camera: {}, box: { w: 200 } })
  assert.ok(/data-sr="second"/.test(ink.svg), 'a filled mesh draws its silhouette')
  assert.ok(!/stroke-dasharray/.test(ink.svg), 'and no hidden lines by default')
})

test('photos on any face, tiled and washed photos, and the image embedded once', () => {
  const uvs = planarUvs(
    quad(0).pts.map((p) => [p[0], 0, p[1]]),
    [0, -1, 0]
  )
  assert.deepEqual(uvs[0], [0, 1], 'planar shares: right and down across the face')
  const ids = (() => {
    let n = 0
    return (kind) => `${kind}${(n += 1)}`
  })()
  const images = new Map()
  const drawn = texturedFaceSvg(
    { ...PHOTO, crop: [0, 0, 40, 20] },
    [
      [0, 0, 0],
      [1, 0, 0],
      [0, 0, 1]
    ],
    [
      [0, 0],
      [1, 0],
      [0, 1]
    ],
    ([x, , z]) => [x * 100, 100 - z * 100],
    { ids, images }
  )
  assert.equal(drawn.pieces, 1, 'an affine view needs one piece')
  const b = perspectiveScene({ photos })
  b.box({ id: 'cube', at: [0, 0, 0], size: [1, 1, 1], photos: { front: 'a.png', top: 'a.png' } })
  b.plane({
    id: 'tiles',
    at: [0, 2, 0],
    axes: 'xz',
    size: [2, 1],
    photo: { src: 'a.png', repeat: [3, 2], wash: 0.4 }
  })
  const out = renderPerspective(b.units, {
    camera: { azimuth: -60, elevation: 25 },
    box: { w: 300 }
  })
  assert.equal((out.svg.match(/<image /g) ?? []).length, 1, 'one image for every use')
  assert.ok((out.svg.match(/<use /g) ?? []).length >= 2 + 6, 'two box faces and six tiles')
  assert.ok(/data-r="white"[^>]*fill-opacity="0.4"/.test(out.svg), 'the wash lies over the photo')
})

test('hand-drawn lines are seeded, and paths of one paint merge', () => {
  const pts = [
    [0, 0],
    [40, 0],
    [40, 30]
  ]
  assert.equal(roughD(pts, { seed: 4 }, 1), roughD(pts, { seed: 4 }, 1), 'same seed, same wobble')
  assert.notEqual(roughD(pts, { seed: 4 }, 1), roughD(pts, { seed: 5 }, 1))
  assert.equal((roughD(pts, true).match(/M/g) ?? []).length, 2, 'two strokes per line')
  const a = '<path d="M0 0L1 1" fill="none" data-sr="x"/>'
  const b = '<path d="M5 5L6 6" fill="none" data-sr="x"/>'
  assert.equal(mergePaths([a, b]), '<path d="M0 0L1 1M5 5L6 6" fill="none" data-sr="x"/>')
  const see = (d) => `<path d="${d}" data-r="a" fill-opacity="0.5"/>`
  assert.equal(
    (mergePaths([see('M0 0L9 9'), see('M1 1L8 8')]).match(/<path/g) ?? []).length,
    2,
    'overlapping see-through parts stay apart'
  )
})

test('a large organic scene renders quickly and stays small', () => {
  const b = perspectiveScene()
  b.floor({ size: [5, 4] })
  b.look({ shading: 'cel' })
  b.blob({
    id: 'cell',
    n: 22,
    balls: [
      { at: [0, 0, 0.8], r: 0.6 },
      { at: [0.5, 0.2, 0.7], r: 0.5 }
    ]
  })
  b.tube({
    id: 'arm',
    points: [
      [1, -1, 0.2],
      [1.5, 0, 0.8],
      [2, 1, 0.4]
    ],
    r: 0.12
  })
  const started = performance.now()
  const out = renderPerspective(b.units, {
    camera: { azimuth: -50, elevation: 25 },
    box: { w: 400 }
  })
  assert.ok(performance.now() - started < 4000, 'well under a few seconds')
  assert.ok(out.svg.length < 220_000, `small: ${out.svg.length} bytes`)
})

test('a #hex colour paints like a role, and fig.perspectives shares one camera and scale', async () => {
  const b = perspectiveScene()
  b.point({ id: 's', at: [0, 0, 0], role: '#7B3FA0', r: 3 })
  b.box({ id: 'c', at: [1, 0, 0], size: [1, 1, 1], role: '#2a9d8f' })
  const out = renderPerspective(b.units, { camera: {}, box: { w: 200 } })
  assert.match(out.svg, /data-r="#7b3fa0"/)
  const painted = paintIllustrationSvg(out.svg, illustrationPalette(figureStyle('vision')))
  assert.ok(!/fill="#000000"/.test(painted), 'every #hex role is painted from its own ramp')
  assert.throws(() => b.point({ at: [0, 0, 0], role: 'purple' }), /or a #hex colour/)
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('vision')
    const made = fig.perspectives({
      camera: { azimuth: -47, elevation: 13, fov: 34 },
      scenes: ['ray', 'cone', 'gaussians'].map((mode, index) => ({
        id: mode,
        template: 'mip-cone',
        options: { mode },
        x: 10 + index * 160,
        y: 10,
        w: 150,
        h: 140
      }))
    })
    assert.equal(made.scenes.length, 3)
    const records = made.scenes.map((scene) => fig.get(scene.id).customData.asterPerspective)
    assert.ok(
      records.every((record) => record.scale === records[0].scale),
      'one scale'
    )
    assert.deepEqual(made.scenes[2].camera, made.scenes[0].camera, 'one camera')
    for (const [index, scene] of made.scenes.entries()) {
      assert.ok(scene.width <= 150.5 && scene.height <= 140.5, 'each fits its box')
      const middle = scene.x + scene.width / 2
      assert.ok(Math.abs(middle - (10 + index * 160 + 75)) < 0.6, 'centred in its box')
    }
    assert.equal(records[1].like, 'ray')
    const report = await fig.save()
    assert.equal(
      [...report.errors, ...report.warnings].filter((entry) => entry.code === 'perspective-cameras')
        .length,
      0
    )
  })
})
