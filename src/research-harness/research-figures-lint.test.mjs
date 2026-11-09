import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { makeArrow, makeBox, openFigure } from './research-figures-kit.mjs'
import { lintFigureScene } from './research-figures-lint.mjs'
import {
  DOUBLE_COLUMN_MAX_HEIGHT_IN,
  FIGURE_SIZES,
  figureElement,
  figurePage,
  newFigureScene
} from './research-figures-model.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2.6 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-lint-')))
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

const findings = (report) => [...report.errors, ...report.warnings, ...(report.notes ?? [])]
const codes = (report) => findings(report).map((entry) => entry.code)
const of = (report, code) => findings(report).filter((entry) => entry.code === code)

function scene(size, ...elements) {
  const built = newFigureScene(size)
  built.elements.push(...elements.flat())
  return built
}

const rect = (id, x, y, width, height, extra = {}) =>
  figureElement('rectangle', {
    id,
    x,
    y,
    width,
    height,
    strokeColor: 'transparent',
    backgroundColor: '#e9e9e9',
    ...extra
  })

test('intentional items and fig.allow turn a rule off where it is meant', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'W', label: 'W', x: 40, y: 40, w: 160, h: 160, exact: true })
    fig.box({ id: 'B', label: 'B', x: 240, y: 40, w: 160, h: 160, exact: true })
    assert.ok(codes(await fig.save()).includes('empty-box'), 'a big box round a short label')
    fig.allow('empty-box', ['W'])
    fig.remove('B')
    fig.box({ id: 'B2', label: 'B', x: 240, y: 40, w: 160, h: 160, exact: true, intentional: true })
    assert.deepEqual(of(await fig.save(), 'empty-box'), [], 'allowed and intentional')
    assert.ok(codes(await fig.save()).includes('empty-region'))
    fig.allow('empty-region', { x: 400, y: 0, w: 572, h: 374 })
    fig.allow('empty-region', { x: 0, y: 200, w: 400, h: 174 })
    assert.ok(!codes(await fig.save()).includes('empty-region'), 'a gap left on purpose')
    fig.allow('page-fill')
    assert.ok(!codes(await fig.save()).includes('page-fill'), 'off for the whole figure')
    const rerun = await openFigure(file)
    rerun.reset()
    rerun.box({ id: 'W', label: 'W', x: 40, y: 40, w: 160, h: 160, exact: true })
    const again = await rerun.save()
    assert.ok(codes(again).includes('page-fill'), 'a redraw states its allowances again')
    assert.ok(codes(again).includes('empty-box'))
    assert.throws(() => rerun.allow('empty-box', ['nothing']), /No element nothing/)
  })
})

test('a page someone else set is filled, not resized; one the agent set may be resized', async () => {
  const tall = scene(
    { widthIn: 6.75, heightIn: 3.6 },
    rect('a', 12, 12, 948, 494),
    rect('m', 4, 200, 60, 40)
  )
  const given = lintFigureScene(tall)
  assert.deepEqual(of(given, 'tall-figure'), [], 'a filled page someone set raises no size')
  const sparseTall = lintFigureScene(
    scene({ widthIn: 6.75, heightIn: 3.6 }, rect('a', 12, 12, 948, 300))
  )
  const note = of(sparseTall, 'tall-figure')[0]
  assert.ok(sparseTall.notes.includes(note), 'a note, not a warning')
  assert.match(note.message, /leaves much of it empty/)
  assert.match(note.message, /once in your reply \(keep the size\)/)
  const margin = of(given, 'margin')[0]
  assert.match(margin.message, /m \(left\)/, 'the margin warning names the edge')
  assert.match(margin.message, /left edge/)
  tall.elements[0].customData.asterPage.agentSize = { widthIn: 6.75, heightIn: 3.6 }
  const sized = lintFigureScene(tall)
  assert.ok(sized.warnings.some((entry) => entry.code === 'tall-figure'))
  const sparse = scene({ widthIn: 6.75, heightIn: 2.6 }, rect('only', 20, 20, 900, 60))
  const fill = of(lintFigureScene(sparse), 'page-fill')[0]
  assert.match(fill.message, /keep its size/)
  assert.doesNotMatch(fill.message, /setPage/)
  assert.doesNotMatch(of(lintFigureScene(sparse), 'empty-region')[0].message, /shrink the page/)
})

