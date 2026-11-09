import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { TEXT_BASELINE, openFigure } from './research-figures-kit.mjs'
import { absolutePoints } from './research-figures-labels.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { texParts } from './research-figures-type.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 3 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-core-')))
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

const under = (fig, id) =>
  fig.elements.filter((element) => element.customData?.asterKit === id && !element.isDeleted)
const kinds = (elements) => elements.map((element) => element.type).toSorted()

test('labels mix words and $…$ math; plain words in a TeX label print in the paper font', async () => {
  assert.deepEqual(texParts('softmax'), ['softmax'])
  assert.deepEqual(texParts('KL'), ['KL'], 'an acronym')
  assert.deepEqual(texParts('sg'), [{ tex: 'sg' }], 'two small letters are a symbol')
  assert.deepEqual(texParts('x_t'), [{ tex: 'x_t' }])
  assert.deepEqual(texParts('score $r_t$'), ['score ', { tex: 'r_t' }])
  assert.deepEqual(texParts('r_t \\text{ reward}'), [{ tex: 'r_t ' }, ' reward'])
  assert.deepEqual(texParts('\\mathcal{L}_{\\text{MSE}}'), [{ tex: '\\mathcal{L}_{\\text{MSE}}' }])
  assert.deepEqual(texParts('\\mathcal{L}_\\text{MSE}'), [{ tex: '\\mathcal{L}_\\text{MSE}' }])
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'a', label: 'policy', x: 40, y: 40 })
    fig.box({ id: 'b', label: 'reward model', x: 400, y: 40 })
    fig.box({ id: 'c', label: 'critic', x: 40, y: 200 })
    fig.arrow({ id: 'mixed', from: 'a', to: 'b', label: 'score $r_t$' })
    assert.deepEqual(kinds(under(fig, 'mixed').filter((e) => e.id.startsWith('mixed-label'))), [
      'image',
      'text'
    ])
    const words = under(fig, 'mixed').find((element) => element.type === 'text')
    assert.equal(words.text, 'score ')
    fig.arrow({ id: 'word', from: 'a', to: 'c', label: 'softmax' })
    const label = under(fig, 'word').filter((element) => element.id.startsWith('word-label'))
    assert.deepEqual(kinds(label), ['text'])
    assert.equal(label[0].fontFamily, fig.get('a-label').fontFamily)
    // A box label with $…$ math is free text with a typeset run in it.
    const box = fig.box({ id: 'enc', label: 'Encoder $E_\\theta$', x: 40, y: 320 })
    assert.deepEqual(kinds(under(fig, 'enc').filter((e) => e !== box)), ['image', 'text'])
    // labelText still prints exactly as written, dollar signs too.
    fig.arrow({ id: 'cost', from: 'b', to: 'c', labelText: '$5 and $6' })
    assert.ok(under(fig, 'cost').some((element) => element.text === '$5 and $6'))
  })
})

test('text runs keep cx and baseline, measure() sizes runs, and ⋮ is typeset', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const drawn = fig.text({ id: 't', runs: ['score ', { tex: 'r_t' }], cx: 300, baseline: 100 })
    const words = drawn.elements.find((element) => element.type === 'text')
    assert.ok(Math.abs(words.y + TEXT_BASELINE * 16 - 100) < 0.5, 'first baseline at 100')
    const right = Math.max(...drawn.elements.map((element) => element.x + element.width))
    assert.ok(Math.abs((words.x + right) / 2 - 300) < 1, 'centred on cx')
    const size = fig.measure('text', { runs: ['score ', { tex: 'r_t' }] })
    assert.ok(Math.abs(size.width - (right - words.x)) < 1, `measured ${size.width}`)
    assert.ok(fig.measure('text', { text: 'score $r_t$' }).width > 40)
    fig.text({ id: 'dots', text: '⋮', x: 200, y: 200 })
    assert.equal(under(fig, 'dots')[0].type, 'image')
    const report = await fig.save({ dryRun: true })
    assert.ok(!report.errors.some((entry) => entry.code === 'missing-glyph'))
  })
})

test('move finds a part drawn inside another item, and says so when nothing is there', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.frames({ id: 'y', x: 60, y: 40, count: 4, layout: 'row' })
    const before = fig.bounds('y-t3')
    fig.move('y-t3', 10, 0)
    assert.equal(fig.bounds('y-t3').x, before.x + 10)
    assert.throws(() => fig.move('nothing-here', 4, 0), /nothing is drawn under nothing-here/)
  })
})

