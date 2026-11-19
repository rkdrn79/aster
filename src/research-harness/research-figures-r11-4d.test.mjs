import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import {
  fitScale,
  frustum,
  objectPath,
  pathUntil,
  pointAt
} from './research-figures-science-scene.mjs'
import { timeColor, TIME_START } from './research-figures-science-parts.mjs'
import { hexToOklch } from './research-figures-palette.mjs'
import { figureStyle } from './research-figures-style.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 3.4 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r11d-')))
  try {
    await mkdir(path.join(project, '.aster/figures'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const file = path.join(project, '.aster/figures/fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene(size)))
    await run(file)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const quiet = async (run) => {
  const warned = []
  const warn = console.warn
  console.warn = (message) => warned.push(String(message))
  try {
    await run()
  } finally {
    console.warn = warn
  }
  return warned
}
const parts = (fig, id, pattern) =>
  fig.elements.filter(
    (element) =>
      element.customData?.asterKit === id && element.id !== id && pattern.test(element.id)
  )
const lightness = (hex) => hexToOklch(hex).L
const ball = { kind: 'sphere', at: [-0.6, -0.4, 0.12], to: [0.6, 0.4, 0.12], arc: 0.5, r: 0.12 }

test('scene paths: given points, a throw with its arc, or a still object', () => {
  const thrown = objectPath('t', { at: [0, 0, 0], to: [1, 0, 0], arc: 0.5 }, 0)
  assert.equal(thrown.length, 25)
  assert.ok(Math.abs(thrown[12][2] - 0.5) < 1e-9, 'the arc peaks halfway')
  assert.deepEqual(objectPath('t', { at: [1, 2, 3] }, 0), [[1, 2, 3]])
  assert.deepEqual(
    pointAt(
      [
        [0, 0, 0],
        [2, 0, 0],
        [2, 2, 0]
      ],
      0.75
    ),
    [2, 1, 0]
  )
  assert.deepEqual(
    pathUntil(
      [
        [0, 0, 0],
        [2, 0, 0],
        [2, 2, 0]
      ],
      0.25
    ),
    [
      [0, 0, 0],
      [1, 0, 0]
    ]
  )
  assert.throws(
    () => objectPath('s', { path: [[0, 0]] }, 1),
    /path must be two or more \[x, y, z\]/
  )
  assert.throws(() => objectPath('s', {}, 2), /needs at: \[x, y, z\]/)
  assert.throws(
    () => objectPath('s', { at: [0, 0, 0], to: [1, 'x', 0] }, 3),
    /to must be \[x, y, z\]/
  )
  const cam = frustum({ at: [0, -2, 0], look: [0, 0, 0], size: 1, fov: 90, aspect: 1 })
  assert.deepEqual(cam.apex, [0, -2, 0])
  assert.ok(
    cam.corners.every((corner) => Math.abs(corner[1] + 1) < 1e-9),
    'the image plane is size along the view'
  )
  assert.ok(Math.abs(cam.corners[0][0] + 1) < 1e-9, 'fov 90: half-width equals size')
  const { place, scale } = fitScale(
    [
      [0, 0],
      [2, 1]
    ],
    { x: 10, y: 10, w: 100, h: 100 }
  )
  assert.equal(scale, 50)
  assert.deepEqual(place([0, 0]), [10, 35])
})

test('one time colour from gray to the accent keys flows, tracks, trails and the timebar', async () => {
  const style = figureStyle('graphite', 'blue')
  assert.ok(lightness(timeColor(style, 'accent', 0)) > lightness(timeColor(style, 'accent', 1)))
  assert.notEqual(timeColor(style, 'accent', 0), TIME_START, 'starts just off gray')
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('graphite', { accent: 'blue' })
    fig.timebar({ id: 'bar', x: 20, y: 20, w: 120 })
    const cells = parts(fig, 'bar', /-c\d+$/)
    assert.equal(cells.length, 24)
    assert.equal(cells.at(-1).backgroundColor, timeColor(style, 'accent', 23.5 / 24))
    assert.ok(
      fig.bounds('bar-start').y > 28 && fig.bounds('bar-end').x > 100,
      'labels under its ends'
    )
    fig.timebar({
      id: 'up',
      x: 300,
      y: 60,
      orientation: 'vertical',
      name: 'time',
      labels: ['early', 'late']
    })
    assert.ok(fig.bounds('up-end').y < fig.bounds('up-start').y, 't = 1 on top')
    assert.ok(fig.bounds('up-name').bottom <= 60)
    fig.timebar({ id: 'bare', x: 400, y: 20, labels: false, segments: 4 })
    assert.equal(parts(fig, 'bare', /-c\d+$/).length, 4)
    assert.ok(!fig.elements.some((element) => element.id.startsWith('bare-start')))
    assert.throws(() => fig.timebar({ id: 'x', orientation: 'diagonal' }), /Unknown orientation/)
    assert.deepEqual((await fig.save()).errors, [])
  })
})

test('scene3d: boxes show their faces to us, a thrown ball leaves a trail and ghosts, cameras', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('graphite', { accent: 'blue' })
    fig.scene3d({
      id: 's',
      x: 20,
      y: 20,
      w: 300,
      h: 200,
      objects: [
        { ...ball, ghosts: 2 },
        { kind: 'box', at: [0.2, -0.3, 0], size: 0.3 },
        { kind: 'points', at: [-0.4, 0.5, 0], n: 30, color: 'line' }
      ],
      cameras: [{ at: [1.4, -1.3, 0.9], look: [0, 0, 0.2], label: 'novel view' }]
    })
    const faces = parts(fig, 's', /-o1-face\d$/)
    assert.ok(faces.length >= 2 && faces.length <= 3, `${faces.length} faces turned to the viewer`)
    const trail = parts(fig, 's', /-o0-trail\d+$/)
    assert.equal(trail.length, 24)
    assert.ok(
      lightness(fig.get('s-o0-trail0').strokeColor) >
        lightness(fig.get('s-o0-trail23').strokeColor),
      'the trail darkens with time'
    )
    assert.equal(parts(fig, 's', /-o0-ghost\d-ball$/).length, 2)
    assert.ok(parts(fig, 's', /-o0-ghost\d-ball$/).every((ghost) => ghost.opacity < 60))
    assert.equal(parts(fig, 's', /-o2-pt\d+$/).length, 30)
    assert.equal(parts(fig, 's', /-cam0-ray\d$/).length, 4)
    assert.ok(fig.bounds('s-cam0-label').width > 0)
    fig.scene3d({
      id: 'early',
      x: 340,
      y: 20,
      w: 300,
      h: 200,
      t: 0.3,
      objects: [ball],
      ground: false
    })
    assert.equal(parts(fig, 'early', /-o0-trail\d+$/).length, 8, 'the trail so far')
    assert.ok(!fig.elements.some((element) => element.id === 'early-ground'))
    assert.throws(
      () => fig.scene3d({ id: 'k', objects: [{ kind: 'cone', at: [0, 0, 0] }] }),
      /kind must be box, sphere or points/
    )
    assert.throws(() => fig.scene3d({ id: 'c', cameras: [{ at: [0, 0] }] }), /camera 0 needs at/)
    assert.throws(
      () => fig.scene3d({ id: 'n', objects: [{ kind: 'points', at: [0, 0, 0], n: 900 }] }),
      /n must be a whole number from 1 to 600/
    )
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
  })
})