test('one finding for a label over a glyph, not one per cell', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.tokens({ id: 'seq', x: 40, y: 100, items: ['a', 'b', 'c', 'd', 'e', 'f'] })
    fig.text({ id: 'over', text: 'a label across the strip', x: 20, y: 96, size: 16 })
    const crossed = of(await fig.save(), 'text-over-shape')
    assert.equal(crossed.length, 1, JSON.stringify(crossed))
    assert.match(crossed[0].message, /shapes of seq/)
  })
})

test('near-miss alignment leaves anchors, panels, stacked frames and unrelated items alone', () => {
  const row = (extra) =>
    lintFigureScene(
      scene(
        { widthIn: 6.75, heightIn: 2.6 },
        rect('a', 40, 100, 80, 40),
        rect('b', 160, 100, 80, 40),
        ...extra
      )
    )
  const slip = row([rect('c', 280, 103, 80, 40)])
  assert.ok(codes(slip).includes('near-miss-align'), 'a box 3 units off its row')
  const anchor = row([
    rect('c', 280, 100, 80, 40),
    rect('anchor', 400, 103, 40, 40, { backgroundColor: 'transparent' })
  ])
  assert.ok(!codes(anchor).includes('near-miss-align'), 'an invisible anchor is not a box')
  const panel = row([
    rect('c', 280, 100, 80, 40),
    rect('p', 400, 96, 160, 47, { customData: { asterPanel: true } }),
    rect('in', 420, 100, 40, 40)
  ])
  assert.ok(!codes(panel).includes('near-miss-align'), 'a panel is not a member of the row')
  const unrelated = lintFigureScene(
    scene(
      { widthIn: 6.75, heightIn: 2.6 },
      rect('a', 40, 100, 80, 40),
      rect('b', 300, 103, 80, 40),
      rect('far', 40, 260, 80, 40)
    )
  )
  assert.ok(!codes(unrelated).includes('near-miss-align'), 'two boxes merely near each other')
  // Stacked frames: the front frame lines up with its neighbour even when the outline does not.
  const stack = [
    rect('clip', 200, 92, 76, 58, { backgroundColor: 'transparent' }),
    rect('clip-edge1', 210, 100, 56, 42, {
      backgroundColor: 'transparent',
      strokeColor: '#ffffff',
      customData: { asterKit: 'clip' }
    }),
    rect('clip-edge0', 200, 108, 56, 42, {
      backgroundColor: '#cccccc',
      customData: { asterKit: 'clip' }
    })
  ]
  const frames = lintFigureScene(
    scene(
      { widthIn: 6.75, heightIn: 2.6 },
      rect('a', 40, 108, 80, 42),
      rect('b', 120 + 24, 108, 40, 42),
      ...stack
    )
  )
  assert.ok(
    !codes(frames).includes('near-miss-align'),
    JSON.stringify(of(frames, 'near-miss-align'))
  )
})

test('content sticking a little out of its card is still compared inside the card', () => {
  const report = lintFigureScene(
    scene(
      { widthIn: 6.75, heightIn: 2.6 },
      rect('card', 40, 40, 200, 100, { backgroundColor: '#f4f4f4' }),
      rect('in1', 50, 80, 60, 30),
      rect('in2', 130, 80, 116, 30),
      rect('out', 300, 83, 60, 30),
      rect('out2', 400, 83, 60, 30)
    )
  )
  assert.ok(
    !of(report, 'near-miss-align').some((entry) => ['in1', 'in2'].includes(entry.id)),
    JSON.stringify(of(report, 'near-miss-align'))
  )
  assert.ok(codes(report).includes('overflow'), 'and it is named as sticking out')
})

test('a deliberate gap next to an intentional item is not uneven spacing', () => {
  const items = (intentional) =>
    scene(
      { widthIn: 6.75, heightIn: 2.6 },
      rect('a', 40, 100, 60, 40),
      rect('b', 120, 100, 60, 40),
      rect('c', 207, 100, 60, 40, intentional ? { customData: { asterIntentional: true } } : {})
    )
  assert.ok(codes(lintFigureScene(items(false))).includes('uneven-spacing'))
  assert.ok(!codes(lintFigureScene(items(true))).includes('uneven-spacing'))
})

