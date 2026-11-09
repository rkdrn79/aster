import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { makeArrow, makeBox, openFigure } from './research-figures-kit.mjs'
import { KIT_REFERENCE } from './research-figures-kit-reference.mjs'
import { kitIndexText, kitReferenceText } from './research-figures-kit-index.mjs'
import { headBox } from './research-figures-labels.mjs'
import { lintFigureScene } from './research-figures-lint.mjs'
import { figureElement, newFigureScene } from './research-figures-model.mjs'
import { overlaps } from './research-figures-geometry.mjs'
import { glyphBounds } from './research-figures-text.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 3 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r5-')))
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

const codes = (report) => report.warnings.map((warning) => warning.code)

test('a loss groups what it compares: one box per set, one link each', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(pathToFileURL(file))
    for (const [index, x] of [40, 120, 200].entries()) {
      fig.features({ id: `zh${index}`, x, y: 30, rows: 3, cols: 4 })
      fig.features({ id: `z${index}`, x, y: 200, rows: 3, cols: 4 })
    }
    fig.loss({
      id: 'l1',
      label: 'L_1',
      x: 400,
      y: 110,
      compare: [
        ['zh0', 'zh1', 'zh2'],
        ['z0', 'z1', 'z2']
      ]
    })
    const sets = fig.elements.filter((element) => element.id.startsWith('l1-set'))
    assert.equal(sets.length, 2)
    assert.ok(
      sets.every((set) => set.strokeColor === '#333333' && set.customData.asterRole === 'compared')
    )
    assert.deepEqual(
      ['l1-in1', 'l1-in2'].map((id) => fig.get(id).startBinding.elementId),
      ['l1-set1', 'l1-set2']
    )
    const ring = fig.compared(['zh0', 'z0'], { group: true, id: 'pair', tone: 'red' })
    assert.equal(ring.strokeColor, '#ba2c25', 'red when asked')
    fig.compared(['zh1'])
    assert.equal(fig.get('zh1').customData.asterRole, 'compared')
    fig.highlight(['zh2', 'z2'], { cell: [1, 2] })
    const spot = fig.get('zh2-highlight-1')
    // Why 12: features cells default to 12 units (24 px at print).
    assert.deepEqual([spot.x, spot.y, spot.width], [200 + 2 * 12, 30 + 12, 12])
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
    assert.ok(!codes(report).includes('loss-color'), JSON.stringify(report.warnings))
    assert.ok(!codes(report).includes('legend'), 'feature cells are not a legend')
  })
})

test('glyphs and badges default to neutral; the flame is not a hue', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('neutral', { accent: 'blue' })
    fig.features({ id: 'f', x: 20, y: 20 })
    const cells = fig.elements.filter((element) => element.id.startsWith('f-r'))
    assert.ok(
      cells.every((cell) => /^#([0-9a-f]{2})\1\1$/.test(cell.backgroundColor)),
      'grays'
    )
    fig.attention({ id: 'att', x: 200, y: 40, groups: [{ label: 't', n: 2 }] })
    assert.equal(fig.get('att-r1c0').backgroundColor, '#333333')
    fig.box({ id: 'enc', label: 'encoder', x: 300, y: 40, color: 'accent' })
    fig.box({ id: 'tgt', label: 'target', x: 300, y: 120 })
    fig.trainable('enc')
    fig.frozen('tgt')
    assert.equal(fig.get('tgt-frozen').customData.asterIcon, 'snowflake')
    assert.equal(fig.get('enc-trainable').customData.asterIcon, 'fire')
    fig.loss({ id: 'loss', label: 'L', x: 420, y: 80, compare: ['tgt'] })
    assert.ok(!codes(await fig.save()).includes('hue-count'))
  })
})

test('two text sizes, and the lint flags oversized boxes, empty corners, short dashes', async () => {
  await withFigure(
    async (file) => {
      const fig = await openFigure(file)
      const enc = fig.box({
        id: 'enc',
        label: 'encoder',
        x: 12,
        y: 12,
        w: 300,
        h: 150,
        exact: true
      })
      assert.equal(fig.get('enc-label').fontSize, 16, 'two sizes: 8 pt labels')
      fig.tokens({ id: 't', x: 12, y: 200, items: ['a'] })
      assert.equal(fig.get('t-0-label').fontSize, 14, 'and 7 pt tokens')
      fig.arrow({ id: 'short', from: [330, 60], to: [360, 60], dashed: true, headSize: 0 })
      const report = await fig.save()
      assert.ok(codes(report).includes('empty-box'), JSON.stringify(report.warnings))
      assert.ok(codes(report).includes('short-dash'))
      assert.ok(codes(report).includes('empty-region'))
      assert.ok(enc)
    },
    { widthIn: 3.25, heightIn: 2 }
  )
  const wide = newFigureScene({ widthIn: 6.75, heightIn: 2 })
  wide.elements.push(...makeBox({ id: 'b', label: 'block', x: 20, y: 20 }))
  assert.equal(wide.elements.find((element) => element.id === 'b-label').fontSize, 16)
})

