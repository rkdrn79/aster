import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { renderPicture } from './research-figures-pictures.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 3 }) {
  const project = await realpath(
    await mkdtemp(path.join(os.tmpdir(), 'aster-figures-glyph-fixes-'))
  )
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

test('glyph fixes: noise tint and intensity, gray roles, washes, matrix frame and borders', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const palette = fig.palette()
    fig.tokens({
      id: 'z',
      x: 40,
      y: 40,
      items: [{ noise: 1 }, { noise: 1, color: 'accent' }, { noise: 0.3 }]
    })
    const [plain, tinted, faint] = ['z-0', 'z-1', 'z-2'].map((id) => fig.get(id).fileId)
    assert.notEqual(plain, tinted)
    assert.notEqual(plain, faint)
    fig.distribution({ id: 'p', x: 40, y: 120, values: [1, 2, 3], color: 'muted' })
    assert.equal(fig.get('p-b0').backgroundColor, palette.muted)
    fig.distribution({ id: 'q', x: 140, y: 120, values: [1, 2, 3], color: 'block' })
    assert.notEqual(fig.get('q-b0').backgroundColor, palette.strong)
    // Why no wash: a prediction with a mask predicts the masked cells, which are filled in.
    fig.patches({ id: 'm', x: 240, y: 120, rows: 2, cols: 2, masked: [[0, 0]], predicted: true })
    assert.equal(
      fig.elements.find((element) => element.id === 'm-wash'),
      undefined
    )
    assert.equal(fig.get('m-r0c0').backgroundColor, palette.accents[0].fill)
    assert.notEqual(fig.get('m-r1c1').backgroundColor, palette.accents[0].fill)
    fig.matrix({
      id: 's',
      x: 400,
      y: 120,
      rows: 2,
      cols: 2,
      fills: [
        ['white', 'white'],
        ['white', 'accent']
      ]
    })
    const matrix = fig.elements.map((element) => element.id)
    assert.ok(matrix.indexOf('s') > matrix.indexOf('s-r1c1'), 'frame over the cells')
    assert.notEqual(fig.get('s-r0c0').strokeColor, '#ffffff')
  })
})

test('noise renders at the size it is drawn, with grain that does not beat into a grid', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const big = await fig.image({ id: 'n', kind: 'noise', x: 40, y: 40, w: 200, h: 120 })
    const data = fig.scene.files[big.fileId].dataURL
    const png = Buffer.from(data.split(',')[1], 'base64')
    assert.equal(png.readUInt32BE(16), 400, 'two pixels a unit, not a 160 px tile')
    assert.equal(png.readUInt32BE(20), 240)
  })
  const field = renderPicture({ kind: 'noise', width: 64, height: 64, grain: 1 })
  let clipped = 0
  for (let index = 0; index < field.length; index += 3) {
    clipped += field[index] === 0 || field[index] === 255 ? 1 : 0
  }
  assert.ok(clipped < 64 * 64 * 0.02, `${clipped} pixels clipped to black or white`)
  const faint = renderPicture({ kind: 'noise', width: 32, height: 32, grain: 1, intensity: 0.2 })
  const spread = Math.max(...faint.filter((_, index) => index % 3 === 0)) - 128
  assert.ok(spread < 40, `faint noise spreads ${spread}`)
})

test('tokens on another strip’s columns keep its widths and say when one does not fit', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const top = fig.tokens({ id: 'in', x: 60, y: 40, items: ['a', 'cat', 'sat', 'on'] })
    const low = fig.tokens({
      id: 'out',
      y: 100,
      cx: 500,
      columnsOf: 'in',
      items: ['', 'cat', '', 'on']
    })
    for (const [index, cell] of low.cells.entries()) {
      assert.equal(cell.w, top.cells[index].w, `cell ${index} as wide as its column`)
      assert.equal(cell.x, top.cells[index].x, `cell ${index} under its column`)
    }
    assert.throws(
      () => fig.tokens({ id: 'wide', y: 160, columnsOf: 'in', items: ['', 'enormous', 'b', 'c'] }),
      /wide-1 is \d+ wide and runs into wide-0/
    )
  })
})
