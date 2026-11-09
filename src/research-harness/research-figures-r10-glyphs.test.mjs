import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { cropRegion, maskPoints, patchCellView } from './research-figures-glyphs-crop.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 3 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r10g-')))
  try {
    await mkdir(path.join(project, '.aster'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    await mkdir(path.join(project, 'paper/figures'), { recursive: true })
    const file = path.join(project, 'paper/figures/fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene(size)))
    await run(file)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const near = (a, b, tolerance = 0.01) => Math.abs(a - b) <= tolerance
const sameCrop = (a, b) =>
  near(a.x, b.x) && near(a.y, b.y) && near(a.width, b.width) && near(a.height, b.height)

test('one crop rule: image patches and token patches match patches() cells on a wide photo', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    // Why the cat: its photo is 3:2, so a square grid shows a centre crop of it.
    const grid = { kind: 'cat', rows: 3, cols: 3, w: 96, h: 96 }
    fig.patches({ id: 'pat', x: 40, y: 40, ...grid })
    const whole = fig.get('pat-image').crop
    assert.ok(whole.width < whole.naturalWidth, 'the square grid shows a centre crop')
    const cell = (row, col) => ({
      x: whole.x + (col * whole.width) / 3,
      y: whole.y + (row * whole.height) / 3,
      width: whole.width / 3,
      height: whole.height / 3
    })
    const cut = await fig.image({ id: 'cut', x: 200, y: 40, w: 32, h: 32, patch: [2, 1], of: grid })
    assert.ok(sameCrop(cut.crop, cell(2, 1)), JSON.stringify([cut.crop, cell(2, 1)]))
    fig.tokens({
      id: 'strip',
      x: 40,
      y: 180,
      h: 32,
      items: [
        { patch: [0, 0], of: grid },
        { patch: [1, 2], of: grid }
      ]
    })
    assert.ok(sameCrop(fig.get('strip-0').crop, cell(0, 0)))
    assert.ok(sameCrop(fig.get('strip-1').crop, cell(1, 2)))
    assert.deepEqual((await fig.save()).errors, [])
  })
})

test('crop maths: a view is trimmed around its centre, a cell is a cell of that trim', () => {
  const size = { width: 300, height: 200 }
  assert.deepEqual(cropRegion({ x: 0, y: 0, w: 1, h: 1 }, size, 1), {
    x: 50,
    y: 0,
    width: 200,
    height: 200
  })
  const cell = patchCellView(
    { view: { x: 0, y: 0, w: 1, h: 1 }, aspect: 1, row: 1, col: 1, rows: 2, cols: 2 },
    size
  )
  assert.deepEqual(cell, { x: 0.5, y: 0.5, w: 1 / 3, h: 0.5 })
})

test('masks land on the photo through its crop, clipped to what it shows', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const cat = await fig.image({
      id: 'cat',
      kind: 'cat',
      x: 40,
      y: 40,
      w: 96,
      h: 96,
      mask: 'head'
    })
    const fill = fig.get('cat-mask0')
    const edge = fig.get('cat-mask0-edge')
    assert.ok(fill.opacity < 100 && fill.backgroundColor !== 'transparent')
    assert.equal(edge.backgroundColor, 'transparent')
    const points = fill.points.map(([px, py]) => [fill.x + px, fill.y + py])
    for (const [px, py] of points) {
      assert.ok(px >= 40 - 0.01 && px <= 136.01 && py >= 40 - 0.01 && py <= 136.01, 'inside')
    }
    // The same polygon in pixels and in fractions draws the same mask.
    const size = { width: cat.crop.naturalWidth, height: cat.crop.naturalHeight }
    const share = [
      [0.4, 0.2],
      [0.6, 0.2],
      [0.5, 0.6]
    ]
    const pixels = share.map(([px, py]) => [px * size.width, py * size.height])
    assert.deepEqual(maskPoints(share, cat, size), maskPoints(pixels, cat, size))
    // A polygon wholly outside the crop draws nothing.
    assert.equal(
      maskPoints(
        [
          [0, 0],
          [0.05, 0],
          [0.05, 0.05]
        ],
        cat,
        size
      ),
      null
    )
    await fig.image({
      id: 'food',
      kind: 'food',
      x: 200,
      y: 40,
      w: 96,
      h: 72,
      mask: ['cake1', { name: 'cake4', color: 'amber' }]
    })
    assert.ok(fig.get('food-mask0') && fig.get('food-mask1'))
    assert.notEqual(fig.get('food-mask0').backgroundColor, fig.get('food-mask1').backgroundColor)
    await assert.rejects(
      fig.image({ id: 'bad', kind: 'cat', x: 300, y: 40, mask: 'tail' }),
      /No mask "tail" on the cat photo\. Built in: head/
    )
    assert.deepEqual((await fig.save()).errors, [])
  })
})