test('panels, rows, columns and alignment; mid junctions; stop-grad and plain labels', async () => {
  await withFigure(
    async (file) => {
      const fig = await openFigure(file)
      for (const id of ['a', 'b', 'c']) {
        fig.box({ id, label: id.toUpperCase(), x: 300, y: 300 })
      }
      fig.row(['a', 'b', 'c'], { x: 40, cy: 100, gap: 20 })
      const [a, b, c] = ['a', 'b', 'c'].map((id) => fig.bounds(id))
      assert.equal(b.x, a.right + 20)
      assert.equal(c.y + c.height / 2, 100)
      assert.equal(fig.get('a-label').x > a.x, true, 'labels move with their boxes')
      fig.column(['a', 'b'], { y: 20, cx: 500, gap: 10 })
      assert.equal(fig.bounds('b').y, fig.bounds('a').bottom + 10)
      fig.align(['c', 'a'], 'top')
      assert.equal(fig.bounds('a').y, fig.bounds('c').y)
      const panel = fig.panel({ id: 'block', around: ['a', 'b'], title: 'DiT block ×N' })
      assert.ok(
        fig.elements.indexOf(panel) < fig.elements.indexOf(fig.get('a')),
        'behind its items'
      )
      assert.equal(fig.get('block-title-0').text, 'DiT block ×N')
      fig.arrow({ id: 'bus', from: [40, 260], to: [400, 260] })
      const tap = fig.arrow({ id: 'tap', from: { on: 'bus', at: 'mid' }, to: [220, 330] })
      assert.ok(
        !overlaps({ x: tap.x - 1, y: tap.y - 1, width: 2, height: 2 }, headBox(fig.get('bus')), 0)
      )
      fig.arrow({ id: 'sgline', from: [40, 380], to: [300, 380] })
      fig.stopGrad('sgline', { label: 'sg' })
      const label = glyphBounds(fig.get('sgline-stopgrad-label-0'))
      assert.ok(label.y + label.height < 380 - 4, 'above the line, clear of the slashes')
      fig.arrow({ id: 'plain', from: [40, 420], to: [300, 420], labelText: 'x_t as written' })
      assert.equal(fig.get('plain-label-0').text, 'x_t as written')
    },
    { widthIn: 6.75, heightIn: 3.5 }
  )
})

test('tokens take TeX and their own heights; frames line up with given positions', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const strip = fig.tokens({
      id: 'seq',
      x: 80,
      y: 40,
      h: 40,
      label: 'tokens',
      items: [{ tex: 'z_0' }, { text: 'a', h: 20 }]
    })
    assert.equal(fig.get('seq-0-label-0').customData.asterMath, 'z_0')
    assert.deepEqual([strip.cells[1].y, strip.cells[1].h], [50, 20])
    assert.ok(fig.get('seq-name'))
    const clip = fig.frames({ id: 'clip', x: 0, y: 120, w: 40, h: 30, positions: [80, 200, 320] })
    assert.deepEqual(
      ['clip-f0', 'clip-f1', 'clip-f2'].map((id) => fig.get(id).x),
      [80, 200, 320]
    )
    assert.equal(clip.width, 280)
    assert.equal(fig.get('clip-t0-0').customData.asterMath, 't_0')
  })
})

test('the kit reference lists every kit function', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const documented = new Set(KIT_REFERENCE.map((entry) => entry.name))
    const methods = Object.entries(fig)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name)
    assert.deepEqual(
      methods.filter((name) => !documented.has(name)),
      []
    )
    assert.match(kitReferenceText('tokens'), /items/)
  })
})

test('figures kit prints a short index; names, topics and --all print the detail', async () => {
  const index = kitIndexText()
  assert.ok(index.length < 9000, `the index is ${index.length} characters`)
  for (const entry of KIT_REFERENCE) {
    assert.match(index, new RegExp(`^  ${entry.name} `, 'm'))
  }
  const both = kitReferenceText('fig.box, arrow')
  assert.match(both, /^fig\.box\(/m)
  assert.match(both, /^fig\.arrow\(/m)
  assert.throws(() => kitReferenceText('boxx,arrow'), /No kit topic or function "boxx"/)
  const { spawnSync } = await import('node:child_process')
  const kit = (...args) =>
    spawnSync(
      process.execPath,
      [path.join(import.meta.dirname, 'cli.mjs'), 'figures', 'kit', ...args],
      {
        encoding: 'utf8'
      }
    ).stdout
  assert.equal(kit().trim(), index)
  assert.equal(kit('--all').trim(), kitReferenceText())
  assert.ok(kitReferenceText().length > index.length * 3)
})

test('the layout lint still accepts a plain arrow between two boxes', () => {
  const scene = newFigureScene({ widthIn: 3.25, heightIn: 1 })
  scene.elements.push(figureElement('rectangle', { id: 'r', x: 20, y: 20, width: 40, height: 30 }))
  scene.elements.push(makeArrow({ id: 'a', from: [70, 35], to: [200, 35] }, () => null))
  assert.deepEqual(lintFigureScene(scene).errors, [])
})