test('panels: content overflowing them, lines along their border, rows touching it', () => {
  const panel = rect('p', 40, 40, 300, 160, {
    backgroundColor: '#f4f4f4',
    customData: { asterPanel: true }
  })
  const report = lintFigureScene(
    scene(
      { widthIn: 6.75, heightIn: 2.6 },
      panel,
      rect('spill', 280, 80, 100, 40),
      rect('tight', 60, 158, 80, 40),
      rect('fine', 160, 100, 80, 40),
      makeArrow({ id: 'hug', from: [60, 41], to: [300, 41] }, () => null)
    )
  )
  assert.deepEqual(
    of(report, 'overflow').map((entry) => entry.id),
    ['spill']
  )
  assert.deepEqual(
    of(report, 'panel-tight').map((entry) => entry.id),
    ['tight']
  )
  assert.deepEqual(
    of(report, 'hug-border').map((entry) => entry.id),
    ['hug']
  )
})

test('labels over badges, lines over titles, and the style’s text sizes', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'enc', label: 'encoder', x: 40, y: 60, w: 120, h: 48, exact: true })
    fig.trainable('enc')
    const badge = fig.bounds('enc-trainable')
    fig.text({ id: 'note', text: 'trained', x: badge.x - 4, y: badge.y, size: 14 })
    fig.text({ id: 'title', text: 'Stage one', x: 300, y: 60, size: 16 })
    fig.polyline({
      id: 'skip',
      points: [
        [280, 70],
        [420, 70]
      ]
    })
    fig.text({ id: 'odd', text: 'big', x: 500, y: 200, size: 18 })
    const report = await fig.save()
    assert.deepEqual(
      of(report, 'label-on-badge').map((entry) => entry.id),
      ['note']
    )
    assert.deepEqual(
      of(report, 'line-over-text').map((entry) => entry.id),
      ['skip']
    )
    assert.match(of(report, 'text-size')[0].message, /size 18/)
    const illustrative = await openFigure(file)
    illustrative.style('illustrative')
    illustrative.text({ id: 'odd', text: 'Title', x: 500, y: 200, size: 22 })
    illustrative.remove('title', 'note')
    assert.ok(
      !codes(await illustrative.save()).includes('text-size'),
      'the illustrative title size'
    )
  })
})

test('dashed links: crossing solid arrows, running long, small dashed boxes, loss frames', () => {
  const solid = [0, 1, 2].map((index) =>
    makeArrow(
      { id: `up${index}`, from: [100 + index * 60, 200], to: [100 + index * 60, 120] },
      () => null
    )
  )
  const dashed = makeArrow(
    { id: 'link', from: [60, 160], to: [600, 160], dashed: true, role: 'aux' },
    () => null
  )
  const report = lintFigureScene(
    scene(
      { widthIn: 6.75, heightIn: 2.6 },
      ...solid,
      dashed,
      rect('blank', 700, 40, 22, 28, {
        strokeStyle: 'dashed',
        strokeColor: '#333333',
        backgroundColor: 'transparent'
      }),
      rect('ring1', 700, 120, 60, 40, {
        backgroundColor: 'transparent',
        strokeColor: '#333333',
        customData: { asterRole: 'compared' }
      }),
      rect('ring2', 740, 130, 60, 40, {
        backgroundColor: 'transparent',
        strokeColor: '#333333',
        customData: { asterRole: 'compared' }
      })
    )
  )
  assert.match(of(report, 'dashed-crossing')[0].message, /crosses 3 solid arrows/)
  assert.deepEqual(
    of(report, 'long-dash').map((entry) => entry.id),
    ['link']
  )
  assert.deepEqual(
    of(report, 'small-dash-box').map((entry) => entry.id),
    ['blank']
  )
  assert.deepEqual(
    of(report, 'loss-overlap').map((entry) => entry.id),
    ['ring1']
  )
})

test('print size: a page wider than the column shrinks its text; thumbnails stay readable', async () => {
  const wide = scene(
    { widthIn: 9, heightIn: 3 },
    figureElement('text', {
      id: 't',
      x: 40,
      y: 40,
      width: 60,
      height: 20,
      text: 'label',
      fontSize: 16
    })
  )
  assert.match(of(lintFigureScene(wide), 'small-text')[0].message, /shrunk to the column/)
  const fits = scene(
    { widthIn: 6.75, heightIn: 3 },
    figureElement('text', {
      id: 't',
      x: 40,
      y: 40,
      width: 60,
      height: 20,
      text: 'label',
      fontSize: 16
    })
  )
  assert.ok(!codes(lintFigureScene(fits)).includes('small-text'))
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    await fig.image({ id: 'tiny', kind: 'cat', x: 40, y: 40, w: 32, h: 32 })
    await fig.image({ id: 'big', kind: 'dog', x: 120, y: 40, w: 96, h: 96 })
    assert.deepEqual(
      of(await fig.save(), 'small-thumbnail').map((entry) => entry.id),
      ['tiny']
    )
  })
})