test('tint and colour work on photo patches: noise in the tint, or a wash over a plain photo', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('graphite', { accent: 'blue' })
    const items = (extra) => [{ image: 'bird', w: 32, h: 32, ...extra }]
    fig.tokens({ id: 'pred', x: 40, y: 40, items: items({ noise: 0.6, tint: 'accent' }) })
    fig.tokens({ id: 'target', x: 40, y: 100, items: items({ noise: 0.6 }) })
    assert.notEqual(fig.get('pred-0-noise').fileId, fig.get('target-0-noise').fileId)
    fig.tokens({ id: 'washed', x: 40, y: 160, items: items({ color: 'accent' }) })
    assert.equal(fig.get('washed-0-tint').backgroundColor, fig.palette().accents[0].solid)
    await fig.image({ id: 'img', kind: 'cat', x: 200, y: 40, w: 40, h: 40, tint: 'accent' })
    assert.ok(fig.get('img-wash'), 'tint on a plain photo washes it')
  })
})

test('neutral colour names keep their gray as strokes and text; mid shows on white', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('illustrative')
    const palette = fig.palette()
    assert.ok(palette.mid, 'a mid gray role')
    const lightness = (hex) => Number.parseInt(hex.slice(1, 3), 16)
    assert.ok(lightness(palette.mid) < lightness(palette.strong) - 40, 'mid is visibly darker')
    assert.ok(lightness(palette.mid) > lightness(palette.muted), 'and lighter than muted')
    fig.grid({ id: 'g', x: 40, y: 40, rows: 2, cols: 2, cell: 16, cellStroke: 'white' })
    assert.equal(fig.get('g-r0c0').strokeColor, '#ffffff')
    fig.box({ id: 'b', label: 'x', x: 120, y: 40, stroke: 'strong' })
    assert.equal(fig.get('b').strokeColor, palette.strong)
    fig.box({ id: 'm', label: 'y', x: 200, y: 40, color: 'mid' })
    assert.equal(fig.get('m').backgroundColor, palette.mid)
    fig.text({ id: 't', text: 'on dark', x: 280, y: 40, color: 'white' })
    assert.equal(fig.get('t').strokeColor, '#ffffff')
    fig.tokens({ id: 'k', x: 120, y: 120, items: ['a', 'b'], label: 'tokens' })
    assert.equal(fig.get('k-name').strokeColor, palette.ink, 'strip names print in ink')
    fig.tokens({ id: 'q', x: 120, y: 180, items: ['a'], label: 'quiet', labelColor: 'muted' })
    // Why not palette.muted: muted words print darker (#666 or darker) than muted lines.
    const quiet = fig.get('q-name').strokeColor
    assert.ok(
      lightness(quiet) <= 0x66 && lightness(quiet) > lightness(palette.ink),
      'muted words: gray, not ink'
    )
  })
})

