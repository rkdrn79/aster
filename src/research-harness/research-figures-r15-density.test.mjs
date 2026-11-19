// Round 15: distributions as numbers (presets, full-covariance Gaussians, mixtures, KDEs), contour
// bands that paint right (holes filled with the band around them), the interpolant's closed-form
// velocity and OT pairs, and the density and flow glyphs built on them (panel, overlay, strip,
// planes; pictures at the ends; the older names still drawing).
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import {
  DIST_NAMES,
  gridDensity,
  logDensity,
  resolveDist,
  sampleDist
} from './research-figures-dist.mjs'
import { contourBands, levelMasses } from './research-figures-contours.mjs'
import { assignment, interpolant, odePaths, sdePaths } from './research-figures-interp.mjs'
import { seeded } from './research-figures-science-math.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r15d-')))
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

test('every preset is a normalised mixture in about [-1, 1]² and samples land on it', () => {
  for (const name of [...DIST_NAMES, 'mix8']) {
    const dist = resolveDist(name)
    const total = dist.components.reduce((sum, part) => sum + part.weight, 0)
    assert.ok(Math.abs(total - 1) < 1e-9, `${name} weights sum to 1`)
    const points = sampleDist(dist, 400, seeded(2))
    const inside = points.filter(([x, y]) => Math.abs(x) <= 1.3 && Math.abs(y) <= 1.3).length
    assert.ok(inside > 380, `${name}: ${inside} of 400 samples in [-1.3, 1.3]²`)
  }
  const gaussian = resolveDist({
    mean: [1, 2],
    cov: [
      [0.5, 0.3],
      [0.3, 0.4]
    ]
  })
  assert.deepEqual(gaussian.components[0].cov, [0.5, 0.3, 0.4])
  const moved = resolveDist({ preset: 'gaussian', at: [3, 0], scale: 2 })
  assert.deepEqual(moved.components[0].mean, [3, 0])
  assert.ok(Math.abs(moved.components[0].cov[0] - 4 * 0.16) < 1e-9)
  assert.equal(
    resolveDist({
      points: [
        [0, 0],
        [1, 1]
      ],
      bandwidth: 0.1
    }).components.length,
    2
  )
  assert.throws(() => resolveDist('swirl'), /Unknown dist "swirl"/)
  assert.throws(
    () =>
      resolveDist({
        mean: [0, 0],
        cov: [
          [1, 2],
          [2, 1]
        ]
      }),
    /positive definite/
  )
})

test('contour bands paint outer to inner and fill a ring hole with the band around it', () => {
  const ring = resolveDist('ring')
  const grid = gridDensity(ring, { x: -1.3, y: -1.3, w: 2.6, h: 2.6 }, 0.02)
  const loops = contourBands(grid, levelMasses(4))
  const holes = loops.filter((loop) => loop.hole)
  assert.ok(holes.length >= 3, 'a ring has a hole at every level')
  for (let k = 1; k < loops.length; k += 1) {
    assert.ok(
      loops[k].depth >= loops[k - 1].depth,
      'each outline is painted before the ones inside it'
    )
  }
  const masses = levelMasses(6)
  assert.equal(masses.length, 6)
  assert.ok(
    masses[0] > 0.94 && masses.at(-1) < 0.2 && masses.every((m, k) => !k || m < masses[k - 1])
  )
})

test('the marginal ODE lands on the data; the SDE keeps the same ends; OT pairs are optimal', () => {
  const from = resolveDist({ preset: 'gaussian', at: [-1.5, 0], scale: 0.5 })
  const to = resolveDist({ preset: '8gaussians', at: [1.5, 0] })
  const interp = interpolant(from, to)
  const starts = sampleDist(from, 24, seeded(4))
  const ends = odePaths(interp, starts).map((path) => path.at(-1))
  const typical = sampleDist(to, 200, seeded(9)).map((point) => logDensity(to, point))
  const floor = typical.toSorted((a, b) => a - b)[10]
  assert.ok(
    ends.every((point) => logDensity(to, point) > floor),
    'ODE ends sit in the modes'
  )
  const noisy = sdePaths(interp, starts, { eps: 0.2, random: seeded(3) }).map((path) => path.at(-1))
  assert.ok(noisy.filter((point) => logDensity(to, point) > floor).length >= 20)
  const a = sampleDist(from, 6, seeded(1))
  const b = sampleDist(to, 6, seeded(2))
  const cost = (match) =>
    match.reduce((sum, j, i) => sum + (a[i][0] - b[j][0]) ** 2 + (a[i][1] - b[j][1]) ** 2, 0)
  const permutations = (items) =>
    items.length <= 1
      ? [items]
      : items.flatMap((item, i) =>
          permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])
        )
  const best = Math.min(...permutations([0, 1, 2, 3, 4, 5]).map(cost))
  assert.ok(Math.abs(cost(assignment(a, b)) - best) < 1e-9)
})

test('density draws filled bands or lines from a style and a box argument', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('generative')
    fig.density({ id: 'd', dist: 'mix8', style: 'filled' }, { x: 20, y: 20, w: 140, h: 140 })
    const bands = fig.elements.filter((element) => element.id.startsWith('d-band'))
    assert.ok(bands.length >= 6 * 1 && bands.every((band) => band.type === 'line'))
    assert.ok(
      bands.some((band) => band.backgroundColor !== 'transparent'),
      'filled'
    )
    assert.ok(fig.get('d').customData.asterScience.mixture.components.length === 8)
    fig.density({ id: 'l', dist: 'moons', style: 'line', x: 200, y: 20, w: 140, h: 140 })
    assert.ok(
      fig.elements
        .filter((element) => element.id.startsWith('l-band'))
        .every((band) => band.backgroundColor === 'transparent')
    )
    fig.samples({ id: 's', of: 'd', n: 30 })
    assert.equal(fig.elements.filter((element) => /^s-p\d+$/.test(element.id)).length, 30)
    assert.deepEqual((await fig.save()).errors, [])
  })
})

