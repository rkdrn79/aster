// Perspective scenes: the pinhole camera (vanishing points, parallel views), painter's order with
// plane tests and culling, photos on planes, fig.perspective (anchors, shared cameras, labels,
// repainting), the templates, and the lint for flat, tiny, mismatched and parallel-ray scenes.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { makeCamera } from './research-figures-perspective-camera.mjs'
import { perspectiveScene } from './research-figures-perspective-scene.mjs'
import { renderPerspective } from './research-figures-perspective-render.mjs'
import { affineFrom, photoSubdivision } from './research-figures-perspective-photo.mjs'
import { PERSPECTIVE_TEMPLATES } from './research-figures-perspective-templates.mjs'
import {
  illustrationPalette,
  paintIllustrationSvg
} from './research-figures-illustration-paint.mjs'
import { figureStyle } from './research-figures-style.mjs'
import { kitReferenceText } from './research-figures-kit-index.mjs'

const PHOTO = path.join(path.dirname(new URL(import.meta.url).pathname), 'vendor/photos/cat.jpg')

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2.5 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-persp-')))
  try {
    const folder = path.join(project, '.aster/figures')
    await mkdir(folder, { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const file = path.join(folder, 'fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene(size)))
    await run(file)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const found = (report, code) =>
  [...report.errors, ...report.warnings].filter((entry) => entry.code === code)

/** Where two 2D lines (each through two points) cross. */
function crossing([a, b], [c, d]) {
  const den = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0])
  const t = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / den
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
}

test('a pinhole camera makes parallel lines meet at their vanishing point; parallel views do not', () => {
  const sphere = { center: [0, 0, 0], radius: 2 }
  const cam = makeCamera({ azimuth: -60, elevation: 20, fov: 40 }, sphere)
  for (const direction of [
    [1, 0, 0],
    [0, 1, 0]
  ]) {
    const line = (offset) =>
      [0, 3].map((t) => cam.project(offset.map((value, axis) => value + direction[axis] * t)))
    const meet = crossing(line([0, 0, 0]), line([0, 0, 1]))
    const vanishing = cam.vanishing(direction)
    assert.ok(Math.hypot(meet[0] - vanishing[0], meet[1] - vanishing[1]) < 1e-6)
  }
  assert.equal(cam.vanishing([0, 0, 1]), null, 'an upright lens keeps verticals parallel')
  const tilted = makeCamera({ azimuth: -60, elevation: 20, fov: 40, upright: false }, sphere)
  assert.notEqual(tilted.vanishing([0, 0, 1]), null, 'a tilted lens makes verticals converge')
  const iso = makeCamera('iso', sphere)
  assert.equal(iso.vanishing([1, 0, 0]), null)
  const a = [iso.project([0, 0, 0]), iso.project([1, 0, 0])]
  const b = [iso.project([0, 0, 1]), iso.project([1, 0, 1])]
  const slope = ([p, q]) => (q[1] - p[1]) / (q[0] - p[0])
  assert.ok(Math.abs(slope(a) - slope(b)) < 1e-9, 'an iso view keeps parallels parallel')
  assert.equal(makeCamera({ kind: 'oblique' }, sphere).project([1, 0, 0])[1], -0, 'x stays level')
  assert.throws(() => makeCamera({ kind: 'fisheye' }, sphere), /not one of/)
  const eyed = makeCamera({ eye: [0, -5, 5], at: [0, 0, 0] }, sphere).record()
  assert.deepEqual([eyed.azimuth, eyed.elevation], [-90, 45], 'an eye records its orbit')
})

test('painter order: a ray piercing a plane goes behind it there; a box shows three faces', () => {
  const b = perspectiveScene()
  b.plane({ id: 'p', at: [0, 0, 0], axes: 'xz', size: [2, 2] })
  b.ray({ id: 'r', from: [0, -3, 0], through: [0, 0, 0], extend: 3, head: 'none' })
  const out = renderPerspective(b.units, {
    camera: { azimuth: -70, elevation: 15 },
    box: { w: 300 }
  })
  const paths = [...out.svg.matchAll(/<path d="[^"]*" ([^>]*)\/>/g)].map((match) => match[1])
  const plane = paths.findIndex((attrs) => attrs.includes('data-r="neutral"'))
  const rays = paths.map((attrs, index) => (attrs.includes('data-sr="accent"') ? index : -1))
  const [behind, front] = rays.filter((index) => index >= 0)
  assert.ok(behind < plane && front > plane, 'the far half before the plane, the near half after')
  const box = perspectiveScene()
  box.box({ id: 'b', at: [0, 0, 0], size: [1, 1, 1] })
  const solid = renderPerspective(box.units, {
    camera: { azimuth: -40, elevation: 25 },
    box: { w: 200 }
  })
  assert.equal((solid.svg.match(/data-r="neutral"/g) ?? []).length, 3)
  const tones = new Set(
    [...solid.svg.matchAll(/data-r="neutral" data-t="(\d+)"/g)].map((m) => m[1])
  )
  assert.ok(tones.size >= 2, 'faces turned from the light are darker in the same hue')
})

test('photos on planes: one affine map in a parallel view, triangles under strong perspective', () => {
  const map = affineFrom(
    [
      [0, 0],
      [1, 0],
      [0, 1]
    ],
    [
      [10, 20],
      [30, 20],
      [10, 60]
    ]
  )
  assert.deepEqual(map, [20, 0, 0, 40, 10, 20])
  assert.equal(
    photoSubdivision((s, t) => [s * 100 + t * 30, t * 80]),
    1
  )
  const steep = (s, t) => {
    const z = 1 + 3 * t
    return [(s * 200 - 100) / z, (t * 200) / z]
  }
  assert.ok(photoSubdivision(steep) > 1)
  const photos = {
    load: () => ({ key: 'k', href: 'data:image/png;base64,AA==', width: 40, height: 20 })
  }
  const b = perspectiveScene({ photos })
  b.plane({ id: 'img', at: [0, 0, 0], axes: 'xy', size: [2, 2], photo: 'any.png' })
  const out = renderPerspective(b.units, {
    camera: { azimuth: -90, elevation: 30, fov: 70 },
    box: { w: 300 }
  })
  assert.equal((out.svg.match(/<image /g) ?? []).length, 1, 'the picture is embedded once')
  assert.ok((out.svg.match(/<clipPath /g) ?? []).length > 2, 'cut into clipped triangles')
  assert.equal(out.photos[0].id, 'img')
})

test('fig.perspective: anchors in figure units, a shared camera and scale, native labels, repaint', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('vision')
    const a = fig.perspective({
      id: 'a',
      template: 'mip-cone',
      options: { mode: 'ray' },
      x: 20,
      y: 20,
      w: 200,
      h: 150,
      labels: [{ at: 'o', tex: '\\mathbf{o}', side: 'below' }]
    })
    assert.ok(a.anchors.x[0] > a.x && a.anchors.x[0] < a.right, 'anchors land inside the scene')
    assert.equal(a.labels.length, 1)
    assert.ok(fig.bounds(a.labels[0]).y >= a.anchors.o[1], 'the label sits below its anchor')
    const b = fig.perspective({
      id: 'b',
      template: 'mip-cone',
      options: { mode: 'cone' },
      like: 'a',
      x: 240,
      y: 20
    })
    assert.deepEqual(b.camera, a.camera)
    const record = fig.get('b').customData.asterPerspective
    assert.equal(record.scale, fig.get('a').customData.asterPerspective.scale)
    assert.equal(fig.get('b').customData.asterIllustration.projection, 'perspective')
    const svg = Buffer.from(
      fig.scene.files[fig.get('b').fileId].dataURL.split(',')[1],
      'base64'
    ).toString()
    assert.match(svg, /data-aster-illustration="1"/)
    const repainted = paintIllustrationSvg(svg, illustrationPalette(figureStyle('graphite')))
    assert.notEqual(repainted, svg, 'the scene repaints with another palette')
    assert.throws(
      () => fig.perspective({ id: 'c', camera: 'nope', draw: (s) => s.point({}) }),
      /no perspective scene "nope"/
    )
    const report = await fig.save()
    assert.equal(found(report, 'perspective-cameras').length, 0)
    assert.equal(found(report, 'perspective-flat').length, 0)
  })
})