test('a box with its label stays clear of the new rules', () => {
  const report = lintFigureScene(
    scene(
      { widthIn: 3.25, heightIn: 1 },
      ...makeBox({ id: 'enc', label: 'encoder', x: 40, y: 40 }),
      ...makeBox({ id: 'dec', label: 'decoder', x: 200, y: 40 })
    )
  )
  for (const code of ['overflow', 'panel-tight', 'hug-border', 'label-on-badge', 'text-size']) {
    assert.ok(!codes(report).includes(code), code)
  }
})

test('thumbnails in a gallery or a card pass; a digit in its own step ring is one item', () => {
  const photo = (id, x, y, size = 34) =>
    figureElement('image', {
      id,
      x,
      y,
      width: size,
      height: size,
      fileId: 'f',
      customData: { asterPhoto: true }
    })
  const report = lintFigureScene(
    scene(
      { widthIn: 6.75, heightIn: 2.6 },
      photo('g1', 40, 40),
      photo('g2', 80, 40),
      rect('stage', 200, 30, 120, 80, { customData: { asterStage: true } }),
      photo('in-card', 210, 40),
      photo('lone', 400, 40),
      figureElement('ellipse', {
        id: 's1',
        x: 600,
        y: 40,
        width: 18,
        height: 18,
        backgroundColor: 'transparent',
        groupIds: ['s1-step'],
        customData: { asterStep: 1 }
      }),
      figureElement('text', {
        id: 's1-digit',
        x: 604,
        y: 38,
        width: 10,
        height: 22,
        text: '1',
        fontSize: 16,
        groupIds: ['s1-step']
      })
    )
  )
  assert.deepEqual(
    of(report, 'small-thumbnail').map((entry) => entry.id),
    ['lone']
  )
  assert.ok(!of(report, 'text-over-shape').some((entry) => entry.id === 's1-digit'))
})

test('the page records who sized it: fig.setPage is the agent, Aster or the person otherwise', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    assert.equal((await fig.setPage({ heightIn: 3 })).sizeBy, 'agent')
  })
  const given = newFigureScene({ widthIn: 6.75, heightIn: 2.5 })
  const page = given.elements[0]
  assert.equal(figurePage(given.elements).sizeBy, 'person')
  page.customData.asterPage.agentSize = { widthIn: 6.75, heightIn: 2.5 }
  assert.equal(figurePage(given.elements).sizeBy, 'agent')
  // Resized in Aster since: the person's size now.
  page.customData.asterPage.heightIn = 3
  assert.equal(figurePage(given.elements).sizeBy, 'person')
  assert.ok(FIGURE_SIZES.double.heightIn <= DOUBLE_COLUMN_MAX_HEIGHT_IN)
})

test('a legend names its swatches and can be allowed; steps with titles and data text pass', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'k1', x: 40, y: 40, w: 16, h: 16, exact: true, color: 'accent' })
    fig.text({ id: 'k1-name', text: 'trained', x: 64, y: 40, size: 14 })
    fig.box({ id: 'k2', x: 40, y: 72, w: 16, h: 16, exact: true, color: 'strong' })
    fig.text({ id: 'k2-name', text: 'frozen', x: 64, y: 72, size: 14 })
    const legend = of(await fig.save(), 'legend')[0]
    assert.equal(legend.id, 'k1')
    assert.match(legend.message, /k1, k2/)
    fig.allow('legend', ['k1', 'k2'])
    assert.deepEqual(of(await fig.save(), 'legend'), [])
    fig.remove('k1', 'k1-name', 'k2', 'k2-name')
    for (const n of [1, 2, 3]) {
      fig.step({ id: `s${n}`, n, cx: 60, cy: 40 + n * 40, size: 22 })
      fig.text({ id: `s${n}-title`, text: `Step ${n} title`, x: 80, y: 30 + n * 40, size: 16 })
    }
    const sentence = 'Q: Roger has five tennis balls and buys two more cans of three. How many now?'
    fig.card({ id: 'ex', x: 300, y: 40, w: 220, text: sentence })
    fig.bubble({ id: 'b', x: 560, y: 40, w: 220, text: sentence })
    fig.text({ id: 'free', text: sentence, x: 300, y: 260, size: 14 })
    const report = await fig.save()
    assert.deepEqual(of(report, 'legend'), [], 'step numbers with titles are not a legend')
    assert.deepEqual(
      of(report, 'prose').map((entry) => entry.id),
      ['free'],
      'card and bubble text is data'
    )
    fig.allow('prose', ['free'])
    assert.deepEqual(of(await fig.save(), 'prose'), [])
  })
})

