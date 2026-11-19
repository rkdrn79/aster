// Round 12 kit: quiet panel outlines, curved arrows and self-loops, rotated ellipses, the 2D curve
// manifold, plot placement (fit, naming, small cells) and the teaser grid.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { covarianceAxes } from './research-figures-glyphs-curves.mjs'
import { fitPlot } from './research-figures-kit-plots.mjs'
import { teaserSizes } from './research-figures-kit-teaser.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2.5 }, slug = 'fig') {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r12-')))
  try {
    const folder = path.join(project, '.aster/figures')
    await mkdir(folder, { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const file = path.join(folder, `${slug}.excalidraw`)
    await writeFile(file, JSON.stringify(newFigureScene(size)))
    await run(file, folder)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const found = (report, code) =>
  [...report.errors, ...report.warnings].filter((entry) => entry.code === code)

test('panel outlines: true is the quiet line, dashed only when asked, unknown throws', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('graphite', { look: 'preset' })
    const at = (id, extra) => fig.panel({ id, x: 20, y: 20, w: 120, h: 80, ...extra })
    const quiet = at('a', { outline: true, color: 'none' })
    assert.deepEqual(
      [quiet.strokeStyle, quiet.strokeWidth, quiet.strokeColor],
      ['solid', 1, '#adadad']
    )
    assert.equal(quiet.backgroundColor, 'transparent')
    assert.equal(at('b', { outline: 'dashed' }).strokeStyle, 'dashed')
    assert.equal(at('c', { outline: 'hairline' }).strokeWidth, 0.6)
    const tint = at('d', { outline: 'tint', color: 'none' })
    assert.equal(tint.strokeColor, 'transparent')
    assert.equal(tint.backgroundColor, '#f4f4f4')
    assert.equal(at('e', {}).strokeColor, 'transparent', 'no outline unless asked')
    assert.throws(() => at('f', { outline: 'heavy' }), /Unknown panel outline "heavy"/)
    fig.style('outline')
    assert.equal(at('g', { outline: true }).strokeWidth, 0.6, 'the outline preset gets a hairline')
  })
})

test('curve and loop: smooth arcs and self-loops, bound, never flagged as diagonal or detour', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.node({ id: 's1', cx: 120, cy: 150, r: 16, symbol: 'dot' })
    fig.node({ id: 's2', cx: 360, cy: 150, r: 16, symbol: 'dot' })
    const there = fig.curve({ id: 'go', from: 's1', to: 's2', bend: 30, label: 'p' })
    const back = fig.curve({ id: 'back', from: 's2', to: 's1', bend: 30, label: 'q' })
    const wave = fig.curve({ id: 'wave', from: [480, 80], to: [640, 180], shape: 's' })
    const stay = fig.loop({ id: 'stay', on: 's1', side: 'top', label: '76.5\\%' })
    assert.equal(there.points.length, 3)
    assert.equal(wave.points.length, 4)
    assert.equal(stay.points.length, 5)
    assert.deepEqual([stay.startBinding.elementId, stay.endBinding.elementId], ['s1', 's1'])
    assert.ok(stay.customData.asterCurve && stay.roundness?.type === 2)
    // Why: opposite arcs between one pair bulge apart, so they never overlap.
    const middle = (arrow) => arrow.y + arrow.points[1][1]
    assert.ok(middle(there) < 150 && middle(back) > 150, `${middle(there)} ${middle(back)}`)
    assert.ok(fig.bounds('stay-label').bottom <= fig.bounds('stay', { own: true }).y + 0.5)
    const report = await fig.save()
    for (const code of ['diagonal-segment', 'detour', 'arrow-chain', 'label-on-head']) {
      assert.deepEqual(found(report, code), [], code)
    }
    assert.throws(() => fig.loop({ id: 'x', on: 's2', side: 'up' }), /Unknown loop side/)
  })
})

test('ellipse: rotated and covariance rings; curveManifold: shells, dots on and off, lookups', async () => {
  const axes = covarianceAxes([
    [400, 0],
    [0, 100]
  ])
  assert.deepEqual([axes.rx, axes.ry, Math.abs(axes.angle)], [20, 10, 0])
  // Why negative: x and y-down rising together run down-right, clockwise as seen.
  assert.ok(
    covarianceAxes([
      [400, 250],
      [250, 300]
    ]).angle < 0
  )
  assert.throws(
    () =>
      covarianceAxes([
        [1, 2],
        [2, 1]
      ]),
    /positive definite/
  )
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const blob = fig.ellipse({ id: 'g', cx: 100, cy: 120, rx: 30, ry: 12, angle: 45, levels: 3 })
    assert.equal(fig.elements.filter((e) => e.id.startsWith('g-ring')).length, 3)
    assert.ok(Math.abs(blob.width - blob.height) < 1, 'a 45° ellipse is as wide as it is tall')
    const m = fig.curveManifold({
      id: 'm',
      x: 300,
      y: 60,
      w: 300,
      h: 140,
      curve: 's',
      shells: [10, 22],
      on: 6,
      off: 5,
      tangent: 0.3,
      projections: [{ off: 0 }]
    })
    const ids = fig.elements.map((e) => e.id)
    for (const part of [
      'm-shell0',
      'm-shell1',
      'm-curve',
      'm-on5',
      'm-off4',
      'm-tangent',
      'm-proj0'
    ]) {
      assert.ok(ids.includes(part), part)
    }
    const [x, y] = m.point(0.5)
    assert.ok(Math.abs(x - 450) < 2 && Math.abs(y - 130) < 2, `${x} ${y}`)
    assert.ok(Math.abs(Math.hypot(...m.normal(0.2)) - 1) < 1e-9)
    assert.equal(m.offPoints.length, 5)
  })
})

