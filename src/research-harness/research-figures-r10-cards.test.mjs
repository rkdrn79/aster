import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { figureStyle, styleColor } from './research-figures-style.mjs'
import { iconFile } from './research-figures-icons.mjs'
import { contrast } from './research-figures-palette.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2.5 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r10-cards-')))
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

const live = (fig, prefix) =>
  fig.elements.filter((element) => !element.isDeleted && element.id.startsWith(prefix))

test('panel colours work wherever a glyph derives a strong or ink tone', async () => {
  const style = figureStyle('illustrative', undefined, { panels: ['sky', 'sage'] })
  assert.equal(styleColor(style, 'panel-1-strong').fill, style.panels[0].strong)
  assert.equal(styleColor(style, 'panel-1-ink-strong').fill, style.panels[0].ink)
  assert.equal(styleColor(style, 'panel-2-ink-ink').ink, style.panels[1].ink)
  // Why: a swatch the page doesn't list ('rose' on a sky page) is a tint, not an error.
  assert.match(styleColor(style, 'rose').fill, /^#/)
  assert.match(styleColor(figureStyle('graphite'), 'rose').fill, /^#/)
  assert.throws(() => styleColor(style, 'mauve'), /panel-1 \(sky\).*panel-1-ink.*rose/)
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('illustrative', { panels: ['sky', 'sage'] })
    fig.nn({ id: 'net', x: 40, y: 60, w: 90, h: 60, color: 'panel-1-ink', label: 'policy' })
    fig.nn({ id: 'net2', x: 200, y: 60, w: 90, h: 60, color: 'panel-2' })
    const nodes = live(fig, 'net-n').filter((element) => element.type === 'ellipse')
    assert.ok(nodes.length > 0)
    assert.equal(nodes[0].backgroundColor, fig.palette().panels[0].ink)
    const palette = fig.palette()
    assert.deepEqual(
      palette.panels.map((item) => [item.name, item.swatch]),
      [
        ['panel-1', 'sky'],
        ['panel-2', 'sage']
      ]
    )
    assert.ok(palette.panels.every((item) => item.fill && item.strong && item.ink))
  })
})

/** Runs `draw` with console.warn captured; returns what the kit printed. */
async function warned(draw) {
  const printed = []
  const original = console.warn
  console.warn = (message) => printed.push(String(message))
  try {
    await draw()
  } finally {
    console.warn = original
  }
  return printed
}

test('a card keeps its h, inlines a field label, and takes a rose highlight on any page', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('illustrative', { accent: 'blue', panels: ['sky'] })
    // Why 28: four caption cards of one line each must fit where card() used to pad to 34.
    const caption = fig.card({ id: 'cap', x: 20, y: 20, w: 184, h: 28, text: 'a dog on a ridge' })
    assert.equal(caption.height, 28)
    assert.equal(fig.get('cap').height, 28)
    const text = fig.get('cap-t0')
    assert.ok(text.y >= 20 + 2 && text.y + text.height <= 20 + 28, 'the line sits inside the card')
    const tall = fig.card({ id: 'tall', x: 220, y: 20, w: 120, h: 80, text: 'short' })
    assert.equal(tall.height, 80)
    const printed = await warned(() =>
      fig.card({ id: 'tight', x: 360, y: 20, w: 90, h: 12, text: 'a much longer sentence here' })
    )
    assert.ok(fig.get('tight').height > 12, 'text that cannot fit grows the card')
    assert.match(printed.join('\n'), /card tight: its text needs/)
    fig.card({
      id: 'inst',
      x: 20,
      y: 120,
      w: 300,
      role: 'Instruction:',
      text: 'Give me a quote from a famous person.',
      highlights: [{ text: 'famous person', color: 'rose' }]
    })
    const role = fig.get('inst-role')
    const first = fig.get('inst-t0')
    assert.equal(role.y, first.y, 'a field label leads the first line')
    assert.ok(first.x > role.x + role.width - 1)
    const span = live(fig, 'inst-h').find((element) => element.customData?.asterHighlight)
    assert.equal(span.customData.asterHighlight, 'rose')
    fig.card({ id: 'head', x: 340, y: 120, w: 200, role: 'Model output', text: 'Paris.' })
    assert.ok(fig.get('head-t0').y > fig.get('head-role').y, 'a longer role heads the card')
    fig.card({ id: 'forced', x: 340, y: 200, w: 200, role: 'Q', roleInline: false, text: 'Why?' })
    assert.ok(fig.get('forced-t0').y > fig.get('forced-role').y, 'roleInline: false heads it')
  })
})

