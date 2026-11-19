import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { hueFamilies } from './research-figures-lint-science.mjs'
import {
  colorRamp,
  contourLoops,
  densityGrid,
  massLevels,
  mixtureIn,
  moveMixture,
  sampleMixture,
  scoreAt,
  seeded,
  simplifyLoop,
  smoothPath
} from './research-figures-science-math.mjs'
import {
  couple,
  integratePaths,
  mixture1d,
  paths1d,
  quantiles1d
} from './research-figures-science-flow.mjs'
import {
  camera,
  descend,
  frontAndBack,
  greatCircle,
  normalizedSurface,
  surfaceFunction
} from './research-figures-science-3d.mjs'
import { figureStyle } from './research-figures-style.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 3 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r11s-')))
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
const codes = (report) => [...report.errors, ...report.warnings].map((finding) => finding.code)
const parts = (fig, id) =>
  fig.elements.filter((element) => element.customData?.asterKit === id && element.id !== id)

test('the seeded source repeats and mixtures sit in their box', () => {
  const a = seeded(4)
  const b = seeded(4)
  assert.deepEqual([a(), a(), a()], [b(), b(), b()])
  assert.throws(() => seeded(Number.NaN), /seed must be a number/)
  const box = { x: 100, y: 50, w: 200, h: 100 }
  const gaussian = mixtureIn('gaussian', box)
  assert.deepEqual(gaussian.components[0].mean, [200, 100])
  const custom = mixtureIn(
    {
      components: [
        { mean: [0.25, 0.5], sigma: 0.1, weight: 3 },
        { mean: [0.75, 0.5], sigma: [0.1, 0.2], rho: 0.5 }
      ]
    },
    box
  )
  assert.deepEqual(custom.components[0].mean, [150, 100])
  assert.equal(custom.components[0].weight, 0.75)
  assert.ok(custom.components[1].cov[1] < 0, 'a positive rho tilts the long axis up the page')
  assert.throws(() => mixtureIn('blob', box), /Unknown dist "blob"/)
  assert.throws(() => mixtureIn({ components: [{ mean: [0.5] }] }, box), /mean must be \[u, v\]/)
  assert.throws(
    () => mixtureIn({ components: [{ mean: [0.5, 0.5], sigma: -1 }] }, box),
    /sigma or cov must be positive/
  )
  for (const name of ['two-gaussians', '8gaussians', 'ring', 'moons', 'spiral']) {
    const points = sampleMixture(mixtureIn(name, box), 50, seeded(1))
    assert.ok(
      points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)),
      name
    )
  }
})

test('contour rings hold the stated mass and a ring distribution has a hole', () => {
  const box = { x: 0, y: 0, w: 200, h: 200 }
  const mixture = mixtureIn('gaussian', box)
  const grid = densityGrid(mixture, box, 3)
  const [half, most] = massLevels(grid, [0.5, 0.9])
  const sigma = 0.17 * 200
  for (const [level, mass] of [
    [half, 0.5],
    [most, 0.9]
  ]) {
    const loops = contourLoops(grid, level)
    assert.equal(loops.length, 1)
    const radius = loops[0].map(([x, y]) => Math.hypot(x - 100, y - 100))
    const expected = sigma * Math.sqrt(-2 * Math.log(1 - mass))
    assert.ok(
      Math.abs(Math.max(...radius) - expected) < 3,
      `${mass}: ${Math.max(...radius)} vs ${expected}`
    )
  }
  const ring = mixtureIn('ring', box)
  const ringGrid = densityGrid(ring, box, 3)
  assert.equal(
    contourLoops(ringGrid, massLevels(ringGrid, [0.6])[0]).length,
    2,
    'an annulus: outer and inner outline'
  )
  const loop = smoothPath(contourLoops(grid, half)[0], { closed: true })
  assert.ok(simplifyLoop(loop, 0.3).length < loop.length)
  assert.ok(simplifyLoop(loop, 0.3).length > 8, 'a closed loop keeps its shape')
})

