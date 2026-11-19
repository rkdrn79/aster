// Round 14 glyphs: ⊖ and ⓒ nodes, the switch and its terminals, the code card that keeps
// indentation, legends keyed to arrow roles and glyphs, the vector pair and pathDensity (p_t
// drawn exactly on one scale, paths through it, 1D bands).
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { MONO_FONT, measureText, missingGlyphs } from './research-figures-text.mjs'
import { codeLines } from './research-figures-kit-ops.mjs'
import { ARROW_ROLES, figureStyle, inkColor } from './research-figures-style.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r14g-')))
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

const codes = (report) =>
  [...report.errors, ...report.warnings, ...report.notes].map((entry) => entry.code)
const owned = (fig, id) => fig.elements.filter((element) => element.customData?.asterKit === id)

test('minus and concat nodes are drawn apart from plus', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('generative')
    fig.node({ id: 'add', cx: 40, cy: 40, symbol: 'plus' })
    fig.node({ id: 'sub', cx: 80, cy: 40, symbol: 'minus' })
    fig.node({ id: 'cat', cx: 120, cy: 40, symbol: 'concat' })
    const lines = (id) => owned(fig, id).filter((element) => element.type === 'line')
    assert.equal(lines('add').length, 2)
    assert.equal(lines('sub').length, 1, 'minus keeps only the bar')
    assert.equal(lines('sub')[0].height, 0)
    const c = lines('cat')
    assert.equal(c.length, 1)
    assert.ok(c[0].points.length > 6, 'concat is an arc (a c), not a cross')
    assert.equal(fig.get('cat').type, 'ellipse')
    assert.throws(() => fig.node({ id: 'bad', cx: 0, cy: 0, symbol: 'divide' }), /node symbol/)
  })
})

test('a switch has bindable terminals, a lever towards its output and straight wiring', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('generative')
    fig.box({ id: 'tau', label: 'T', x: 160, y: 72, w: 56, h: 40 })
    const sw = fig.switch({ id: 'sw', x: 256, y: 80, to: 1, label: 'switch' })
    assert.equal(sw.in, 'sw-in')
    assert.deepEqual(sw.out, ['sw-out0', 'sw-out1'])
    const lever = fig.get('sw-lever')
    const tip = [lever.x + lever.points[1][0], lever.y + lever.points[1][1]]
    const out1 = fig.get('sw-out1')
    const out0 = fig.get('sw-out0')
    const near = (terminal) =>
      Math.hypot(
        tip[0] - (terminal.x + terminal.width / 2),
        tip[1] - (terminal.y + terminal.height / 2)
      )
    assert.ok(near(out1) < near(out0), 'the lever leans to output 1')
    assert.ok(near(out1) > 2.5, 'and stops short of it')
    fig.arrow({ id: 'in', from: 'tau', to: 'sw-in' })
    const arrow = fig.get('in')
    assert.equal(arrow.endBinding.elementId, 'sw-in')
    assert.ok(
      arrow.points.every((point) => point[1] === 0),
      `a box level with the input wires straight in: ${JSON.stringify(arrow.points)}`
    )
    fig.box({ id: 'kv', label: 'K', x: 320, y: 140, w: 48, h: 32 })
    fig.arrow({ id: 'out', from: 'sw-out1', to: 'kv', route: 'vh' })
    assert.equal(fig.get('out').startBinding.elementId, 'sw-out1')
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
    assert.ok(fig.get('sw-label'))
  })
})

test('the code card keeps indentation by column, in the monospace, with highlights', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('language')
    const code = `
      def mine(bot):
          log = bot.find_block("oak_log")
          if not log:
              explore(bot)    # look around
          bot.dig(log)`
    assert.deepEqual(codeLines(code)[1], '    log = bot.find_block("oak_log")')
    const card = fig.code({
      id: 'code',
      x: 24,
      y: 24,
      title: 'Program',
      code,
      highlight: [{ line: 2, text: 'find_block' }, 4]
    })
    const texts = fig.elements.filter(
      (element) =>
        element.type === 'text' &&
        element.customData?.asterCode === 'code' &&
        element.fontFamily === MONO_FONT
    )
    const run = (start) => texts.find((element) => element.text.startsWith(start))
    const left = run('def').x
    assert.ok(Math.abs(run('log').x - (left + 4 * card.char)) < 0.1, 'four spaces of indent')
    assert.ok(Math.abs(run('explore').x - (left + 8 * card.char)) < 0.1, 'eight spaces of indent')
    assert.ok(run('# look').x > run('explore').x + 'explore(bot)'.length * card.char, 'gap kept')
    const span = run('find_block')
    assert.ok(span, 'the highlighted span is its own run')
    assert.equal(span.strokeColor, figureStyle('language').accents[0].ink)
    assert.ok(fig.get('code-h2-0'), 'a tint behind the span')
    assert.ok(fig.get('code-h4-0').width > card.width - 10, 'a whole line band')
    assert.ok(card.width >= 'log = bot.find_block("oak_log")'.length * card.char)
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
    assert.ok(!codes(report).includes('font'), 'the monospace is allowed in a code card')
    assert.throws(
      () => fig.code({ id: 'c2', x: 0, y: 200, code: 'a\nb', highlight: [{ line: 1, text: 'b' }] }),
      /line 2 does/
    )
  })
})