test('matrix: [w, h] cells, cells that fit their entries at 14, ellipsis bands, highlight', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const wide = fig.matrix({
      id: 'sim',
      x: 80,
      y: 60,
      rows: 3,
      cols: 3,
      cell: [60, 30],
      cells: (i, j) => `I_${i + 1}\\cdot T_${j + 1}`
    })
    assert.deepEqual([wide.width, wide.height], [180, 90])
    assert.deepEqual([fig.get('sim-r1c2').x, fig.get('sim-r1c2').y], [200, 90])
    for (const element of fig.elements.filter((item) => item.customData?.asterKit === 'sim')) {
      for (const key of ['x', 'y', 'width', 'height']) {
        assert.ok(Number.isFinite(element[key]), `${element.id}.${key} is a number`)
      }
    }
    assert.throws(
      () => fig.matrix({ id: 'bad', x: 0, y: 0, cell: [40] }),
      /cell is a number or \[w, h\]/
    )
    // Without a cell, cells fit their entries at the small size.
    const fitted = fig.matrix({
      id: 'fit',
      x: 320,
      y: 60,
      rows: 2,
      cols: 2,
      cells: (i, j) => `I_${i + 1}\\cdot T_${j + 1}`
    })
    const entry = fig.bounds('fit-t0-0')
    assert.ok(entry.height >= 9, 'entries print at the small size, not 11 units')
    assert.ok(entry.width < fitted.width / 2 - 4, 'and fit inside their cell')
    // An ellipsis band before the last row and column: 1, 2, …, N.
    const dotted = fig.matrix({
      id: 'dots',
      x: 80,
      y: 200,
      rows: 3,
      cols: 3,
      cell: 24,
      ellipsis: true,
      rowLabels: ['1', '2', 'N'],
      colLabels: ['1', '2', 'N']
    })
    assert.equal(dotted.width, 3 * 24 + Math.round(24 * 0.6))
    assert.ok(
      fig.get('dots-r2c2').x > fig.get('dots-r1c1').x + 24,
      'the last column after the band'
    )
    for (const id of [
      'dots-r-dots0',
      'dots-c-dots0',
      'dots-x-dots',
      'dots-row-dots',
      'dots-col-dots'
    ]) {
      assert.ok(
        fig.elements.some((item) => item.id.startsWith(id)),
        id
      )
    }
    const ring = fig.highlight(['dots'], { cell: [2, 2], id: 'hl' })
    const cell = fig.get('dots-r2c2')
    assert.deepEqual([ring.x, ring.y], [cell.x, cell.y], 'highlight rings the drawn cell')
    assert.deepEqual((await fig.save()).errors, [])
  })
})

test('a photo printed large embeds the HD copy, cropped in its own pixels; masks follow it', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const small = await fig.image({ id: 'thumb', kind: 'cat', x: 40, y: 40, w: 58, h: 58 })
    assert.equal(small.fileId, 'aster-photo-cat')
    const big = await fig.image({
      id: 'big',
      kind: 'cat',
      x: 120,
      y: 40,
      w: 288,
      h: 192,
      mask: 'head'
    })
    assert.equal(big.fileId, 'aster-photo-cat-hd')
    assert.ok(big.crop.naturalWidth > 320, 'the HD file’s own size')
    assert.ok(big.crop.x + big.crop.width <= big.crop.naturalWidth + 0.01)
    // A patch cell shows a small share of the photo, so even a small cell may need HD pixels.
    const grid = { kind: 'cat', rows: 4, cols: 4, w: 172, h: 172 }
    const cell = await fig.image({
      id: 'cell',
      x: 440,
      y: 40,
      w: 43,
      h: 43,
      patch: [1, 1],
      of: grid
    })
    assert.equal(cell.fileId, 'aster-photo-cat-hd')
    const fill = fig.get('big-mask0')
    const xs = fill.points.map(([px]) => fill.x + px)
    assert.ok(Math.min(...xs) > 120 + 288 * 0.2, 'the head mask lands on the head, not the left')
    assert.deepEqual((await fig.save()).errors, [])
  })
})

test('predictions read as a clear accent cast, and masked predictions are filled in', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('graphite', { accent: 'blue' })
    const { solid, fill } = fig.palette().accents[0]
    await fig.image({ id: 'xhat', kind: 'cat', x: 40, y: 40, w: 64, h: 64, predicted: true })
    const wash = fig.get('xhat-wash')
    assert.equal(wash.backgroundColor, solid, 'the accent itself, not its pale tint')
    assert.ok(wash.opacity <= 35, 'at a third, so the photo stays visible')
    const grid = { kind: 'cat', rows: 2, cols: 2, w: 64, h: 64 }
    fig.patches({ id: 'mae', x: 140, y: 40, ...grid, masked: [[0, 1]], predicted: true })
    const cell = fig.get('mae-r0c1')
    assert.equal(cell.backgroundColor, solid)
    assert.ok(cell.opacity < 50, 'the photo shows through the predicted patch')
    assert.equal(
      fig.elements.find((element) => element.id === 'mae-wash'),
      undefined
    )
    fig.patches({ id: 'tgt', x: 240, y: 40, ...grid, masked: [[0, 1]] })
    assert.notEqual(fig.get('tgt-r0c1').backgroundColor, fill, 'a target keeps its gray holes')
    fig.patches({ id: 'all', x: 340, y: 40, ...grid, predicted: true })
    assert.equal(fig.get('all-wash').backgroundColor, solid)
  })
})