test('flows: ODE paths land on the data, OT pairs never cross, quantile starts fan out', () => {
  const from = mixtureIn('gaussian', { x: 0, y: 0, w: 100, h: 100 })
  const to = mixtureIn('two-gaussians', { x: 300, y: 0, w: 100, h: 100 })
  const random = seeded(2)
  const ends = integratePaths(from, to, sampleMixture(from, 8, random), { kind: 'ode' }).map(
    (path) => path.at(-1)
  )
  for (const [x, y] of ends) {
    const near = Math.min(
      ...to.components.map((component) => Math.hypot(x - component.mean[0], y - component.mean[1]))
    )
    assert.ok(near < 40, `ends ${near} units from a mode`)
  }
  const sde = integratePaths(from, to, sampleMixture(from, 4, random), { kind: 'sde', random })
  assert.ok(sde.every((path) => path.every((point) => point.every(Number.isFinite))))
  const pairs = couple(
    mixtureIn('gaussian', { x: 0, y: 0, w: 100, h: 100 }),
    mixtureIn('gaussian', { x: 300, y: 0, w: 100, h: 100 }),
    12,
    { random: seeded(1) }
  )
  const side = ([ax, ay], [bx, by], [px, py]) =>
    Math.sign((bx - ax) * (py - ay) - (by - ay) * (px - ax))
  const cross = ([a, b], [c, d]) =>
    side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0
  const crossings = pairs.flatMap((pair, i) =>
    pairs.slice(i + 1).filter((other) => cross(pair, other))
  )
  assert.equal(
    crossings.length,
    0,
    'ranked across the direction of travel, straight paths do not cross'
  )
  const random12 = couple(
    mixtureIn('gaussian', { x: 0, y: 0, w: 100, h: 100 }),
    mixtureIn('gaussian', { x: 300, y: 0, w: 100, h: 100 }),
    12,
    { coupling: 'random', random: seeded(1) }
  )
  assert.ok(
    random12.flatMap((pair, i) => random12.slice(i + 1).filter((other) => cross(pair, other)))
      .length > 0,
    'independent pairs cross'
  )
  const values = paths1d(mixture1d(), mixture1d({ modes: [-1, 1], widths: [0.3, 0.3] }), 10, {
    kind: 'ode',
    random: seeded(3)
  })
  for (let k = 0; k < values[0].length; k += 1) {
    const column = values.map((path) => path[k])
    assert.deepEqual(
      column,
      column.toSorted((a, b) => a - b),
      `ODE paths keep their order at step ${k}`
    )
  }
  const starts = quantiles1d(mixture1d(), 5, seeded(1))
  assert.ok(starts[0] < -0.8 && starts.at(-1) > 0.8, JSON.stringify(starts))
})

test('3D: the camera, descent, great circles and named surfaces', () => {
  const lens = camera({ azimuth: 0, elevation: 0 })
  assert.deepEqual(
    lens.project([0, 1, 0]).map((value) => Math.round(value * 1000) / 1000 + 0),
    [1, 0, 0]
  )
  assert.ok(lens.project([0, 0, 1])[1] < 0, 'up is up the page')
  assert.throws(() => camera({ azimuth: 'left' }), /azimuth must be a number/)
  const bowl = normalizedSurface(surfaceFunction('bowl')).at
  const path = descend(bowl, { from: [0.8, -0.6], steps: 200, lr: 0.1 })
  assert.ok(Math.hypot(...path.at(-1)) < 0.05)
  assert.throws(() => surfaceFunction('volcano'), /Unknown surface/)
  assert.throws(() => surfaceFunction(() => Number.NaN), /finite number/)
  const arc = greatCircle([0, 0], [0, 90], 10)
  assert.equal(arc.length, 11)
  assert.ok(Math.abs(Math.hypot(...arc[5]) - 1) < 1e-9)
  const runs = frontAndBack([
    [0, 0, 1],
    [0, 0, 0.5],
    [0, 0, -1],
    [0, 0, -2]
  ])
  assert.deepEqual(
    runs.map((run) => run.front),
    [true, false]
  )
})