test('empty stretches are found where they lie; branch gaps, corner nooks and arrow columns pass', () => {
  const size = { widthIn: 6.75, heightIn: 2.6 }
  const row = (y, ...xs) => xs.map((x, index) => rect(`r${y}-${index}`, x, y, 120, 48))
  // Two branches 96 apart: the gap between them is no hole.
  const branches = lintFigureScene(
    scene(
      size,
      row(16, 16, 176, 336, 496, 656, 836),
      row(160, 16, 176, 336, 496, 656, 836),
      row(310, 16, 176, 336, 496, 656, 836)
    )
  )
  assert.deepEqual(of(branches, 'empty-region'), [])
  // A hole in the middle row: boxed where it is.
  const hole = lintFigureScene(
    scene(
      size,
      row(16, 16, 176, 336, 496, 656, 836),
      row(160, 16, 176, 656, 836),
      row(310, 16, 176, 336, 496, 656, 836)
    )
  )
  const [region] = of(hole, 'empty-region')
  assert.ok(region, JSON.stringify(hole.warnings))
  assert.equal(region.regions.length, 1)
  const [box] = region.regions
  assert.ok(
    box.x >= 296 && box.x + box.width <= 656 && box.y >= 64 && box.y + box.height <= 310,
    JSON.stringify(box)
  )
  // The same hole crossed by arrows only (a residual column) is not empty.
  const arrows = [320, 400, 480, 560].map((x) =>
    figureElement('arrow', {
      id: `a${x}`,
      x,
      y: 64,
      width: 0,
      height: 246,
      points: [
        [0, 0],
        [0, 246]
      ]
    })
  )
  const crossed = lintFigureScene(
    scene(
      size,
      row(16, 16, 176, 336, 496, 656, 836),
      row(160, 16, 176, 656, 836),
      row(310, 16, 176, 336, 496, 656, 836),
      arrows
    )
  )
  assert.deepEqual(of(crossed, 'empty-region'), [])
  // A nook left open in a page corner is no hole either.
  const nook = lintFigureScene(
    scene(
      size,
      row(16, 16, 176, 336, 496, 656),
      row(160, 16, 176, 336, 496, 656, 836),
      row(310, 16, 176, 336, 496, 656, 836)
    )
  )
  assert.deepEqual(of(nook, 'empty-region'), [])
})

test('one model of bounds: a unit or two passes, bars line up by edges, spacing by whole items', async () => {
  const size = { widthIn: 6.75, heightIn: 2.6 }
  const arrow = (id, from, to) =>
    figureElement('arrow', {
      id,
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [1, 0]
      ],
      startBinding: { elementId: from, focus: 0, gap: 4 },
      endBinding: { elementId: to, focus: 0, gap: 4 }
    })
  const slight = lintFigureScene(
    scene(size, rect('a', 40, 100, 80, 40), rect('b', 160, 102, 80, 40), arrow('ab', 'a', 'b'))
  )
  assert.deepEqual(of(slight, 'near-miss-align'), [], 'two units do not show at print')
  const bar = lintFigureScene(
    scene(
      size,
      rect('bar', 40, 40, 400, 32, { customData: { asterBar: true } }),
      rect('under', 201.5, 112, 83, 40),
      arrow('up', 'under', 'bar')
    )
  )
  assert.deepEqual(of(bar, 'near-miss-align'), [], 'a bar lines up by its edges, not its centre')
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    for (const [index, tail] of ['left', 'none', 'left'].entries()) {
      fig.bubble({ id: `b${index}`, x: 40, y: 20 + index * 100, w: 120, text: 'a prompt', tail })
    }
    fig.distribute(['b0', 'b1', 'b2'], 'y')
    assert.deepEqual(of(await fig.save(), 'uneven-spacing'), [])
  })
})