test('cells and photos under 12 units warn; features and attention default to 12', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const warned = []
    const warn = console.warn
    console.warn = (message) => warned.push(String(message))
    try {
      fig.grid({ id: 'tiny', x: 40, y: 40, rows: 2, cols: 2, cell: 8 })
      fig.features({ id: 'f', x: 120, y: 40 })
      fig.attention({ id: 'a', x: 260, y: 40, groups: [{ label: 'x', n: 3 }] })
      fig.matrix({
        id: 'm',
        x: 400,
        y: 40,
        rows: 1,
        cols: 2,
        cell: 24,
        cells: () => 'I_1\\cdot T_1'
      })
    } finally {
      console.warn = warn
    }
    assert.equal(warned.length, 2, warned.join('\n'))
    assert.match(warned[1], /matrix m: entries shrink to [\d.]+ units to fit cells 24 × 24/)
    assert.match(warned[0], /tiny draws cells or photos 8 units across, under 12/)
    assert.equal(fig.get('f-r0c0').width, 12)
    assert.equal(fig.get('a-r0c0').width, 12)
  })
})

test('grid: cells left out, a visible outline in graphite, white cells parted, own borders', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('graphite')
    const palette = fig.palette()
    fig.grid({ id: 'tri', x: 40, y: 40, rows: 3, cols: 3, cell: 16, omit: (row, col) => col > row })
    assert.equal(
      fig.elements.find((element) => element.id === 'tri-r0c2'),
      undefined
    )
    assert.ok(fig.get('tri-r2c0'))
    assert.equal(fig.get('tri').strokeColor, 'transparent', 'no box round the left-out cells')
    const fills = [
      ['accent', null],
      ['white', 'none']
    ]
    fig.grid({ id: 'nul', x: 120, y: 40, rows: 2, cols: 2, cell: 16, fills })
    assert.equal(
      fig.elements.find((element) => element.id === 'nul-r0c1'),
      undefined
    )
    assert.equal(
      fig.elements.find((element) => element.id === 'nul-r1c1'),
      undefined
    )
    assert.notEqual(fig.get('nul-r1c0').strokeColor, '#ffffff', 'white cells part in gray')
    fig.grid({ id: 'out', x: 200, y: 40, rows: 2, cols: 2, cell: 16, outline: true })
    assert.equal(fig.get('out').strokeColor, palette.line, 'outline: true shows in graphite')
    fig.grid({
      id: 'own',
      x: 280,
      y: 40,
      rows: 2,
      cols: 2,
      cell: [24, 12],
      cellStrokes: (row, col) => (row === col ? 'accent-ink' : undefined)
    })
    assert.equal(fig.get('own-r1c1').strokeColor, palette.accents[0].ink)
    assert.deepEqual([fig.get('own-r0c1').x, fig.get('own-r1c0').y], [304, 52])
  })
})

test('attention: window and sink masks, own fills, a title, TeX group names lifted only on a clash', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const palette = fig.palette()
    fig.attention({ id: 'w', x: 80, y: 80, mask: 'window', window: 2, groups: [{ n: 5 }] })
    const filled = (id, row, col) => fig.get(`${id}-r${row}c${col}`).backgroundColor !== '#ffffff'
    assert.ok(filled('w', 4, 3) && filled('w', 4, 4) && !filled('w', 4, 2) && !filled('w', 3, 4))
    fig.attention({
      id: 's',
      x: 200,
      y: 80,
      mask: 'sink',
      sinks: 1,
      window: 2,
      groups: [{ n: 5 }],
      fills: (row, col, allowed) => (allowed && row === 4 ? 'accent' : undefined),
      title: 'StreamingLLM'
    })
    assert.ok(filled('s', 4, 0) && filled('s', 4, 3) && !filled('s', 4, 1))
    assert.equal(fig.get('s-r4c0').backgroundColor, palette.accents[0].fill)
    assert.ok(fig.elements.some((element) => element.id.startsWith('s-title')))
    fig.attention({
      id: 'm',
      x: 380,
      y: 80,
      cell: 20,
      mask: (row, col) => (row + col) % 2 === 0,
      groups: [
        { label: 't_0', n: 2 },
        { label: 'EOI', n: 1 },
        { label: 't_1', n: 2 }
      ]
    })
    assert.ok(filled('m', 1, 1) && !filled('m', 1, 0))
    const t0 = fig.elements.find((element) => element.id.startsWith('m-top0'))
    assert.equal(t0.type, 'image', 't_0 is typeset, not printed as t_0')
    const tops = [0, 1, 2].map((index) => fig.bounds(`m-top${index}`))
    assert.ok(
      Math.abs(tops[1].bottom - tops[0].bottom) < 4,
      'EOI clears t_0, so it stays in the row'
    )
    fig.attention({ id: 'n', x: 560, y: 80, groups: [{ label: '<EOI>', n: 2 }] })
    assert.equal(fig.get('n-top0').type, 'text', '<EOI> prints as written')
    assert.throws(() => fig.attention({ id: 'bad', mask: 'diagonal' }), /Unknown attention mask/)
  })
})