test('density2d, samples and field share a distribution through the glyph id', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const drawn = fig.density2d({
      id: 'p',
      x: 40,
      y: 40,
      w: 120,
      h: 120,
      dist: 'two-gaussians',
      label: 'p_{\\mathrm{data}}'
    })
    assert.equal(drawn.id, 'p')
    assert.ok(fig.get('p').customData.asterScience.mixture.components.length === 2)
    const masses = parts(fig, 'p')
      .map((element) => element.customData?.asterRing?.mass)
      .filter(Boolean)
    assert.ok(
      new Set(masses).size === 6 && Math.max(...masses) > 0.9,
      'six levels by mass, the outer above 90%'
    )
    assert.ok(fig.bounds('p-label').y >= 160, 'the label sits under the box')
    fig.samples({ id: 's', of: 'p', n: 40 })
    const dots = parts(fig, 's').filter((element) => element.type === 'ellipse')
    assert.equal(dots.length, 40)
    assert.ok(dots.every((dot) => dot.x >= 38 && dot.x + dot.width <= 162))
    const again = await openFigure(file)
    again.density2d({ id: 'p', x: 40, y: 40, w: 120, h: 120, dist: 'two-gaussians' })
    again.samples({ id: 's', of: 'p', n: 40 })
    assert.deepEqual(
      parts(again, 's').map((dot) => dot.x),
      dots.map((dot) => dot.x),
      'one seed, one cloud'
    )
    fig.samples({ id: 's2', of: 'p', x: 300, y: 40, w: 60, h: 60, n: 10 })
    assert.ok(
      parts(fig, 's2').every((dot) => dot.x >= 298 && dot.x <= 362),
      'moved into its own box'
    )
    fig.field({ id: 'f', of: 'p', grid: 6 })
    assert.equal(parts(fig, 'f').filter((element) => /-a\d+-\d+$/.test(element.id)).length, 36)
    assert.throws(() => fig.samples({ id: 'bad', of: 'f' }), /carries no distribution/)
    assert.throws(
      () => fig.density2d({ id: 'lv', levels: 11 }),
      /levels must be a count from 1 to 10/
    )
    assert.throws(() => fig.samples({ id: 'n', n: 2.5 }), /n must be a whole number/)
    assert.throws(() => fig.density2d({ id: 'w', w: 'wide' }), /w must be a finite number/)
    assert.deepEqual((await fig.save()).errors, [])
  })
})

test('a ring cut by its box warns; measure sizes a science glyph without drawing it', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const warned = await quiet(() =>
      fig.density2d({
        id: 'big',
        x: 20,
        y: 20,
        w: 60,
        h: 60,
        dist: { components: [{ mean: [0.5, 0.5], sigma: 0.5 }] }
      })
    )
    assert.match(warned.join('\n'), /outer ring is cut by the box edge/)
    const size = fig.measure('density2d', { x: 10, y: 20, w: 90, h: 70, label: 'x' })
    assert.equal(size.width, 90)
    assert.equal(fig.elements.filter((element) => element.id.startsWith('__measure')).length, 0)
    assert.throws(() => fig.measure('flowPaths', {}), /measure\(\) knows/)
  })
})

test('flowPaths: straight, curved and stochastic between two densities, by id or by box', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.density2d({ id: 'noise', x: 20, y: 60, w: 100, h: 100, color: 'mid' })
    fig.density2d({ id: 'data', x: 400, y: 40, w: 140, h: 140, dist: '8gaussians' })
    for (const [id, style] of [
      ['fs', 'straight'],
      ['fc', 'curved'],
      ['fx', 'stochastic']
    ]) {
      const drawn = fig.flowPaths({ id, from: 'noise', to: 'data', style, n: 6, seed: 2 })
      assert.equal(parts(fig, id).filter((element) => /-end\d+$/.test(element.id)).length, 6)
      assert.ok(drawn.ends.length === 6)
      assert.equal(fig.get(id).customData.asterPlaced, true)
    }
    fig.flowPaths({
      id: 'flat',
      from: { x: 20, y: 200, w: 60, h: 60 },
      to: { x: 300, y: 200, w: 60, h: 60, dist: 'ring' },
      tone: 'flat',
      head: true,
      n: 3
    })
    assert.equal(
      parts(fig, 'flat').filter((element) => /-path\d+-\d+$/.test(element.id)).length,
      3,
      'flat: one line per path'
    )
    assert.ok(fig.get('flat-head0'))
    assert.throws(
      () => fig.flowPaths({ id: 'bad', from: 'noise', to: 'data', style: 'wavy' }),
      /Unknown style "wavy"/
    )
    assert.throws(() => fig.flowPaths({ id: 'bad2', from: 'noise' }), /to must be a density2d id/)
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
  })
})