test('snapshots3d: one camera and one scale for every panel, labels under the scene', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const drawn = fig.snapshots3d({
      id: 'snap',
      x: 20,
      y: 20,
      w: 900,
      h: 200,
      times: [0, 0.5, 1],
      objects: [ball, { kind: 'box', at: [0, 0, 0], size: 0.3, color: 'mid' }]
    })
    assert.equal(drawn.panels.length, 3)
    const grounds = [0, 1, 2].map((k) => fig.get(`snap-t${k}-ground`))
    assert.ok(
      grounds.every(
        (ground) =>
          Math.abs(ground.width - grounds[0].width) < 0.01 &&
          Math.abs(ground.y - grounds[0].y) < 0.01
      ),
      'same projection'
    )
    const box = (k) => parts(fig, 'snap', new RegExp(`-t${k}-o1-face\\d$`))[0]
    assert.ok(
      Math.abs(box(0).x - grounds[0].x - (box(2).x - grounds[2].x)) < 0.02,
      'a still object stays put'
    )
    const ballAt = (k) => fig.get(`snap-t${k}-o0-ball`)
    assert.ok(ballAt(2).x - grounds[2].x > ballAt(0).x - grounds[0].x, 'the ball moves')
    assert.ok(
      Math.abs(fig.bounds('snap-t0-label').y - (20 + drawn.panels[0].height + 4)) < 5,
      JSON.stringify([fig.bounds('snap-t0-label').y, drawn.panels[0].height])
    )
    assert.ok(fig.get('snap-axis-head'))
    assert.throws(() => fig.snapshots3d({ id: 'bad', times: [0.5] }), /two or more numbers/)
    assert.throws(
      () => fig.snapshots3d({ id: 'tiny', w: 60, h: 60, times: [0, 1] }),
      /each panel would be/
    )
    assert.deepEqual((await fig.save()).errors, [])
  })
})