test('a bubble of fixed width wraps its words, and its label ends the last line clear of them', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('illustrative')
    const printed = await warned(() =>
      fig.bubble({ id: 'x', x: 20, y: 20, w: 96, text: 'write me a poem about jazz', label: 'x' })
    )
    assert.deepEqual(printed, [])
    const body = fig.get('x')
    assert.equal(body.width, 96)
    const texts = live(fig, 'x-text').filter((element) => element.type === 'text')
    assert.ok(texts.length >= 2, 'the words wrap onto more lines')
    for (const element of texts) {
      assert.ok(
        element.x + element.width <= body.x + body.width - 4,
        `${element.text} stays inside`
      )
      assert.ok(element.y >= body.y && element.y + element.height <= body.y + body.height)
    }
    const label = fig.bounds('x-label')
    const last = texts.toSorted((a, b) => b.y - a.y)[0]
    assert.ok(label.x >= last.x + last.width, 'the label sits after the last line, not over it')
    assert.ok(label.y < last.y + last.height && label.bottom > last.y, 'on the last line')
    // Without w the bubble widens for the label instead.
    fig.bubble({ id: 'y', x: 200, y: 20, text: 'a short prompt', label: 'y_w' })
    const yText = live(fig, 'y-text').find((element) => element.type === 'text')
    assert.ok(fig.bounds('y-label').x >= yText.x + yText.width)
    const tight = await warned(() =>
      fig.bubble({ id: 'z', x: 340, y: 20, w: 80, h: 20, text: 'three short lines of text here' })
    )
    assert.ok(fig.get('z').height > 20)
    assert.match(tight.join('\n'), /bubble z: its text needs/)
  })
})

test('measure() sizes cards, bubbles, networks, callouts and arrow labels without drawing them', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('illustrative')
    const count = fig.elements.length
    const cardSpec = { x: 10, y: 10, w: 160, role: 'Model output', text: 'The answer is Paris.' }
    const card = fig.measure('card', cardSpec)
    const bubbleSpec = { x: 200, y: 10, w: 90, text: 'write me a poem about jazz', label: 'x' }
    const bubble = fig.measure('bubble', bubbleSpec)
    const nnSpec = { x: 320, y: 60, w: 80, h: 50, label: 'reward model' }
    const nn = fig.measure('nn', nnSpec)
    const callout = fig.measure('callout', { x: 10, y: 150, text: 'maximum likelihood' })
    const label = fig.measure('arrowLabel', { labelText: 'sample' })
    const tex = fig.measure('label', { label: 'p_\\theta' })
    assert.equal(fig.elements.length, count, 'measuring draws nothing')
    fig.card({ id: 'c', ...cardSpec })
    fig.bubble({ id: 'b', ...bubbleSpec })
    fig.nn({ id: 'n', ...nnSpec })
    assert.equal(card.height, fig.get('c').height)
    assert.equal(card.width, fig.get('c').width)
    const drawn = fig.bounds('b')
    assert.ok(
      Math.abs(bubble.height - drawn.height) < 1 && Math.abs(bubble.width - drawn.width) < 1
    )
    assert.ok(nn.y < 60, 'a network’s size includes its label above it')
    // Why a tolerance: measure() reports text by its ink, bounds() by its box.
    assert.ok(nn.height > 50 && Math.abs(nn.height - fig.bounds('n').height) < 6)
    assert.ok(callout.width > 60 && callout.height > 10)
    assert.ok(label.width > 20 && label.width < 80)
    assert.ok(tex.width > 5)
    assert.throws(() => fig.measure('blob', {}), /card, arrowLabel, bubble, nn, callout/)
  })
})