test('plot placement: fit width, height and exact; small cells throw; helper names', async () => {
  const natural = { width: 400, height: 200 }
  assert.deepEqual(fitPlot(natural, { w: 200, h: 300, fit: 'width' }), {
    width: 200,
    height: 100,
    scale: 0.5
  })
  assert.equal(fitPlot(natural, { w: 900, h: 100, fit: 'height' }).width, 200)
  assert.deepEqual(fitPlot(natural, { w: 300, h: 150, fit: 'exact' }), {
    width: 300,
    height: 150,
    scale: 0.75
  })
  assert.ok(fitPlot(natural, { w: 300, h: 300, fit: 'exact' }).misfit > 0.4)
  assert.throws(() => fitPlot(natural, { id: 'p', fit: 'width' }), /fit 'width' needs w/)
  await withFigure(
    async (file, folder) => {
      const svg = `<svg width="216pt" height="144pt" viewBox="0 0 216 144" xmlns="http://www.w3.org/2000/svg"><g transform="translate(20 140) scale(0.07 -0.07)"><path d="M0 0"/></g></svg>`
      await writeFile(path.join(folder, 'g2-1.embed.svg'), svg)
      await writeFile(path.join(folder, 'flows.embed.svg'), svg)
      await writeFile(
        path.join(folder, 'flows.plot.json'),
        JSON.stringify({ slug: 'flows', panel: true, files: { embed: 'flows.embed.svg' } })
      )
      const warnings = []
      const fig = await openFigure(file)
      const original = console.warn
      console.warn = (line) => warnings.push(String(line))
      try {
        await assert.rejects(fig.plot({ id: 'p', figure: 'g2-1' }), /name it g2-1-<part>/)
        const placed = await fig.plot({
          id: 'q',
          figure: 'flows',
          x: 20,
          y: 20,
          w: 432,
          h: 288,
          fit: 'exact'
        })
        assert.deepEqual([placed.x, placed.y, placed.width, placed.height], [20, 20, 432, 288])
        assert.ok(
          warnings.some((line) => /name helper plots g2-1-<part>/.test(line)),
          warnings.join('\n')
        )
        await assert.rejects(
          fig.plots({
            id: 'grid',
            x: 20,
            y: 20,
            w: 120,
            grid: [1, 4],
            items: [1, 2, 3, 4].map(() => ({ svg: svg }))
          }),
          /leaves 4 cells 18 units wide/
        )
        await fig.plot({ id: 'tiny', svg, x: 20, y: 320, w: 120 })
        assert.ok(
          warnings.some((line) => /figures plot new --size 0\.83x0\.56/.test(line)),
          warnings.join('\n')
        )
      } finally {
        console.warn = original
      }
    },
    { widthIn: 6.75, heightIn: 4 },
    'g2-1'
  )
})

test('teaser grid: panels sized to the page, print-safe sizes, a warning when crowded', async () => {
  assert.deepEqual(
    [teaserSizes({ widthIn: 6.75 }).label, teaserSizes({ widthIn: 6.75 }).math],
    [16, 18]
  )
  assert.equal(teaserSizes({ widthIn: 13.5 }).label, 32, 'a page printed at half size doubles them')
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const grid = fig.teaserGrid({
      id: 't',
      panels: ['(a) Data', '(b) Path', '(c) Train', '(d) Sample']
    })
    assert.equal(grid.panels.length, 4)
    assert.ok(grid.panels.every((panel) => Math.abs(panel.w - grid.panels[0].w) < 1e-9))
    assert.equal(fig.get('t-0').strokeStyle, 'solid')
    assert.equal(grid.panels[0].slots(3).length, 3)
    assert.deepEqual(grid.warnings, [])
    const crowded = fig.teaserGrid({ id: 'u', panels: 6, y: 200, h: 120 })
    assert.match(crowded.warnings[0], /6 panels a row .* put 5 a row \(rows: 2\)/)
  })
})