test('snapshots and trajectories draw p_t along t, labelled, with a time axis', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const snap = fig.snapshots({
      id: 'snap',
      x: 20,
      y: 20,
      w: 440,
      h: 140,
      samples: 12,
      t: [0, 0.5, 1]
    })
    assert.equal(snap.panels.length, 3)
    assert.ok(fig.bounds('snap-t1-label').width > 0, 'each panel has its t')
    assert.ok(fig.get('snap-axis-head'))
    assert.equal(parts(fig, 'snap').filter((element) => /-t2-p\d+$/.test(element.id)).length, 12)
    assert.throws(() => fig.snapshots({ id: 'tiny', w: 60, h: 40 }), /would be -?\d+ units across/)
    assert.throws(
      () => fig.snapshots({ id: 'bad-t', t: [0, 2] }),
      /snapshots must be times between 0 and 1/
    )
    const tr = fig.trajectories({
      id: 'tr',
      x: 500,
      y: 20,
      w: 300,
      h: 120,
      style: 'sde',
      n: 8,
      at: [0.5]
    })
    assert.ok(tr.plot.width > 0)
    assert.equal(parts(fig, 'tr').filter((element) => /-end\d+$/.test(element.id)).length, 8)
    assert.ok(fig.get('tr-at0-profile') && fig.get('tr-from-profile') && fig.get('tr-to-profile'))
    fig.trajectories({
      id: 'left',
      x: 500,
      y: 200,
      w: 300,
      h: 100,
      direction: 'left',
      profiles: false,
      labels: false,
      axis: false
    })
    assert.ok(!fig.elements.some((element) => element.id === 'left-from-profile'))
    assert.throws(() => fig.trajectories({ id: 'r', range: [2, 1] }), /range must be \[low, high\]/)
    assert.throws(() => fig.trajectories({ id: 'a', at: [1] }), /strictly between 0 and 1/)
    assert.deepEqual((await fig.save()).errors, [])
  })
})

test('fields: named, custom and flow; bad vectors throw', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.field({ id: 'rot', x: 20, y: 20, w: 120, h: 120, kind: 'rotation', grid: 5 })
    const arrow = fig.get('rot-a0-2')
    const [dx, dy] = [
      arrow.points.at(-1)[0] - arrow.points[0][0],
      arrow.points.at(-1)[1] - arrow.points[0][1]
    ]
    assert.ok(Math.abs(dy) < 0.01 && dx > 0, 'above the centre, a rotation points right')
    fig.field({
      id: 'eq',
      x: 160,
      y: 20,
      w: 120,
      h: 120,
      f: (u, v) => [u, v],
      magnitude: 'equal',
      grid: [3, 4]
    })
    assert.equal(parts(fig, 'eq').filter((element) => element.id.endsWith('-head')).length, 12)
    fig.density2d({ id: 'a', x: 300, y: 20, w: 80, h: 80, color: 'mid' })
    fig.density2d({ id: 'b', x: 420, y: 20, w: 80, h: 80, dist: 'two-gaussians' })
    fig.field({
      id: 'fl',
      x: 300,
      y: 120,
      w: 200,
      h: 80,
      kind: 'flow',
      from: 'a',
      to: 'b',
      grid: [3, 6]
    })
    assert.throws(
      () => fig.field({ id: 'nan', f: () => [Number.NaN, 0] }),
      /it must give \[du, dv\] numbers/
    )
    assert.throws(() => fig.field({ id: 'sc', kind: 'score' }), /needs of/)
    assert.throws(
      () => fig.field({ id: 'g', grid: 1 }),
      /grid rows must be a whole number from 2 to 30/
    )
    assert.deepEqual((await fig.save()).errors, [])
  })
})