test('an arrow from above a network ends on its name instead of detouring round it', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('illustrative')
    fig.box({ id: 'p', x: 160, y: 16, w: 120, h: 32, label: 'prompt' })
    const net = fig.nn({ id: 'net', x: 180, y: 130, w: 80, h: 60, label: 'reward model' })
    assert.deepEqual([net.y, net.height], [130, 60], 'nn() still returns the network itself')
    const down = fig.arrow({ id: 'down', from: 'p', to: 'net' })
    const xs = new Set(down.points.map(([px]) => px))
    assert.equal(xs.size, 1, 'straight down, no detour')
    const label = fig.bounds('net-label')
    assert.ok(down.y + down.points.at(-1)[1] <= label.y + 4, 'the head stops on top of the name')
    fig.box({ id: 'q', x: 20, y: 144, w: 80, h: 32, label: 'input' })
    const side = fig.arrow({ id: 'side', from: 'q', to: 'net' })
    assert.ok(
      side.points.every(([, py]) => py === 0),
      'a side arrow stays level'
    )
    assert.equal(side.y, 160)
    const report = await fig.save()
    const codes = [...report.errors, ...report.warnings].map((entry) => `${entry.code}:${entry.id}`)
    assert.ok(!codes.some((code) => /down|net/.test(code)), codes.join(', '))
  })
})

test('a stack stays inside w × h and a white one shows its cards on white and on the accent', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('illustrative', { accent: 'blue' })
    fig.card({ id: 'bg', x: 10, y: 10, w: 200, h: 120, text: '', color: 'accent' })
    for (const [id, x] of [
      ['white', 20],
      ['onWhite', 260]
    ]) {
      fig.stack({ id, x, y: 30, w: 32, h: 48, count: 3, offset: 4, color: 'white' })
      const box = fig.bounds(id)
      assert.deepEqual([box.x, box.y, box.width, box.height], [x, 30, 32, 48])
      const cards = live(fig, `${id}-card`)
      assert.equal(cards.length, 3)
      assert.ok(
        cards.every((card) => card.strokeColor !== '#ffffff' && card.strokeColor !== 'transparent'),
        'pale cards get a gray edge'
      )
    }
    fig.stack({ id: 'tinted', x: 120, y: 30, w: 32, h: 48, color: 'accent-strong' })
    assert.equal(
      live(fig, 'tinted-card')[0].strokeColor,
      '#ffffff',
      'tinted cards keep white seams'
    )
  })
})

test('archive and shard icons are line art', () => {
  for (const name of ['archive', 'shard']) {
    assert.match(iconFile(name), /lucide/)
  }
})

test('a pipeline gives each stage its width, wraps notes and chips, and needs no counts', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('illustrative', { accent: 'blue' })
    const fixed = await fig.pipeline({
      id: 'a',
      x: 10,
      y: 10,
      w: 600,
      gap: 32,
      stages: [{ title: 'Split' }, { title: 'Filtering', w: 200 }, { title: 'Dedup' }]
    })
    assert.equal(fixed.widths[1], 200, 'a stage keeps its own w')
    assert.equal(fixed.widths[0], fixed.widths[2])
    assert.equal(fixed.widths[0], (600 - 200 - 64) / 2)
    assert.equal(live(fig, 'a-s0-bar').length, 0, 'no count, no bar')
    assert.ok(fixed.height < 56, 'a title-only row is slim, not an empty box')
    const printed = await warned(async () => {
      const auto = await fig.pipeline({
        id: 'b',
        x: 10,
        y: 80,
        w: 520,
        stages: [
          { title: 'Raw' },
          {
            title: 'Filter',
            note: 'drop failing\nclips',
            thumbs: ['dog', 'cat', 'beach', 'food'],
            chips: ['motion', 'quality', 'overlay text', 'video type']
          },
          { title: 'Data' }
        ]
      })
      assert.ok(auto.widths[1] > auto.widths[0], 'four thumbnails need a wider card')
      const note = live(fig, 'b-s1-note').filter((element) => element.type === 'text')
      assert.equal(note.length, 2, 'the note keeps its line break')
      const noteBottom = Math.max(...note.map((element) => element.y + element.height))
      assert.ok(fig.get('b-s1-th0').y >= noteBottom, 'thumbnails start under the note')
      const card = fig.get('b-s1')
      for (const chip of live(fig, 'b-s1-chip').filter((element) => element.type === 'rectangle')) {
        assert.ok(chip.x + chip.width <= card.x + card.width - 4, `${chip.id} inside the card`)
        assert.ok(chip.y + chip.height <= card.y + card.height - 4)
      }
      await fig.pipeline({
        id: 'c',
        x: 10,
        y: 300,
        w: 300,
        stages: [{ title: 'Common Crawl snapshots' }, { title: 'Language ID' }, { title: 'Out' }]
      })
    })
    assert.match(printed.join('\n'), /pipeline c: stage "[^"]+" prints its title at 14/)
    const empty = await warned(() =>
      fig.stage({ id: 'tall', x: 600, y: 300, w: 120, h: 200, title: 'Split' })
    )
    assert.match(empty.join('\n'), /stage tall: h 200 leaves/)
  })
})