test('flow panels: p_t between noise and data, paths, a highlighted example, velocity and pictures', async () => {
  await withFigure(
    async (file) => {
      const fig = await openFigure(file)
      fig.style('generative')
      const grid = fig.teaserGrid({
        id: 'g',
        panels: ['(a) Data', '(b) Path design', '(c) Training', '(d) Sampling']
      })
      const [a, b, c, d] = grid.panels
      const data = fig.flow({ id: 'fa', paths: 0, pictures: { x0: 'noise', x1: 'dog' } }, a)
      assert.equal(data.pictures.length, 2)
      assert.ok(fig.get('fa-x0-image') && fig.get('fa-x1-image'))
      assert.equal(
        fig.get('fa-x0-image').customData.asterIconPicture,
        true,
        'an end thumbnail is an icon'
      )
      assert.ok(data.anchors.from[0] < data.anchors.to[0], 'noise left, data right')
      fig.flow({ id: 'fb', paths: 0, snapshots: [0, 1 / 3, 2 / 3, 1] }, b)
      const lines = fig.elements.filter((element) => /^fb-t[12]-band/.test(element.id))
      assert.ok(
        lines.length >= 8 && lines.every((line) => line.backgroundColor === 'transparent'),
        'p_t unfilled'
      )
      const train = fig.flow(
        { id: 'fc', paths: 0, snapshots: [0, 0.5, 1], velocity: { compare: true } },
        c
      )
      assert.ok(
        fig.get('fc-velocity-true') &&
          fig.get('fc-error').strokeStyle === 'dotted' &&
          train.anchors.x
      )
      const sample = fig.flow({ id: 'fd', paths: 40, velocity: true, pictures: { x1: 'dog' } }, d)
      const thin = fig.elements.filter(
        (element) => /^fd-path\d+$/.test(element.id) && element.strokeWidth < 2
      )
      assert.equal(thin.length, 39)
      assert.ok(
        thin.every((path) => path.opacity < 50),
        'thin paths are translucent'
      )
      assert.ok(fig.get(`fd-path${sample.highlight}`).strokeWidth > 2)
      assert.deepEqual(sample.anchors.x1, sample.anchors[`path${sample.highlight}.end`])
      const report = await fig.save()
      assert.deepEqual(report.errors, [])
      assert.ok(!report.warnings.some((entry) => entry.code === 'science-rings'))
    },
    { widthIn: 6.75, heightIn: 1.6 }
  )
})

test('flow overlay, strip and planes; couplings straight or curved; the older names still draw', async () => {
  await withFigure(
    async (file) => {
      const fig = await openFigure(file)
      fig.style('generative')
      const ot = fig.flow({
        id: 'ot',
        layout: 'overlay',
        from: 'moons',
        to: '8gaussians',
        coupling: 'ot',
        paths: 30,
        density: false,
        x: 12,
        y: 12,
        w: 150,
        h: 150
      })
      assert.ok(ot.anchors['path0.end'])
      assert.equal(fig.elements.filter((element) => /^ot-end\d+$/.test(element.id)).length, 30)
      const straight = fig.get('ot-path1')
      assert.ok(straight.points.length <= 3, 'OT paths are straight lines')
      fig.flow({
        id: 'st',
        layout: 'strip',
        from: 'gaussian',
        to: 'spiral',
        snapshots: [0, 0.5, 1],
        paths: 6,
        x: 180,
        y: 12,
        w: 360,
        h: 140
      })
      assert.equal(fig.elements.filter((element) => /^st-t2-p\d+$/.test(element.id)).length, 6)
      const planes = fig.flow({
        id: 'pl',
        layout: 'planes',
        from: 'moons',
        to: 'checkerboard',
        paths: 8,
        sde: 0.2,
        x: 560,
        y: 12,
        w: 400,
        h: 170
      })
      assert.equal(planes.panels.length, 4)
      assert.ok(fig.get('pl-t0-plane') && fig.get('pl-path0-0') && fig.get('pl-path0-2'))
      assert.throws(() => fig.flow({ id: 'bad', coupling: 'magic' }), /Unknown coupling "magic"/)
      const rows = fig.pathDensity({
        id: 'pr',
        layout: 'band',
        profiles: 5,
        x: 440,
        y: 200,
        w: 160,
        h: 110
      })
      assert.ok(
        rows.anchors['row0.band0'][1] < rows.anchors['row4.band0'][1],
        't = 1 on the top row'
      )
      assert.ok(fig.get('pr-row0-marginal') && fig.get('pr-row4-marginal'))
      const old = fig.pathDensity({
        id: 'pd',
        x: 12,
        y: 200,
        w: 400,
        h: 120,
        paths: { n: 5, kind: 'straight', coupling: 'random' }
      })
      assert.equal(old.panels.length, 4)
      assert.equal(fig.get('pd').customData.asterGlyph, 'pathDensity')
      assert.deepEqual((await fig.save()).errors, [])
    },
    { widthIn: 6.75, heightIn: 2.4 }
  )
})
