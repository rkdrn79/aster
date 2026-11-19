// Round 14 perspective templates: defaults that print well with only the photos given (NeRF's
// image planes 0.6 in or more, two rays at different angles, samples over the scene photo), the
// knobs agents asked for (hex sample colours, combined Mip-NeRF modes on one volume, the 2D hash
// grid's point and vertex numbers, Swin's patch options and anchors, tri-plane labels, camera
// label spots) and a photo path error that names the project folder.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { FIGURE_UNITS_PER_INCH, newFigureScene } from './research-figures-model.mjs'
import { cross, length, sub, unit } from './research-figures-perspective-camera.mjs'
import { perspectiveScene } from './research-figures-perspective-scene.mjs'
import {
  illustrationPalette,
  paintIllustrationSvg
} from './research-figures-illustration-paint.mjs'
import { figureStyle } from './research-figures-style.mjs'
import { renderPerspective } from './research-figures-perspective-render.mjs'
import { PERSPECTIVE_TEMPLATES } from './research-figures-perspective-templates.mjs'
import { MIN_PHOTO_IN } from './research-figures-lint-perspective.mjs'

const PHOTOS = {
  load: () => ({ key: 'k', href: 'data:image/png;base64,AA==', width: 40, height: 20 })
}

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2.2 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r14p-')))
  try {
    const folder = path.join(project, '.aster/figures')
    await mkdir(folder, { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const file = path.join(folder, 'fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene(size)))
    await run(file, project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

/** Draws a template into a bare scene and renders it: the scene, its anchors and the output. */
function drawTemplate(name, options = {}, box = { w: 300 }) {
  const b = perspectiveScene({ photos: PHOTOS })
  const template = PERSPECTIVE_TEMPLATES[name]
  const made = template.draw(b, options) ?? {}
  const camera = typeof template.camera === 'function' ? template.camera(options) : template.camera
  const out = renderPerspective(b.units, { camera, box })
  return { b, made, out, anchors: { ...b.anchors, ...made.anchors } }
}

const bird = (crop) => ({ kind: 'bird', crop })

test('nerf-rays: photo planes print 0.6 in or more in a 216-unit panel, with samples over the scene', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('vision')
    fig.perspective({
      id: 'a',
      template: 'nerf-rays',
      x: 16,
      y: 16,
      w: 216,
      h: 200,
      options: { scene: bird(), views: [bird([0, 0, 0.5, 1]), bird([0.2, 0, 0.7, 1])] }
    })
    const record = fig.get('a').customData.asterPerspective
    const views = record.photos.filter((photo) => photo.id.startsWith('view'))
    assert.equal(views.length, 2)
    for (const view of views) {
      const side = Math.max(view.width, view.height) / FIGURE_UNITS_PER_INCH
      assert.ok(side >= MIN_PHOTO_IN, `${view.id} prints ${side.toFixed(2)} in`)
    }
    const report = await fig.save()
    const codes = [...report.errors, ...report.warnings].map((entry) => entry.code)
    assert.ok(!codes.includes('perspective-small-photo'), codes.join(', '))
    assert.ok(!codes.includes('perspective-parallel-rays'), codes.join(', '))
  })
  const { b } = drawTemplate('nerf-rays', { scene: 'x.png' })
  const scene = b.units.find((unit) => unit.owner === 'scene')
  assert.equal(scene.layer, -1, 'the faded scene photo is painted under the rays and samples')
  const off = drawTemplate('nerf-rays', { scene: 'x.png', samplesInFront: false })
  assert.equal(off.b.units.find((unit) => unit.owner === 'scene').layer, 0)
})

test('nerf-rays: the default rays go through different pixels and cross the box at clear angles', () => {
  const { b, anchors } = drawTemplate('nerf-rays')
  const [one, two] = b.records.rays
  const angle =
    (Math.asin(Math.min(1, length(cross(one.direction, two.direction)))) * 180) / Math.PI
  assert.ok(angle > 40, `the rays meet at ${angle.toFixed(0)}°`)
  // Not both through the centre pixel: each ray misses the scene centre by a visible amount.
  for (const ray of [one, two]) {
    const toCenter = sub([0, 0, 0.55], ray.origin)
    const miss = length(cross(toCenter, unit(ray.direction)))
    assert.ok(miss > 0.12, `${ray.id} passes ${miss.toFixed(2)} from the centre`)
  }
  for (const name of [
    'ray1.s1',
    'ray1.s7',
    'ray2.end',
    'view1.tl',
    'view2.pixel',
    'cam1',
    'box.top'
  ]) {
    assert.ok(anchors[name], `anchor ${name}`)
  }
  // A pose given with only an azimuth keeps its default pixel.
  const posed = drawTemplate('nerf-rays', { poses: [{ azimuth: -150 }, { azimuth: -40 }] })
  const [p1, p2] = posed.b.records.rays
  assert.ok(length(cross(p1.direction, p2.direction)) > 0.5)
})

test('nerf-rays: sample colours take #hex, painted on a ramp of their own hue', () => {
  const { out } = drawTemplate('nerf-rays', {
    sampleColors: [[null, null, '#a8532c', '#f08a33'], []],
    sampleRoles: [[], [null, 'accent']]
  })
  // Why a ramp: the engine keeps the hex as the role and shades it like any role.
  assert.match(out.svg, /data-r="#a8532c"/)
  assert.match(out.svg, /data-r="#f08a33"/)
  const painted = paintIllustrationSvg(out.svg, illustrationPalette(figureStyle('vision'), {}), {
    look: 'flat'
  })
  // The sample's fill is a shade of its own hue, never the placeholder black.
  const sample = /<[^>]*data-r="#a8532c"[^>]*fill="(#[0-9a-f]{6})"/i.exec(painted)
  assert.ok(sample && sample[1] !== '#000000', 'painted in its hue')
})

test('mip-cone: every mode fills one volume, so like panels match; cone and Gaussians combine', () => {
  const sizes = ['ray', 'cone', 'gaussians', ['cone', 'gaussians']].map((mode) => {
    const { out } = drawTemplate('mip-cone', { mode }, { w: 220, h: 200 })
    return [Math.round(out.size.width), Math.round(out.size.height), out.scale]
  })
  // Why near, not equal: each mode keeps its own margin for what it draws (an arrowhead, dots),
  // so the fitted scale moves a little; panels that must match share it (like, perspectives).
  for (const size of sizes.slice(1)) {
    assert.ok(
      Math.abs(size[2] / sizes[0][2] - 1) < 0.08,
      `${size.join(', ')} near ${sizes[0].join(', ')}`
    )
  }
  const both = drawTemplate('mip-cone', { mode: ['cone', 'gaussians'] })
  assert.ok(both.anchors.g2 && !both.anchors.g1, 'one Gaussian, on the highlighted frustum')
  assert.ok(both.anchors.t0 && both.anchors.t1 && both.anchors.top)
  const all = drawTemplate('mip-cone', { mode: 'cone', gaussians: 'all' })
  assert.ok(all.anchors.g1 && all.anchors.g3)
  const ray = drawTemplate('mip-cone', { mode: 'ray', sampleSize: 4 })
  assert.ok(ray.anchors.x && ray.anchors.x1 && ray.anchors.o)
  const hero = ray.b.units.find((unit) => unit.owner === 'x')
  assert.ok(hero.r > 4)
  assert.ok(!Object.keys(ray.anchors).some((name) => name.includes('bound')), 'bounds stay hidden')
})

test('hash-grid: a 2D point [x, y], distinct anchor names, vertex numbers as native labels', async () => {
  const flat = drawTemplate('hash-grid', { dims: 2, point: [0.62, 0.38] })
  for (const name of ['l0.v0', 'l0.v3', 'l1.v3', 'x', 'domain.left', 'domain.right']) {
    assert.ok(flat.anchors[name], name)
  }
  assert.ok(flat.anchors['l1.gu1'], 'lattice lines have their own names')
  // The ring anchors are corner points of the enclosing cell, not lattice-line midpoints.
  const ring = flat.b.units.find((unit) => unit.owner === 'l0.v1')
  assert.equal(ring.type, 'dot')
  assert.equal(PERSPECTIVE_TEMPLATES['hash-grid'].camera({ dims: 2 }), 'front')
  assert.throws(() => drawTemplate('hash-grid', { dims: 2, point: [0.5] }), /\[x, y\] shares/)
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('vision')
    const grid = fig.perspective({
      id: 'g',
      template: 'hash-grid',
      x: 16,
      y: 16,
      w: 220,
      h: 200,
      options: {
        dims: 2,
        numbers: [
          [0, 1, 2, 3],
          [4, 5, 6, 7]
        ]
      }
    })
    assert.equal(grid.labels.length, 8)
    assert.equal(fig.get('g').customData.asterPerspective.camera.kind, 'front')
    const texts = grid.labels.map((id) => fig.get(id)?.text).filter(Boolean)
    assert.deepEqual(texts.toSorted(), ['0', '1', '2', '3', '4', '5', '6', '7'])
  })
})