test('spacetime: frames along t with tracks threading them; edge-on frames warn', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('graphite', { accent: 'blue' })
    fig.spacetime({
      id: 'st',
      x: 20,
      y: 20,
      w: 320,
      h: 190,
      frames: 6,
      content: 'grid',
      highlight: 2,
      labels: true,
      tracks: [
        { from: [0.2, 0.3], to: [0.8, 0.6] },
        {
          points: [
            [0.5, 0.5],
            [0.5, 0.5],
            [0.5, 0.5],
            [0.5, 0.5],
            [0.5, 0.5],
            [0.5, 0.5]
          ],
          color: 'mid'
        }
      ]
    })
    assert.equal(parts(fig, 'st', /-f\d+$/).length, 6)
    assert.equal(parts(fig, 'st', /-edge\d$/).length, 4)
    assert.equal(parts(fig, 'st', /-track0-p\d+$/).length, 6)
    assert.equal(parts(fig, 'st', /-track0-s\d+$/).length, 5)
    assert.equal(
      fig.get('st-f2-edge').strokeColor,
      fig.palette().accents[0].ink,
      'the highlighted frame'
    )
    assert.ok(fig.bounds('st-f0-label').width > 0 && fig.get('st-axis-head'))
    const front = fig.elements.findIndex((element) => element.id === 'st-f0')
    const back = fig.elements.findIndex((element) => element.id === 'st-f5')
    assert.ok(front > back, 'the first frame is drawn last, in front')
    const warned = await quiet(() =>
      fig.spacetime({ id: 'edge', x: 400, y: 20, w: 300, h: 160, azimuth: -90, elevation: 5 })
    )
    assert.match(warned.join('\n'), /frames are only \d+ units wide/)
    assert.throws(() => fig.spacetime({ id: 'p', projection: 'fisheye' }), /Unknown projection/)
    assert.throws(
      () => fig.spacetime({ id: 't', frames: 3, tracks: [{ points: [[0, 0]] }] }),
      /one \[u, v\] per frame \(3\)/
    )
    const report = await fig.save()
    assert.ok(
      report.warnings.some(
        (finding) => finding.code === 'science-thin-frames' && finding.id === 'edge'
      )
    )
    assert.deepEqual(report.errors, [])
  })
})

test('tesseract: 16 vertices, 32 edges in three tones, an optional spin arrow', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('graphite', { accent: 'blue' })
    fig.tesseract({ id: 'h', cx: 120, cy: 120, size: 160, rotation: [0.5, 0.3], spin: true })
    assert.equal(parts(fig, 'h', /-e\d+-\d+$/).length, 32)
    assert.equal(parts(fig, 'h', /-v\d+$/).length, 16)
    const tones = new Set(parts(fig, 'h', /-e\d+-\d+$/).map((edge) => edge.strokeColor))
    assert.equal(tones.size, 3)
    assert.ok(fig.get('h-spin-head'))
    fig.tesseract({ id: 'plain', x: 300, y: 40, w: 120, vertices: false })
    assert.equal(parts(fig, 'plain', /-v\d+$/).length, 0)
    assert.throws(() => fig.tesseract({ id: 'r', rotation: ['a', 0] }), /rotation must be radians/)
    assert.deepEqual((await fig.save()).errors, [])
  })
})

test('dynamic-teaser: volume → model → scenes with a timebar, captions on one line', async () => {
  await withFigure(
    async (file) => {
      const fig = await openFigure(file)
      const drawn = fig.template('dynamic-teaser', { id: 'dyn', x: 16, y: 12, w: 940 })
      assert.deepEqual(Object.keys(drawn.ids).toSorted(), ['input', 'model', 'scene', 'time'])
      assert.equal(
        Math.round(fig.bounds('dyn-input-caption').y),
        Math.round(fig.bounds('dyn-scene-caption').y)
      )
      assert.equal(fig.get('dyn-in').endBinding.elementId, 'dyn-model')
      assert.equal(fig.get('dyn-out').endBinding.elementId, 'dyn-scene')
      const report = await fig.save()
      assert.deepEqual(report.errors, [])
      const plain = await openFigure(file)
      plain.template('dynamic-teaser', {
        id: 'dyn',
        x: 16,
        y: 12,
        w: 940,
        timebar: false,
        model: 'deformation field',
        times: [0, 1]
      })
      assert.ok(!plain.elements.some((element) => element.id.startsWith('dyn-time')))
      assert.equal(plain.get('dyn-scene').customData.asterScience.times.length, 2)
    },
    { widthIn: 6.75, heightIn: 1.75 }
  )
})