test('size carries weight: a centred name fades its network, roomy cards and bubbles warn', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('illustrative')
    fig.nn({ id: 'mid', x: 20, y: 40, w: 100, h: 60, label: 'policy', labelSide: 'center' })
    fig.nn({ id: 'top', x: 200, y: 40, w: 100, h: 60, label: 'policy' })
    assert.ok(fig.get('mid-pill'), 'a centred name sits on a white pill')
    const opacity = (id) => fig.get(id).opacity
    assert.ok(opacity('mid-n0-0') >= 40 && opacity('mid-n0-0') <= 60)
    assert.ok(opacity('mid-e0') < opacity('top-e0'), 'the edges fade under the name')
    const printed = await warned(() => {
      fig.card({ id: 'roomy', x: 20, y: 140, w: 160, h: 120, text: 'Paris.' })
      fig.card({ id: 'kept', x: 200, y: 140, w: 160, h: 120, text: 'Paris.', intentional: true })
      fig.bubble({ id: 'big', x: 400, y: 140, w: 240, h: 120, text: 'hi' })
    })
    assert.match(printed.join('\n'), /card roomy: h 120 is far taller/)
    assert.doesNotMatch(printed.join('\n'), /card kept/)
    assert.match(printed.join('\n'), /bubble big: 240 × 120 is far bigger/)
    fig.bubble({ id: 'lines', x: 400, y: 20, w: 60, h: 40, lines: 3 })
    const rows = live(fig, 'lines-line')
    assert.ok(
      rows.length >= 2 && rows.every((row) => row.strokeWidth >= 1.5),
      'placeholder rows print'
    )
  })
})

test('card text: every occurrence highlighted, pale red, coloured prefixes, line height, mark room', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('graphite', { accent: 'blue' })
    fig.card({
      id: 'traj',
      x: 20,
      y: 20,
      w: 360,
      text: 'Thought: search for Paris\nAct: lookup Paris\nObs: Paris is the capital',
      prefixes: { 'Thought:': 'accent', 'Act:': 'teal', 'Obs:': 'ink' },
      highlights: [{ text: 'Paris', color: 'red' }],
      lineHeight: 1.5
    })
    const spans = live(fig, 'traj-h').filter((element) => element.customData?.asterHighlight)
    assert.equal(spans.length, 3, 'each Paris is highlighted')
    assert.ok(contrast(spans[0].backgroundColor, figureStyle('graphite').ink) >= 4.5, 'pale red')
    const thought = fig.get('traj-p0')
    assert.equal(thought.text, 'Thought:')
    assert.notEqual(thought.strokeColor, fig.get('traj-t0').strokeColor)
    assert.equal(fig.get('traj-p1').text, 'Act:')
    assert.equal(Math.round(fig.get('traj-t1').y - fig.get('traj-t0').y), Math.round(14 * 1.5))
    // Why: the mark sits beside the first line only, so later lines keep the full width.
    const plain = fig.card({
      id: 'a',
      x: 20,
      y: 140,
      w: 150,
      text: 'one two three four five six seven'
    })
    const marked = fig.card({
      id: 'b',
      x: 200,
      y: 140,
      w: 150,
      mark: 'check',
      text: 'one two three four five six seven'
    })
    assert.ok(marked.lines - plain.lines <= 1)
    const narrow = fig.card({ id: 'n', x: 20, y: 220, w: 96, text: 'a dog on a ridge' })
    assert.ok(narrow.lines <= 2, 'a narrow card pads less, so a caption wraps less')
    fig.card({ id: 'in', x: 200, y: 220, w: 200, role: 'Input:', text: 'a photo of a cat' })
    assert.equal(fig.get('in-role').y, fig.get('in-t0').y, "'Input:' leads its line")
  })
})