test('monospace text measures one advance per character', () => {
  assert.ok(Math.abs(measureText('abcd', 14, MONO_FONT).width - 4 * 14 * (1200 / 2048)) < 1e-9)
  assert.deepEqual(missingGlyphs('x → α 字', MONO_FONT), ['字'])
})

test('a legend keys arrow roles, a switch and a concat node without lint findings', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('generative', { look: 'preset' })
    fig.box({ id: 'a', label: 'A', x: 24, y: 120, w: 64, h: 40 })
    const legend = fig.legend({
      id: 'leg',
      x: 24,
      y: 24,
      items: [
        { label: 'conditioning', color: 'cond' },
        { label: 'skip connection', role: 'skip' },
        { label: 'switch', swatch: 'switch' },
        { label: 'concat', symbol: 'concat' }
      ]
    })
    assert.equal(legend.items.length, 4)
    const cond = fig.get('leg-s0')
    assert.equal(cond.type, 'arrow')
    const style = figureStyle('generative')
    assert.equal(cond.strokeColor, inkColor(style, ARROW_ROLES.cond.color, 'line'))
    assert.equal(fig.get('leg-s1').strokeStyle, 'dashed')
    assert.equal(fig.get('leg-s2-in').customData.asterLegend, 'leg')
    assert.equal(fig.get('leg-s3').customData.asterLegend, 'leg')
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
    for (const code of ['legend', 'short-dash', 'library-color']) {
      assert.ok(!codes(report).includes(code), `${code} in ${codes(report).join(', ')}`)
    }
  })
})

test('vectorPair draws u solid and v dashed from one point with labels past the tips', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('generative')
    fig.vectorPair({
      id: 'vp',
      at: [200, 150],
      u: [48, -24],
      v: [36, -44],
      labels: ['$u_t$', '$v$']
    })
    assert.equal(fig.get('vp-v0').strokeStyle, 'solid')
    assert.equal(fig.get('vp-v1').strokeStyle, 'dashed')
    assert.ok(fig.bounds('vp-l0').x > 200 + 48)
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
  })
})

test('pathDensity: p_t on one scale, the same samples moving, one example path, anchors', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('generative')
    const row = fig.pathDensity({ id: 'pt', x: 16, y: 12, w: 700, h: 204 })
    assert.equal(row.panels.length, 4)
    assert.ok(
      row.panels.every((panel) => panel.width === row.panels[0].width && panel.width >= 140)
    )
    const [first, last] = [row.anchors['t0.path0'], row.anchors['t3.path0']]
    assert.ok(
      first &&
        last &&
        Math.hypot(first[0] - last[0] + (row.panels[3].x - row.panels[0].x), first[1] - last[1]) > 1
    )
    const thick = fig.elements.filter(
      (element) => element.id.startsWith('pt-t3-trail') && element.strokeWidth > 1.5
    )
    assert.equal(thick.length, 1, 'one highlighted example path')
    // Bands fill the panel: the outer band of p_1 spans most of its panel.
    const rings = fig.elements.filter((element) => element.id.startsWith('pt-t3-band0'))
    const xs = rings.flatMap((ring) => ring.points.map((point) => ring.x + point[0]))
    const spread = (Math.max(...xs) - Math.min(...xs)) / row.panels[3].width
    assert.ok(spread > 0.75, `p_1 spans ${spread.toFixed(2)} of its panel`)
    fig.pathDensity({
      id: 'ov',
      layout: 'overlay',
      x: 740,
      y: 12,
      w: 200,
      h: 176,
      paths: { n: 6, kind: 'sde', highlight: [2] }
    })
    assert.equal(fig.get('ov-path2').strokeWidth > 2, true, 'the chosen example path is bold')
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
    assert.deepEqual(
      report.warnings.filter((entry) => !['page-fill', 'empty-space'].includes(entry.code)),
      []
    )
  })
})

test('pathDensity warns on panels too small to read and draws 1D bands', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('generative')
    const warned = []
    const original = console.warn
    console.warn = (message) => warned.push(message)
    try {
      fig.pathDensity({ id: 'tiny', x: 16, y: 12, w: 300, h: 90, steps: 5 })
    } finally {
      console.warn = original
    }
    assert.ok(
      warned.some((message) => /too small to read p_t/.test(message)),
      warned.join('\n')
    )
    const band = fig.pathDensity({ id: 'fm', layout: 'band', x: 400, y: 16, w: 176, h: 120 })
    assert.ok(band.anchors['band0.end'][1] < band.anchors['band0.start'][1], 'x_1 above 0')
    assert.equal(fig.get('fm-band0').type, 'line')
    assert.throws(
      () =>
        fig.pathDensity({
          id: 'bad',
          layout: 'band',
          x: 0,
          y: 0,
          bands: [{ from: [0], to: [1, 0.1] }]
        }),
      /from: \[mean, sigma\]/
    )
  })
})
