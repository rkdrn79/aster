import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { inflateSync } from 'node:zlib'
import test from 'node:test'
import {
  makeArrow,
  makeBox,
  makeMath,
  makeTrapezoid,
  openFigure,
  parseMath
} from './research-figures-kit.mjs'
import { headBox } from './research-figures-labels.mjs'
import { lintFigureScene } from './research-figures-lint.mjs'
import { figureElement, newFigureScene } from './research-figures-model.mjs'
import { buildFigurePart } from './research-figures-parts.mjs'
import { encodePng } from './research-figures-png.mjs'
import { figureStyle } from './research-figures-style.mjs'
import { glyphBounds, missingGlyphs } from './research-figures-text.mjs'
import { overlaps } from './research-figures-geometry.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2.5 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-style-')))
  try {
    await mkdir(path.join(project, '.aster'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    await mkdir(path.join(project, 'paper/figures'), { recursive: true })
    const file = path.join(project, 'paper/figures/fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene(size)))
    await run(file, project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const codes = (report) => report.warnings.map((warning) => warning.code)

test('styles: neutral blocks without outlines, outline boxes, one accent, red for the loss', () => {
  const [block] = makeBox({ id: 'b', label: 'encoder' })
  assert.deepEqual(
    [block.backgroundColor, block.strokeColor, block.roundness.value],
    ['#e9e9e9', 'transparent', 4]
  )
  const outline = figureStyle('outline')
  const [white] = makeBox({ id: 'w', label: 'encoder', style: outline })
  assert.deepEqual([white.backgroundColor, white.strokeColor], ['#ffffff', '#111111'])
  const [accent] = makeBox({
    id: 'a',
    label: 'predictor',
    color: 'accent',
    style: figureStyle('slate')
  })
  assert.deepEqual(
    [accent.backgroundColor, accent.strokeColor],
    ['#fff0d0', 'transparent'],
    'slate takes a warm accent'
  )
  const [plain] = makeBox({ id: 'p', label: 'cache', color: 'white' })
  assert.deepEqual(
    [plain.backgroundColor, plain.strokeColor],
    ['#ffffff', '#cecece'],
    'a light edge, not black'
  )
  const [loss, lossText] = makeBox({ id: 'l', label: 'L1', color: 'loss' })
  assert.equal(loss.strokeColor, '#8c8c8c', 'a thin gray frame on white, not a red card')
  assert.equal(lossText.strokeColor, '#1e1e1e', 'the loss is written in ink')
  assert.equal(loss.customData.asterRole, 'loss')
  const [red] = makeBox({ id: 'r', label: 'L1', color: 'red' })
  assert.equal(red.strokeColor, '#ba2c25', 'red only when asked')
  const arrow = makeArrow({ id: 'x', from: [0, 0], to: [100, 0] }, () => null)
  assert.deepEqual([arrow.strokeColor, arrow.strokeWidth], ['#333333', 2], 'ordinary data flow')
  const main = makeArrow({ id: 'm', from: [0, 0], to: [100, 0], role: 'main' }, () => null)
  assert.deepEqual(
    [main.strokeColor, main.strokeWidth],
    ['#1e1e1e', 2.5],
    'the contribution, chosen'
  )
  const side = makeArrow({ id: 's', from: [0, 0], to: [100, 0], role: 'side' }, () => null)
  assert.deepEqual([side.strokeColor, side.strokeWidth], ['#8c8c8c', 1.5])
  assert.throws(
    () => makeArrow({ id: 'r', from: [0, 0], to: [1, 0], route: 'diagonal' }, () => null),
    /route/
  )
  assert.deepEqual(arrow.points.at(-2), [80, 0], 'a 10-unit head, not Excalidraw’s 15')
  const part = buildFigurePart('encoder', { id: 'e' })[0]
  assert.equal(part.strokeColor, 'transparent')
})

test('the lint names what looks generated, and leaves a paper-style figure alone', () => {
  const scene = newFigureScene({ widthIn: 3.25, heightIn: 2 })
  const card = (id, x, fill, stroke) =>
    figureElement('rectangle', {
      id,
      x,
      y: 20,
      width: 40,
      height: 30,
      backgroundColor: fill,
      strokeColor: stroke
    })
  scene.elements.push(
    card('c1', 20, '#cfe3f1', '#0072b2'),
    card('c2', 70, '#fbe8bf', '#e69f00'),
    card('c3', 120, '#c6eadf', '#009e73'),
    card('c4', 170, '#f5d2bf', '#d55e00'),
    card('c5', 220, '#e6d5ef', '#7a3f99'),
    card('red', 270, '#ffffff', '#e02020'),
    figureElement('rectangle', {
      id: 'redloss',
      x: 330,
      y: 20,
      width: 30,
      height: 20,
      strokeColor: '#ba2c25',
      customData: { asterRole: 'loss' }
    }),
    figureElement('text', {
      id: 'prose',
      x: 20,
      y: 80,
      width: 200,
      height: 20,
      text: 'This block encodes the input. It is then passed on to the decoder.'
    }),
    figureElement('rectangle', {
      id: 's1',
      x: 20,
      y: 120,
      width: 12,
      height: 12,
      backgroundColor: '#cfe3f1'
    }),
    figureElement('text', { id: 'k1', x: 36, y: 120, width: 40, height: 12, text: 'encoder' }),
    figureElement('rectangle', {
      id: 's2',
      x: 20,
      y: 140,
      width: 12,
      height: 12,
      backgroundColor: '#fbe8bf'
    }),
    figureElement('text', { id: 'k2', x: 36, y: 140, width: 40, height: 12, text: 'decoder' }),
    figureElement('rectangle', { id: 'ph', x: 120, y: 120, width: 40, height: 40 }),
    figureElement('line', {
      id: 'd1',
      x: 120,
      y: 120,
      width: 40,
      height: 40,
      points: [
        [0, 0],
        [40, 40]
      ]
    }),
    figureElement('line', {
      id: 'd2',
      x: 120,
      y: 160,
      width: 40,
      height: 40,
      points: [
        [0, 0],
        [40, -40]
      ]
    }),
    figureElement('arrow', {
      id: 'thin',
      x: 200,
      y: 140,
      width: 40,
      height: 0,
      strokeWidth: 1,
      points: [
        [0, 0],
        [40, 0]
      ]
    })
  )
  const linted = lintFigureScene(scene)
  const found = [...linted.errors, ...linted.warnings].map((entry) => entry.code)
  for (const code of [
    'hue-count',
    'outline-hue',
    'generated-palette',
    'loss-color',
    'prose',
    'legend',
    'placeholder',
    'thin-line'
  ]) {
    assert.ok(found.includes(code), `${code} in ${found.join(', ')}`)
  }
  const sparse = newFigureScene({ widthIn: 3.25, heightIn: 2 })
  sparse.elements.push(...makeBox({ id: 'only', label: 'encoder', x: 20, y: 20 }))
  assert.ok(codes(lintFigureScene(sparse)).includes('page-fill'))
  scene.elements[0].customData = { asterPage: { widthIn: 3.25, heightIn: 2, reference: 'r.png' } }
  const recreation = lintFigureScene(scene)
  assert.ok(
    ![...recreation.errors, ...recreation.warnings].some((entry) => entry.code === 'hue-count'),
    'a recreation keeps its colours'
  )
})

test('math: Greek and font macros, accents in subscripts, substitutes for missing glyphs', () => {
  assert.deepEqual(parseMath('E_{\\bar\\theta}'), [
    { text: 'E', level: 'base' },
    { text: 'θ', level: 'sub', accent: 'bar' }
  ])
  assert.deepEqual(
    parseMath('\\mathcal{L}_{\\text{REPA}}').map((run) => run.text),
    ['L', 'REPA']
  )
  const norm = makeMath({ id: 'n', tex: '\\|h\\| \\ast g \\circ f ∈ X' })
  assert.deepEqual(missingGlyphs(norm.elements.map((element) => element.text ?? '').join('')), [])
  const [, sub] = makeMath({ id: 'p', tex: 'P_\\phi', size: 16 }).elements
  const [base] = makeMath({ id: 'p', tex: 'P_\\phi', size: 16 }).elements
  assert.ok(sub.x < base.x + base.width, 'the subscript tucks under a capital')
})

test('boxes take a math line; arrows bind to math, keep labels off heads, start on a bus', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const enc = fig.box({ id: 'enc', label: 'encoder', math: 'E_\\theta', x: 40, y: 40 })
    const lines = fig.elements.filter((element) => element.id.startsWith('enc-label-'))
    assert.deepEqual(
      lines.map((element) => element.type),
      ['text', 'image'],
      'the name in the paper font, the math typeset by MathJax'
    )
    assert.equal(lines[1].customData.asterMath, 'E_\\theta')
    assert.ok(fig.scene.files[lines[1].fileId].dataURL.startsWith('data:image/svg+xml;base64,'))
    assert.ok(
      lines.every((element) => element.groupIds.some((group) => enc.groupIds.includes(group)))
    )
    fig.math({ id: 'z', tex: 'z_t', x: 300, y: 50 })
    const into = fig.arrow({ id: 'a', from: 'enc', to: 'z', label: 'h_\\phi(h_t)' })
    assert.equal(into.endBinding.elementId, 'z-0')
    const head = headBox(into, false, 0)
    for (const label of fig.elements.filter((element) => element.id.startsWith('a-label'))) {
      assert.ok(!overlaps(glyphBounds(label), head, 0), `${label.id} clear of the head`)
    }
    fig.arrow({ id: 'bus', from: [40, 200], to: [400, 200], heads: 'none' })
    const tap = fig.arrow({ id: 'tap', from: { on: 'bus', x: 120 }, to: [120, 140] })
    assert.deepEqual([tap.x, tap.y], [120, 200])
    assert.ok(fig.get('tap-joint0'))
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
  })
})

test('data glyphs: tokens with patches, frames on a time axis, masks, features, attention, loss', async () => {
  await withFigure(async (file, project) => {
    const fig = await openFigure(file)
    fig.style('neutral', { accent: 'blue' })
    const strip = fig.tokens({
      id: 'seq',
      x: 20,
      y: 300,
      items: ['A', 'cat', '<BOI>', { image: 'cat', view: { x: 0, y: 0, w: 0.5, h: 0.5 } }, '<EOI>'],
      groups: [{ from: 3, to: 3, color: 'loss' }]
    })
    assert.deepEqual(
      strip.cells.map((cell) => cell.id),
      ['seq-0', 'seq-1', 'seq-2', 'seq-3', 'seq-4']
    )
    assert.equal(fig.get('seq-3').type, 'image')
    fig.frames({ id: 'clip', x: 300, y: 40, kind: 'cat', count: 3 })
    assert.equal(fig.elements.filter((element) => /^clip-f\d$/.test(element.id)).length, 3)
    assert.ok(fig.get('clip-time'))
    fig.patches({ id: 'masked', x: 420, y: 40, kind: 'landscape', rows: 4, cols: 4, masked: 0.5 })
    assert.equal(fig.elements.filter((element) => /^masked-r\dc\d$/.test(element.id)).length, 8)
    fig.features({ id: 'feat', x: 520, y: 40, rows: 3, cols: 4 })
    const shades = new Set(
      fig.elements
        .filter((element) => element.id.startsWith('feat-r'))
        .map((element) => element.backgroundColor)
    )
    assert.ok(shades.size > 3)
    fig.attention({
      id: 'att',
      x: 620,
      y: 40,
      groups: [
        { label: 'text', n: 2 },
        { label: 'image', n: 2, full: true }
      ]
    })
    const on = fig.elements.filter(
      (element) => element.id.startsWith('att-r') && element.backgroundColor !== '#ffffff'
    )
    assert.equal(on.length, 1 + 2 + 4 + 4, 'causal rows plus the image block both ways')
    fig.box({ id: 'pred', label: 'predictor', x: 40, y: 150 })
    fig.box({ id: 'tgt', label: 'target', x: 200, y: 150 })
    const loss = fig.loss({ id: 'l1', label: 'L_1', x: 120, y: 230, compare: ['pred', 'tgt'] })
    assert.equal(loss.customData.asterRole, 'loss')
    assert.equal(fig.get('l1-in1').strokeColor, '#333333', 'ink links, as papers draw them')
    assert.equal(fig.get('l1-in1').strokeStyle, 'solid')
    fig.frozen('tgt')
    assert.equal(fig.get('tgt-frozen').customData.asterIcon, 'snowflake')
    await mkdir(path.join(project, 'data'), { recursive: true })
    await writeFile(
      path.join(project, 'data/sample.png'),
      encodePng(8, 4, new Uint8Array(96).fill(90))
    )
    const sample = await fig.image({ id: 'sample', src: 'data/sample.png', x: 700, y: 280, w: 40 })
    assert.equal(sample.height, 20, 'a project image keeps its aspect')
    assert.ok(sample.fileId.startsWith('aster-src-'))
    await fig.photo({ id: 'pic', x: 600, y: 280, w: 60, h: 40 })
    assert.equal(fig.get('pic').type, 'image', 'a thumbnail, not a crossed-out box')
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
    assert.ok(!codes(report).includes('loss-color'), JSON.stringify(report.warnings))
    assert.ok(!codes(report).includes('legend'), 'a token strip is not a legend')
    const saved = JSON.parse(await readFile(file, 'utf8'))
    const generated = Object.keys(saved.files).filter((id) => /^aster-(pic|photo)-/.test(id))
    assert.ok(generated.includes('aster-photo-cat'), 'a CC0 photo, not a drawing')
    assert.ok(generated.length >= 2)
    const used = new Set(
      saved.elements.filter((element) => element.type === 'image').map((element) => element.fileId)
    )
    assert.ok(
      generated.every((id) => used.has(id)),
      'no orphan pictures'
    )
  })
})

test('the PNG encoder writes a valid RGB image', () => {
  const pixels = new Uint8Array(4 * 3 * 3).fill(200)
  const png = encodePng(4, 3, pixels)
  assert.deepEqual([...png.subarray(1, 4)].map((code) => String.fromCharCode(code)).join(''), 'PNG')
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [4, 3])
  const idat = png.indexOf('IDAT')
  const length = png.readUInt32BE(idat - 4)
  assert.equal(inflateSync(png.subarray(idat + 4, idat + 4 + length)).length, (4 * 3 + 1) * 3)
})

test('layout lint: labels on heads, arrows through boxes, text across a trapezoid slope', () => {
  const scene = newFigureScene({ widthIn: 3.25, heightIn: 2 })
  const arrow = makeArrow({ id: 'a', from: [20, 100], to: [200, 100], headSize: 0 }, () => null)
  const [label] = makeMath({ id: 'm', tex: 'x', x: 190, y: 92 }).elements
  const wall = makeBox({ id: 'wall', label: 'block', x: 90, y: 80, w: 40, h: 40, exact: true })
  const trapezoid = makeTrapezoid({
    id: 'vae',
    side: 'top',
    ratio: 0.3,
    label: 'VAE encoder',
    x: 240,
    y: 40,
    w: 130,
    h: 40
  })
  scene.elements.push(arrow, label, ...wall, ...trapezoid)
  const found = lintFigureScene(scene).warnings.map((warning) => `${warning.code}:${warning.id}`)
  assert.ok(found.includes('label-on-head:m-0'), found.join(' '))
  assert.ok(found.includes('arrow-through:a'), found.join(' '))
  assert.ok(
    found.some((entry) => entry.startsWith('text-outside-shape:vae-label')),
    found.join(' ')
  )
  const grid = buildFigurePart('grid', {
    id: 'g',
    rows: 1,
    cols: 3,
    fills: [['accent', 'block', 'loss']]
  })
  assert.equal(grid.find((element) => element.id === 'g-r0c2').backgroundColor, '#ffffff')
})