test('every template draws and gives the anchors its labels need', () => {
  const photos = {
    load: () => ({ key: 'k', href: 'data:image/png;base64,AA==', width: 10, height: 10 })
  }
  const needs = {
    'nerf-rays': ['ray1.s1', 'ray2.end', 'view1'],
    'mip-cone': ['o', 't0', 't1', 'rdot'],
    triplane: ['xy', 'xz', 'yz'],
    'camera-rig': ['cam1', 'cam4'],
    swin: ['level1.right', 'level3.top'],
    'hash-grid': ['l0.v0', 'l1.v7', 'x'],
    'volume-boxes': ['box1', 'box3.bottom', 'sun', 'cam']
  }
  for (const [name, template] of Object.entries(PERSPECTIVE_TEMPLATES)) {
    const b = perspectiveScene({ photos })
    const made = template.draw(b, name === 'nerf-rays' ? { views: ['a.png', 'b.png'] } : {})
    const anchors = { ...b.anchors, ...made.anchors }
    for (const anchor of needs[name]) {
      assert.ok(anchors[anchor], `${name} gives ${anchor}`)
    }
    const camera = typeof template.camera === 'function' ? template.camera({}) : template.camera
    const out = renderPerspective(b.units, { camera, box: { w: 300 } })
    assert.ok(out.size.width > 0 && out.svg.includes('</svg>'), name)
  }
  assert.match(kitReferenceText('perspective'), /template: 'hash-grid'/)
})