test('box labels with runs or math follow labelValign and labelAlign; math can sit inline', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({
      id: 'mem',
      label: 'Memory',
      math: 'M_t',
      labelValign: 'top',
      x: 40,
      y: 40,
      w: 160,
      h: 120
    })
    const label = fig.bounds('mem-label')
    assert.ok(label.y < 40 + 12, `label top at ${label.y}`)
    assert.ok(
      under(fig, 'mem').some((element) => element.type === 'image'),
      'math line kept'
    )
    fig.box({
      id: 'run',
      label: ['Actor ', { tex: '\\pi' }],
      labelAlign: 'left',
      x: 240,
      y: 40,
      w: 160
    })
    assert.ok(fig.bounds('run-label').x < 240 + 10)
    const inline = fig.box({
      id: 'one',
      label: 'Encoder',
      math: 'E_\\theta',
      inline: true,
      x: 40,
      y: 200
    })
    const two = fig.box({ id: 'two', label: 'Encoder', math: 'E_\\theta', x: 240, y: 200 })
    assert.ok(inline.height < two.height, `${inline.height} < ${two.height}`)
    assert.ok(inline.height <= 48)
  })
})

test('junctions use the drawn path: fractions by length, points on a head move to its base', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'top', label: 'out', x: 200, y: 40, w: 120, h: 32 })
    fig.box({ id: 'side', label: 'side', x: 420, y: 120, w: 80, h: 32 })
    const line = fig.arrow({ id: 'in', from: [260, 300], to: 'top' })
    const path = absolutePoints(line)
    const [start, tip] = [path[0][1], path.at(-1)[1]]
    fig.arrow({ id: 'f', from: { on: 'in', at: 0.5 }, to: 'side' })
    const dot = fig.get('f-joint0')
    assert.ok(Math.abs(dot.y + 3 - (start + tip) / 2) < 0.5, 'half of the drawn length')
    // A y on the arrowhead lands on the head's base, not an error.
    fig.arrow({ id: 'g', from: { on: 'in', y: tip + 4 }, to: 'side' })
    const base = fig.get('g-joint0').y + 3
    assert.ok(base > tip + 10 && base < tip + 20, `dot at ${base}, tip ${tip}`)
    assert.throws(
      () => fig.arrow({ id: 'h', from: { on: 'in', y: 900 }, to: 'side' }),
      /does not reach y 900: it spans y \d+–300/
    )
  })
})

test('junction dots take their line colour, in fork and merge too', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'a', label: 'a', x: 40, y: 40 })
    fig.box({ id: 'b', label: 'b', x: 300, y: 40 })
    fig.box({ id: 'c', label: 'c', x: 300, y: 200 })
    fig.box({ id: 'd', label: 'd', x: 40, y: 200 })
    const red = fig.arrow({ id: 'r', from: 'a', to: 'b', color: 'red' })
    fig.arrow({ id: 'j', from: { on: 'r', at: 'mid' }, to: 'c', color: 'red' })
    assert.equal(fig.get('j-joint0').backgroundColor, red.strokeColor)
    const fork = fig.fork({ id: 'k', from: 'd', to: ['b', 'c'], color: 'accent-ink' })
    assert.equal(fork.dot.backgroundColor, fork.trunk.strokeColor)
    assert.notEqual(fork.dot.backgroundColor, fig.palette().line)
  })
})

test('token cells, strip names and glyph labels take words with $…$ math too', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const strip = fig.tokens({
      id: 's',
      x: 160,
      y: 40,
      label: 'tokens $z_t$',
      items: ['score $r_t$', 'cat']
    })
    const cell = fig.elements.filter((element) => element.id.startsWith('s-0-label'))
    assert.deepEqual(kinds(cell), ['image', 'text'])
    assert.ok(!cell.some((element) => element.text?.includes('$')))
    const ink = fig.bounds('s-0-label')
    assert.ok(ink.width <= strip.cells[0].w - 8, 'the cell fits its words and math')
    assert.ok(
      fig.elements.some((element) => element.id.startsWith('s-name') && element.type === 'image')
    )
    fig.distribution({
      id: 'p',
      x: 400,
      y: 40,
      values: [1, 2],
      label: ['teacher ', { tex: 'P_t' }]
    })
    assert.deepEqual(kinds(fig.elements.filter((element) => element.id.startsWith('p-label'))), [
      'image',
      'text'
    ])
  })
})