test('stage photos grow into a row that is taller than their card needs', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('illustrative')
    await fig.pipeline({
      id: 'p',
      x: 10,
      y: 10,
      w: 520,
      stages: [
        { title: 'Filter', thumbs: ['dog'], chips: ['motion', 'quality', 'overlay text', 'type'] },
        { title: 'Dedup', thumbs: ['dog', 'cat'] }
      ]
    })
    assert.equal(fig.get('p-s0-th0').width, 48)
    assert.ok(fig.get('p-s1-th0').width > 48, 'the shorter stage fills its card with bigger photos')
    const card = fig.get('p-s1')
    const photo = fig.get('p-s1-th1')
    assert.ok(photo.x + photo.width <= card.x + card.width - 4)
    assert.ok(photo.y + photo.height <= card.y + card.height - 4)
  })
})

test('a badge takes a corner or a point, so a narrow-top trapezoid keeps it off its waist', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.trapezoid({ id: 'up', x: 40, y: 40, w: 120, h: 60, narrow: 'top' })
    const box = fig.bounds('up')
    fig.trainable('up')
    const waist = fig.bounds('up-trainable')
    assert.ok(waist.x + waist.width / 2 < box.right - 10, 'the default sits on the narrow top')
    fig.trapezoid({ id: 'down', x: 240, y: 40, w: 120, h: 60, narrow: 'top' })
    fig.trainable('down', { corner: 'bottom-right' })
    const other = fig.bounds('down')
    const wide = fig.bounds('down-trainable')
    assert.ok(Math.abs(wide.x + wide.width / 2 - other.right) <= 4)
    assert.ok(Math.abs(wide.y + wide.height / 2 - other.bottom) <= 4)
    fig.frozen('up', { at: [100, 30] })
    const placed = fig.bounds('up-frozen')
    assert.equal(placed.x + placed.width / 2, 100)
    assert.throws(() => fig.frozen('down', { corner: 'middle' }), /corner/)
  })
})

test('a sub-caption keeps cx under a panel and wraps to its width', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'p', x: 20, y: 20, w: 120, h: 60, label: 'panel' })
    fig.subcaption({
      id: 'a',
      under: 'p',
      label: '(a)',
      text: 'prior work: one global caption per image'
    })
    const lines = live(fig, 'a').filter((element) => element.type === 'text')
    assert.ok(lines.length >= 2, 'wrapped to the panel')
    assert.ok(lines.every((line) => line.width <= 121))
    fig.box({ id: 'q', x: 200, y: 20, w: 120, h: 60, label: 'panel' })
    fig.subcaption({
      id: 'b',
      under: 'q',
      label: '(b)',
      text: 'ours',
      cx: 300,
      color: 'accent-ink'
    })
    const b = fig.bounds('b')
    assert.ok(Math.abs(b.x + b.width / 2 - 300) < 1)
  })
})

test('a cycle takes a title between its arcs, clear of their heads', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('illustrative')
    fig.nn({ id: 'rm', x: 20, y: 60, w: 100, h: 50, label: 'reward model' })
    fig.nn({ id: 'pi', x: 330, y: 60, w: 100, h: 50, label: 'LM policy' })
    fig.cycle({ id: 'loop', between: ['rm', 'pi'], title: 'reinforcement\nlearning' })
    const title = fig.bounds('loop-title')
    for (const id of ['loop-top', 'loop-bottom']) {
      const arc = fig.get(id)
      const ends = [arc.points[0], arc.points.at(-1)].map(([, py]) => arc.y + py)
      assert.ok(
        ends.every((y) => y < title.y || y > title.bottom),
        `${id} ends clear of the title`
      )
    }
  })
})
