import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 3 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-glyphs-')))
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

test('distributions, matrices, aligned token strips, patch crops, washes and glyph labels', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const soft = fig.distribution({
      id: 'ps',
      x: 40,
      y: 40,
      values: [1, 3, 6, 2],
      highlight: 2,
      label: 'P_s'
    })
    assert.deepEqual(
      soft.values.map((value) => Math.round(value * 100)),
      [17, 50, 100, 33]
    )
    assert.notEqual(fig.get('ps-b2').backgroundColor, fig.get('ps-b1').backgroundColor)
    const sharp = fig.distribution({ id: 'pt', x: 140, y: 40, values: [1, 3, 6, 2], sharp: true })
    assert.ok(sharp.values[1] < soft.values[1], 'sharpened')
    assert.ok(fig.elements.some((element) => element.id.startsWith('ps-label')))
    fig.matrix({
      id: 'sim',
      x: 260,
      y: 40,
      rows: 3,
      cols: 3,
      diagonal: 'accent',
      label: (i, j) => `I_${i + 1}\\cdot T_${j + 1}`,
      rowLabels: ['I_1', 'I_2', 'I_3']
    })
    assert.equal(fig.get('sim-r1c1').backgroundColor, fig.palette().accents[0].fill)
    assert.ok(fig.get('sim').customData.asterGrid, 'highlight() can ring a cell')
    const top = fig.tokens({ id: 'top', x: 40, y: 160, items: ['a', 'cat', 'sat', 'down'] })
    const below = fig.tokens({
      id: 'low',
      x: 40,
      y: 220,
      columnsOf: 'top',
      items: ['x', 'y', 'z', 'w']
    })
    for (const [index, cell] of below.cells.entries()) {
      const over = top.cells[index]
      assert.equal(Math.round(cell.x + cell.w / 2), Math.round(over.x + over.w / 2))
    }
    const centred = fig.tokens({ id: 'mid', cx: 600, y: 160, items: ['<BOI>', '<EOI>'] })
    assert.equal(Math.round(centred.cells[0].x + centred.width / 2), 600)
    const stack = fig.tokens({
      id: 'col',
      x: 700,
      y: 120,
      direction: 'column',
      items: ['q', 'k', 'v']
    })
    assert.ok(stack.cells[2].y > stack.cells[0].y && stack.cells[2].x === stack.cells[0].x)
    fig.tokens({
      id: 'imgs',
      x: 300,
      y: 220,
      items: [
        { image: 'cat', caption: 'x_1', stroke: 'accent' },
        { image: 'cat', noise: 0.5 }
      ]
    })
    assert.ok(
      fig.get('imgs-0-edge') &&
        fig.elements.some((element) => element.id.startsWith('imgs-0-caption'))
    )
    const grid = { kind: 'landscape', rows: 4, cols: 4 }
    fig.patches({ id: 'pat', x: 440, y: 202, w: 64, h: 64, ...grid, predicted: true })
    assert.ok(fig.get('pat-wash'))
    const cut = await fig.image({
      id: 'cut',
      x: 660,
      y: 330,
      w: 16,
      h: 16,
      patch: [1, 2],
      of: grid
    })
    // Why against the grid's crop: the cell is a cell of what patches() shows, at any size.
    const whole = fig.get('pat-image').crop
    const near = (a, b) => Math.abs(a - b) < 0.01
    assert.ok(near(cut.crop.x, whole.x + (2 * whole.width) / 4), 'column 2 of the shown crop')
    assert.ok(near(cut.crop.y, whole.y + whole.height / 4), 'row 1 of the shown crop')
    assert.ok(near(cut.crop.width, whole.width / 4) && near(cut.crop.height, whole.height / 4))
    await fig.image({
      id: 'pred',
      kind: 'cat',
      x: 580,
      y: 214,
      w: 40,
      h: 40,
      predicted: true,
      label: '\\hat{x}'
    })
    assert.ok(
      fig.get('pred-wash') && fig.elements.some((element) => element.id.startsWith('pred-label'))
    )
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
  })
})

test('measure before drawing, and a dry run that writes nothing', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const box = fig.measure('box', { label: 'encoder' })
    const drawn = fig.box({ id: 'enc', label: 'encoder', x: 40, y: 40 })
    assert.deepEqual([box.width, box.height], [drawn.width, drawn.height])
    const loss = fig.measure('loss', { label: '\\frac{1}{N}\\sum_i \\ell_i' })
    fig.features({ id: 'p', x: 40, y: 140, rows: 3, cols: 3 })
    fig.features({ id: 't', x: 140, y: 140, rows: 3, cols: 3 })
    const node = fig.loss({
      id: 'l',
      label: '\\frac{1}{N}\\sum_i \\ell_i',
      predictions: 'p',
      targets: 't'
    })
    assert.deepEqual([loss.width, loss.height], [node.width, node.height])
    const [all, own] = [fig.bounds('l'), fig.bounds('l', { own: true })]
    assert.ok(all.width * all.height > own.width * own.height, 'links and rings count')
    assert.ok(fig.measure('tokens', { items: ['a', 'cat'] }).width > 0)
    assert.throws(() => fig.measure('blob', {}), /measure\(\) knows/)
    const before = await (await import('node:fs/promises')).readFile(file, 'utf8')
    const dry = await fig.save({ dryRun: true })
    assert.ok(dry.bounds.enc && dry.bounds.l)
    assert.equal(await (await import('node:fs/promises')).readFile(file, 'utf8'), before)
  })
})

test('templates rename plain labels, and figures kit <template> lists their parts', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const drawn = fig.template('qformer', { id: 'qf', x: 40, y: 30, labels: { encoder: 'ViT-g' } })
    const labels = fig.elements.filter(
      (element) =>
        element.type === 'text' &&
        (element.containerId === drawn.ids.encoder ||
          element.id.startsWith(`${drawn.ids.encoder}-label`))
    )
    assert.deepEqual(
      labels.map((element) => element.text),
      ['ViT-g']
    )
    assert.throws(
      () => fig.template('qformer', { id: 'q2', x: 40, y: 220, labels: { nope: 'x' } }),
      /No part "nope"/
    )
  })
  const { spawnSync } = await import('node:child_process')
  const shown = spawnSync(
    process.execPath,
    [path.join(import.meta.dirname, 'cli.mjs'), 'figures', 'kit', 'qformer'],
    {
      encoding: 'utf8'
    }
  )
  assert.match(shown.stdout, /Returns ids: image, encoder, queries, qformer/)
})