test('swin: the template has the same anchors as a custom b.patchGrid, and patch options', () => {
  const swin = drawTemplate('swin', { patchRole: 'neutral', patchPt: 0.7 })
  const custom = perspectiveScene({ photos: PHOTOS })
  custom.patchGrid({ id: 'level1', at: [0, 0, 0], size: 2, patches: 16, windows: 4, gap: 0.09 })
  for (const name of ['level1.right', 'level1.left', 'level1.top', 'level1.bottom', 'level1.tl']) {
    assert.ok(swin.anchors[name], `template ${name}`)
    assert.deepEqual(custom.anchors[name], swin.anchors[name], name)
  }
  assert.ok(swin.anchors['level3.top'] && swin.anchors.top)
  const lines = swin.b.units.flatMap((unit) => unit.decals ?? [])
  assert.ok(
    lines.some((line) => line.role === 'neutral' && line.pt === 0.7),
    'patch options reach the lines'
  )
})

test('triplane: named planes, no query point, and the feet anchors to start arrows from', async () => {
  const bare = drawTemplate('triplane', { point: false })
  assert.ok(!bare.b.units.some((unit) => String(unit.owner).includes('proj-')), 'no projections')
  for (const name of ['xy', 'xz', 'yz', 'xy.label', 'yz.label']) {
    assert.ok(bare.anchors[name], name)
  }
  const pointed = drawTemplate('triplane')
  assert.ok(pointed.anchors.point)
  assert.notDeepEqual(
    pointed.anchors.xy,
    pointed.anchors['xy.label'],
    'xy is the foot of the point'
  )
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('vision')
    const tri = fig.perspective({
      id: 't',
      template: 'triplane',
      x: 16,
      y: 16,
      w: 200,
      h: 190,
      options: { labels: { xy: 'F_{xy}', xz: 'F_{xz}', yz: 'F_{yz}' } }
    })
    assert.equal(tri.labels.length, 3)
    for (const id of tri.labels) {
      const box = fig.bounds(id)
      assert.ok(box.width > 10 && box.height > 8, `${id} is placed`)
      assert.ok(box.x >= 0 && box.y >= 0, `${id} stays on the page`)
    }
  })
})

test('camera-rig: the object keeps its photo aspect; label spots sit past each camera body', () => {
  const rig = drawTemplate('camera-rig', { object: 'wide.png' })
  const object = rig.b.units.find((unit) => unit.owner === 'object')
  const [a, b, , d] = object.pts
  assert.ok(length(sub(b, a)) > length(sub(d, a)), 'a landscape photo makes a landscape plane')
  assert.ok(rig.anchors['cam1.label'] && rig.anchors['cam4.label'])
})

test('a photo path that is not in the project says it is relative to the project folder', async () => {
  await withFigure(async (file, project) => {
    const fig = await openFigure(file)
    assert.throws(
      () =>
        fig.perspective({
          id: 'p',
          template: 'nerf-rays',
          x: 0,
          y: 0,
          w: 200,
          options: { scene: '../../data/scene.png' }
        }),
      (error) =>
        error.message.includes('relative to the project folder') && error.message.includes(project)
    )
  })
})