test('surface3d, manifold and sphere draw meshes back to front with their paths', async () => {
  await withFigure(
    async (file) => {
      const fig = await openFigure(file)
      const surface = fig.surface3d({
        id: 'loss',
        x: 20,
        y: 20,
        w: 240,
        h: 180,
        grid: 10,
        paths: [
          { from: [0.8, 0.8], steps: 60 },
          [
            [-0.5, 0.5],
            [0, 0]
          ]
        ]
      })
      assert.equal(
        parts(fig, 'loss').filter((element) => /-f\d+-\d+$/.test(element.id)).length,
        100
      )
      assert.equal(surface.paths.length, 2)
      assert.ok(fig.get('loss-path0-end') && fig.get('loss-path1-start'))
      fig.surface3d({
        id: 'map',
        x: 280,
        y: 20,
        w: 180,
        h: 180,
        view: 'top',
        f: 'valley',
        levels: 5,
        paths: [{ from: [-0.9, 0.9] }]
      })
      assert.ok(parts(fig, 'map').some((element) => /-band\d+-\d+$/.test(element.id)))
      fig.surface3d({
        id: 'wire',
        x: 480,
        y: 20,
        w: 200,
        h: 160,
        f: (u, v) => u * v,
        shade: 'white',
        grid: 6
      })
      assert.equal(fig.get('wire-f0-0').backgroundColor, '#ffffff')
      assert.throws(() => fig.surface3d({ id: 'bad', paths: [[[0, 'a']]] }), /path 0 must be/)
      assert.throws(() => fig.surface3d({ id: 'bad2', shade: 'glossy' }), /Unknown shade/)
      fig.manifold({
        id: 'roll',
        x: 20,
        y: 220,
        w: 220,
        h: 160,
        samples: 20,
        paths: [
          { from: [0.1, 0.5], to: [0.9, 0.5] },
          { from: [0.1, 0.5], to: [0.9, 0.5], kind: 'chord' }
        ]
      })
      assert.equal(parts(fig, 'roll').filter((element) => /-p\d+$/.test(element.id)).length, 20)
      assert.ok(fig.get('roll-path1-0').strokeStyle === 'dashed')
      assert.throws(() => fig.manifold({ id: 'm', kind: 'klein' }), /Unknown kind "klein"/)
      fig.sphere({
        id: 'sph',
        cx: 400,
        cy: 300,
        r: 70,
        geodesics: [{ from: [0, 0], to: [30, 120] }],
        points: [[45, 45]],
        back: 'dotted'
      })
      assert.ok(fig.get('sph-geo0-a') && fig.get('sph-geo0-b'))
      assert.ok(parts(fig, 'sph').some((element) => element.strokeStyle === 'dashed'))
      assert.throws(() => fig.sphere({ id: 's', r: 2 }), /r must be more than 4/)
      assert.deepEqual((await fig.save()).errors, [])
    },
    { widthIn: 6.75, heightIn: 3.4 }
  )
})

test('lint: busy, faint, fine and many-hued science glyphs are named', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('graphite', { accent: 'blue' })
    fig.samples({ id: 'crowd', x: 20, y: 20, w: 200, h: 200, n: 500, r: 0.6 })
    fig.density2d({
      id: 'rings',
      x: 240,
      y: 20,
      w: 120,
      h: 120,
      levels: [0.95, 0.85, 0.75, 0.6, 0.45, 0.3, 0.15]
    })
    fig.surface3d({ id: 'fine', x: 380, y: 20, w: 80, h: 60, grid: 40 })
    fig.field({ id: 'short', x: 480, y: 20, w: 60, h: 60, grid: 20 })
    fig.density2d({ id: 'teal', x: 560, y: 20, w: 100, h: 100, color: 'teal' })
    fig.density2d({ id: 'clay', x: 680, y: 20, w: 100, h: 100, color: 'clay' })
    const report = await fig.save()
    const found = codes(report)
    for (const code of [
      'science-clutter',
      'science-small-marks',
      'science-rings',
      'science-dense-mesh',
      'science-short-arrows',
      'science-hues'
    ]) {
      assert.ok(found.includes(code), `${code} in ${found.join(', ')}`)
    }
  })
})

test('a figure of science glyphs at their defaults lints clean of science findings', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.density2d({ id: 'n', x: 20, y: 40, w: 110, h: 110, color: 'mid', label: 'p_0' })
    fig.density2d({ id: 'd', x: 340, y: 40, w: 110, h: 110, dist: 'moons', label: 'p_1' })
    fig.flowPaths({ id: 'paths', from: 'n', to: 'd' })
    fig.trajectories({ id: 't', x: 500, y: 30, w: 440, h: 150 })
    const report = await fig.save({ dryRun: true })
    assert.deepEqual(
      report.errors.filter((finding) => finding.code === 'invalid'),
      []
    )
    assert.deepEqual(
      codes(report).filter((code) => code.startsWith('science') || code === 'text-outside-shape'),
      []
    )
  })
})

test('helpers: moved mixtures keep their shape, ramps stay in one hue, hue families', () => {
  const box = { x: 0, y: 0, w: 100, h: 100 }
  const moved = moveMixture(mixtureIn('gaussian', box), box, { x: 200, y: 0, w: 50, h: 50 })
  assert.deepEqual(moved.components[0].mean, [225, 25])
  assert.ok(Math.abs(moved.components[0].cov[0] - (17 * 0.5) ** 2) < 1e-9)
  const score = scoreAt(mixtureIn('gaussian', box), [1000, 50])
  assert.ok(score[0] < 0 && Number.isFinite(score[0]), 'far points still point home')
  const ramp = colorRamp(figureStyle('graphite', 'blue'), 'accent')
  assert.notEqual(ramp(0), ramp(1))
  assert.equal(hueFamilies([250, 255, 248]), 1)
  assert.equal(hueFamilies([250, 30, 140]), 3)
})