test('grid tokens fill their w and take captions; positioned strips start at their first token; distribution highlight colour', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.tokens({
      id: 'z',
      x: 40,
      y: 40,
      h: 24,
      items: [{ grid: { rows: 2, cols: 4 }, w: 48, caption: 'z_1' }]
    })
    assert.equal(fig.bounds('z-0', { own: true }).width, 48)
    assert.equal(fig.get('z-0-r0c3').x + fig.get('z-0-r0c3').width, 88)
    assert.ok(fig.elements.some((element) => element.id.startsWith('z-0-caption')))
    fig.tokens({ id: 'p', y: 120, items: ['a', 'b'], positions: [200, 260], label: 'name' })
    assert.equal(fig.get('p').x, 200, 'the outline starts at the first token, not x = 0')
    assert.ok(fig.bounds('p-name').right <= 200)
    fig.distribution({
      id: 'd',
      x: 40,
      y: 200,
      values: [1, 3, 2],
      highlight: 1,
      highlightColor: 'accent-solid'
    })
    assert.equal(fig.get('d-b1').backgroundColor, fig.palette().accents[0].solid)
  })
})

test('frames: the axis clears its own last tick, ticks take a format, frames differ, a name label', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.frames({ id: 'a', x: 60, y: 60, kind: 'robot', count: 4, label: 'x', labelSide: 'left' })
    fig.frames({
      id: 'b',
      x: 240,
      y: 40,
      kind: 'robot',
      layout: 'row',
      w: 64,
      h: 48,
      ticks: (index) => `t+${index}`,
      axisLabel: 'time'
    })
    const report = await fig.save()
    assert.deepEqual(
      [...report.errors, ...report.warnings].filter((entry) => entry.code === 'label-on-head'),
      []
    )
    const last = fig.bounds('a-t3')
    const axis = fig.get('a-time')
    assert.ok(axis.x + axis.width >= last.right + 15, 'the head starts past the last tick')
    assert.ok(fig.elements.some((element) => element.id.startsWith('b-axis-label')))
    assert.ok(
      fig.bounds('a-label').right <= fig.bounds('a-f0').x,
      'the name sits left of the stack'
    )
    const views = [0, 1, 2, 3].map((index) => fig.get(`b-f${index}`).crop.x)
    assert.ok(views[3] - views[0] > fig.get('b-f0').crop.naturalWidth * 0.3, 'the frames pan')
    const tick = fig.elements.find((element) => element.id.startsWith('b-t2'))
    assert.equal(tick.type, 'image', 't+2 typeset')
  })
})

test('a prediction cast over a large photo is not a bold fill', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('graphite', { accent: 'blue' })
    await fig.image({ id: 'xhat', kind: 'cat', x: 40, y: 40, w: 300, h: 200, predicted: true })
    const report = await fig.save()
    assert.deepEqual(
      report.warnings.filter((entry) => entry.code === 'bold-fills'),
      []
    )
  })
})

test('prompts on a photo: points and a box through the crop; polylines take opacity', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    await fig.image({
      id: 'cat',
      kind: 'cat',
      x: 40,
      y: 40,
      w: 96,
      h: 96,
      prompt: { points: [[0.55, 0.5]], negative: [[0.02, 0.5]], box: [0.35, 0.05, 0.5, 0.9] }
    })
    const point = fig.get('cat-point0')
    assert.ok(point.x > 40 && point.x < 136 && point.y > 40 && point.y < 136)
    assert.equal(point.strokeColor, '#ffffff', 'a white rim')
    // The negative point sits outside the square crop of a wide photo, so it is left out.
    assert.equal(
      fig.elements.find((element) => element.id === 'cat-negative0'),
      undefined
    )
    const box = fig.get('cat-box')
    assert.ok(box.x >= 40 && box.x + box.width <= 136.01 && box.backgroundColor === 'transparent')
    fig.polyline({
      id: 'region',
      closed: true,
      fill: 'accent',
      opacity: 50,
      points: [
        [200, 40],
        [240, 40],
        [220, 80]
      ]
    })
    assert.equal(fig.get('region').opacity, 50)
  })
})