test('lint: a flat perspective, a tiny photo plane, two cameras, parallel rays', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('vision')
    fig.perspective({
      id: 'flat',
      draw: (b) => b.point({ at: [0, 0, 0] }) && b.point({ at: [1, 2, 0] }),
      x: 20,
      y: 20,
      w: 120,
      h: 100
    })
    fig.perspective({
      id: 'tiny',
      draw: (b) => {
        b.plane({ id: 'pic', at: [0, 0, 0], axes: 'xz', size: [0.3, 0.3], photo: PHOTO })
        b.box({ at: [0, 1, 0], size: [3, 3, 3], wire: 'dotted' })
        b.ray({ id: 'r1', from: [-1, -4, 0], dir: [0, 1, 0], length: 6 })
        b.ray({ id: 'r2', from: [1, -4, 0], dir: [0, 1, 0], length: 6 })
      },
      camera: { azimuth: -20, elevation: 40 },
      x: 200,
      y: 20,
      w: 200,
      h: 160
    })
    const report = await fig.save()
    assert.equal(found(report, 'perspective-flat')[0]?.id, 'flat')
    assert.equal(found(report, 'perspective-small-photo')[0]?.id, 'tiny')
    assert.equal(found(report, 'perspective-cameras')[0]?.id, 'tiny')
    assert.match(found(report, 'perspective-parallel-rays')[0]?.message ?? '', /r1 and r2/)
  })
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.perspective({
      id: 's',
      template: 'triplane',
      camera: 'three-quarter',
      x: 20,
      y: 20,
      w: 220,
      h: 200
    })
    fig.polyline({
      id: 'l1',
      points: [
        [30, 80],
        [220, 60]
      ],
      fill: 'none'
    })
    fig.polyline({
      id: 'l2',
      points: [
        [30, 140],
        [220, 120]
      ],
      fill: 'none'
    })
    assert.equal(found(await fig.save(), 'perspective-parallel-rays')[0]?.id, 'l1')
  })
})
