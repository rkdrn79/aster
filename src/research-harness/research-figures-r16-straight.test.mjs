// Round 16 straight 3D: the pinhole is upright by default (two-point perspective: world verticals
// print as exact screen verticals), named views and tidy free angles, planes that face a point
// stand upright, every template draws straight at its defaults, panels through one camera share
// one baseline, invisible bounds leave no margin, and the lint flags tilted verticals, leaning
// planes, panels seen differently and scenes that fill too little of their box.
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
import { PERSPECTIVE_TEMPLATES } from './research-figures-perspective-templates.mjs'
import { tidyCamera, verticalTilt, VIEW_PRESETS } from './research-figures-perspective-views.mjs'

const PHOTOS = {
  load: () => ({ key: 'k', href: 'data:image/png;base64,AA==', width: 40, height: 30 })
}

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2.2 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r16s-')))
  try {
    await mkdir(path.join(project, '.aster/figures'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const file = path.join(project, '.aster/figures/fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene(size)))
    await run(await openFigure(file))
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const found = (report, code) =>
  [...report.errors, ...report.warnings].filter((entry) => entry.code === code)

/** The screen angle (degrees) off the vertical of the world segment a → b. */
function screenTilt(cam, a, b) {
  const [pa, pb] = [cam.project(a), cam.project(b)]
  return (Math.atan2(Math.abs(pb[0] - pa[0]), Math.abs(pb[1] - pa[1])) * 180) / Math.PI
}

test('the pinhole is upright by default: world verticals print vertical anywhere in the view', () => {
  const sphere = { center: [0, 0, 0], radius: 2 }
  const cam = makeCamera({ azimuth: -55, elevation: 25, fov: 40 }, sphere)
  for (const at of [
    [-2, -1, -1],
    [2, 2, -1],
    [1.5, -1.5, 0]
  ]) {
    assert.ok(screenTilt(cam, at, [at[0], at[1], at[2] + 2]) < 1e-6, `vertical at ${at.join(', ')}`)
  }
  assert.equal(cam.record().upright, true)
  // The look-at point stays in the middle of the image (the lens is shifted, not tilted).
  const middle = cam.project(cam.settings.at)
  assert.ok(Math.hypot(middle[0], middle[1]) < 1e-9)
  const tilted = makeCamera({ azimuth: -55, elevation: 25, fov: 40, upright: false }, sphere)
  assert.ok(screenTilt(tilted, [2, 2, -1], [2, 2, 1]) > 2, 'upright: false leans them')
  assert.equal(tilted.record().upright, false)
})

test('named views and tidy angles: presets, 5° steps, a clamped elevation, no roll', () => {
  assert.deepEqual(Object.keys(VIEW_PRESETS), ['three-quarter', 'side', 'front', 'top-oblique'])
  assert.equal(tidyCamera('side').camera.azimuth, VIEW_PRESETS.side.camera.azimuth)
  assert.equal(tidyCamera('top-oblique').camera.kind, 'oblique')
  const free = tidyCamera({ azimuth: -63, elevation: 22 })
  assert.deepEqual([free.camera.azimuth, free.camera.elevation, free.notes.length], [-65, 20, 0])
  const steep = tidyCamera({ azimuth: -40, elevation: 62 })
  assert.equal(steep.camera.elevation, 40)
  assert.match(steep.notes[0], /elevation 62° is steep; used 40°/)
  const under = tidyCamera({ elevation: -15 })
  assert.equal(under.camera.elevation, 0)
  assert.match(under.notes[0], /look up from below/)
  const rolled = tidyCamera({ azimuth: -60, elevation: 20, up: [0.3, 0, 1] })
  assert.equal(rolled.camera.up, undefined)
  assert.match(rolled.notes[0], /does not roll/)
  const eyed = tidyCamera({ eye: [3, -4, 2.2], at: [0, 0, 0] })
  assert.equal(eyed.camera.eye, undefined)
  assert.equal(Math.abs(eyed.camera.azimuth) % 5, 0)
  assert.ok(Math.abs(eyed.camera.distance - Math.hypot(3, 4, 2.2)) < 1e-9)
  assert.equal(tidyCamera({ azimuth: -63, free: true }).camera.azimuth, -63, 'free keeps it')
  const overridden = tidyCamera({ view: 'front', fov: 28 }).camera
  assert.deepEqual([overridden.azimuth, overridden.elevation, overridden.fov], [-90, 12, 28])
  assert.throws(() => tidyCamera({ view: 'bird' }), /view "bird" is not one of/)
})

test('planes that face a point stand upright; camera image planes too; upright: false tilts', () => {
  const b = perspectiveScene()
  const level = b.plane({ id: 'level', at: [0, 0, 0], facing: [0, -4, 2.5], size: [1, 1] })
  assert.equal(level.v[2], -1, 'its sides run straight down')
  const tipped = b.plane({ id: 'tipped', at: [0, 0, 0], facing: [0, -4, 2.5], upright: false })
  assert.ok(tipped.v[2] > -0.99, 'upright: false tips it back toward the point')
  const flat = b.plane({ id: 'flat', at: [0, 0, 0], facing: [0, -0.5, 4] })
  assert.ok(Math.abs(flat.v[2]) < 0.7, 'a plane facing almost straight up stays as asked')
  const cam = b.camera({
    id: 'cam',
    at: [0, -4, 1.6],
    lookAt: [0, 0, 0],
    imagePlane: { id: 'view', distance: 1, size: [0.8, 0.6] }
  })
  assert.deepEqual(cam.up, [0, 0, 1])
  const tl = b.anchors['view.tl']
  const bl = b.anchors['view.bl']
  assert.ok(Math.abs(tl[0] - bl[0]) < 1e-9 && Math.abs(tl[1] - bl[1]) < 1e-9, 'plane upright')
})

test('every template draws straight at its defaults (no tilted or leaning verticals)', () => {
  for (const [name, template] of Object.entries(PERSPECTIVE_TEMPLATES)) {
    const options = name === 'camera-rig' ? {} : name === 'hash-grid' ? { numbers: true } : {}
    const b = perspectiveScene({ photos: PHOTOS })
    template.draw(b, options)
    const camera =
      typeof template.camera === 'function' ? template.camera(options) : template.camera
    const out = renderPerspective(b.units, { camera, box: { w: 220, h: 160 } })
    const { camera: lens, plane } = out.verticals
    assert.ok(!lens || lens.degrees <= 0.5, `${name}: ${JSON.stringify(lens)}`)
    assert.ok(!plane || plane.degrees <= 0.5, `${name}: ${JSON.stringify(plane)}`)
  }
  // The measure itself: a plane tipped back reads as a leaning plane, a tilted lens as tilted.
  const b = perspectiveScene()
  b.plane({ id: 'tip', at: [0, 0, 0], u: [1, 0, 0], v: [0, 0.34, -0.94], size: [1, 1] })
  b.box({ id: 'box', at: [0, 2, 0], size: [1, 1, 1], wire: 'dotted' })
  const sphere = { center: [0, 1, 0], radius: 2 }
  const leaning = verticalTilt(b.units, makeCamera({ azimuth: -60, elevation: 20 }, sphere))
  assert.equal(leaning.plane.owner, 'tip')
  assert.equal(leaning.camera, null)
  const lens = { azimuth: -60, elevation: 30, upright: false }
  assert.ok(verticalTilt(b.units, makeCamera(lens, sphere)).camera.degrees > 2)
})

test('scenes through one camera in one row share a baseline; invisible bounds add no margin', async () => {
  await withFigure(
    (fig) => {
      fig.style('paper')
      const made = fig.perspectives({
        x: 12,
        y: 20,
        w: 940,
        h: 260,
        scenes: [
          { id: 'ray', template: 'mip-cone', options: { mode: 'ray' } },
          { id: 'cone', template: 'mip-cone', options: { mode: 'cone' } },
          { id: 'gauss', template: 'mip-cone', options: { mode: 'gaussians' } }
        ]
      })
      const heights = made.scenes.map((scene) => scene.anchors.o[1])
      assert.ok(Math.max(...heights) - Math.min(...heights) < 0.5, `o at ${heights.join(', ')}`)
      const planes = made.scenes.map((scene) => scene.anchors.pixel[1])
      assert.ok(Math.max(...planes) - Math.min(...planes) < 0.5, `planes at ${planes.join(', ')}`)
      // A scene like another in the same row lines up with it too.
      const first = fig.perspective({
        id: 'a',
        template: 'mip-cone',
        x: 12,
        y: 300,
        w: 300,
        h: 160
      })
      const ray = fig.perspective({
        id: 'b',
        template: 'mip-cone',
        like: 'a',
        x: 340,
        y: 300,
        w: 300,
        options: { mode: 'ray' }
      })
      assert.ok(Math.abs(first.anchors.o[1] - ray.anchors.o[1]) < 0.5, 'like lines up')
    },
    { widthIn: 6.75, heightIn: 3.4 }
  )
  // The mip-cone volume is held by invisible dots; they no longer widen the margin.
  const b = perspectiveScene()
  PERSPECTIVE_TEMPLATES['mip-cone'].draw(b, { mode: 'cone' })
  const out = renderPerspective(b.units, {
    camera: PERSPECTIVE_TEMPLATES['mip-cone'].camera,
    box: { w: 200, h: 160 }
  })
  assert.ok(out.content.pad < 12, `margin ${out.content.pad}`)
  assert.ok(Math.max(out.drawn.x1 - out.drawn.x0, out.drawn.y1 - out.drawn.y0) > 140)
})

test('lint: tilted verticals, a leaning plane, a small scene, panels seen differently', async () => {
  await withFigure(
    async (fig) => {
      fig.style('paper')
      const draw = (b) => {
        b.box({ id: 'cube', at: [0, 0, 0.5], size: [1, 1, 1], wire: 'dotted' })
        b.plane({ id: 'pic', at: [0, -1, 0.5], axes: 'xz', size: [0.8, 0.8] })
      }
      fig.perspective({ id: 'upright', draw, x: 20, y: 20, w: 200, h: 200 })
      fig.perspective({
        id: 'tilted',
        draw,
        camera: { azimuth: -55, elevation: 35, upright: false },
        x: 240,
        y: 20,
        w: 200,
        h: 200
      })
      fig.perspective({
        id: 'leaning',
        draw: (b) => {
          b.box({ id: 'cube', at: [0, 0, 0.5], size: [1, 1, 1], wire: 'dotted' })
          b.plane({
            id: 'tip',
            at: [0, -1, 0.5],
            u: [1, 0, 0],
            v: [0, 0.4, -0.92],
            size: [0.8, 0.8]
          })
        },
        x: 460,
        y: 20,
        w: 200,
        h: 200
      })
      fig.perspective({ id: 'tiny', draw, scale: 20, x: 680, y: 20, w: 260, h: 260 })
      const report = await fig.save()
      assert.deepEqual(
        found(report, 'perspective-tilted-verticals').map((entry) => entry.id),
        ['tilted']
      )
      assert.match(found(report, 'perspective-rolled-plane')[0]?.message ?? '', /tip leaning/)
      assert.deepEqual(
        found(report, 'perspective-small-scene').map((entry) => entry.id),
        ['tiny']
      )
      assert.ok(found(report, 'perspective-cameras').some((entry) => entry.id === 'tilted'))
    },
    { widthIn: 6.75, heightIn: 2.2 }
  )
})
