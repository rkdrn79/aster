// The round G judges' lint: faint text and content, small data glyphs, empty boxes, flat
// backgrounds and loss wiring.
import assert from 'node:assert/strict'
import test from 'node:test'
import { lintFigureScene } from './research-figures-lint.mjs'
import { figureElement, newFigureScene } from './research-figures-model.mjs'
import { figureStyle, textInk } from './research-figures-style.mjs'

const DOUBLE = { widthIn: 6.75, heightIn: 2.6 }
const findings = (report) => [...report.errors, ...report.warnings, ...(report.notes ?? [])]
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
const text = (id, words, x, y, extra = {}) =>
  figureElement('text', {
    id,
    x,
    y,
    width: words.length * 8,
    height: 20,
    text: words,
    originalText: words,
    fontSize: 16,
    fontFamily: 9,
    strokeColor: '#1e1e1e',
    ...extra
  })
const line = (id, points, extra = {}) =>
  figureElement(extra.type ?? 'line', {
    id,
    x: points[0][0],
    y: points[0][1],
    width: 1,
    height: 1,
    points: points.map(([x, y]) => [x - points[0][0], y - points[0][1]]),
    strokeColor: '#333333',
    ...extra
  })

test('gray text lighter than #666 and content too faint for its box are flagged', () => {
  const report = lintFigureScene(
    scene(
      DOUBLE,
      text('note', 'stage 1', 40, 40, { strokeColor: '#8c8c8c' }),
      text('dark', 'stage 2', 40, 80, { strokeColor: '#666666' }),
      text('teal', 'ours', 40, 120, { strokeColor: '#2f7f7a' }),
      rect('thought', 200, 40, 120, 60, { backgroundColor: '#e9e9e9' }),
      line(
        'ghost',
        [
          [212, 60],
          [300, 60]
        ],
        { strokeColor: '#d6d6d6' }
      ),
      rect('kept', 400, 40, 120, 60, { backgroundColor: '#e9e9e9' }),
      line(
        'words',
        [
          [412, 60],
          [500, 60]
        ],
        { strokeColor: '#555555' }
      )
    )
  )
  assert.deepEqual(
    of(report, 'faint-text').map((entry) => entry.id),
    ['note']
  )
  assert.match(of(report, 'faint-text')[0].message, /note \(#8c8c8c\)/)
  assert.deepEqual(
    of(report, 'faint-content').map((entry) => entry.id),
    ['ghost']
  )
  // Muted words take a gray of #666 or darker in every preset.
  for (const name of ['graphite', 'slate', 'illustrative', 'print-mono']) {
    const style = figureStyle(name)
    assert.notEqual(textInk(style, 'muted'), style.muted)
  }
})

test('patches and crops under 24 px at print are flagged once per glyph', () => {
  const patches = (id, cell) => [
    rect(id, 40, 40, cell * 2, cell * 2, {
      backgroundColor: 'transparent',
      customData: { asterGrid: { rows: 2, cols: 2 }, asterKit: id },
      groupIds: [`${id}-glyph`]
    }),
    ...[0, 1].flatMap((row) =>
      [0, 1].map((col) =>
        rect(`${id}-r${row}c${col}`, 40 + col * cell, 40 + row * cell, cell, cell, {
          customData: { asterKit: id },
          groupIds: [`${id}-glyph`]
        })
      )
    )
  ]
  const small = lintFigureScene(scene(DOUBLE, patches('p', 16)))
  assert.equal(of(small, 'small-glyph').length, 1)
  assert.match(of(small, 'small-glyph')[0].message, /p's patches are 16 units across, 17 px/)
  assert.deepEqual(of(lintFigureScene(scene(DOUBLE, patches('p', 24))), 'small-glyph'), [])
  // A feature grid (cells sized by value) is not a picture cut into patches.
  const features = patches('f', 12)
  features[0].customData.asterGrid = { rows: 2, cols: 2, cell: 12, gap: 0 }
  assert.deepEqual(of(lintFigureScene(scene(DOUBLE, features)), 'small-glyph'), [])
})

test('a box counts every text and drawing in it; over 60% empty is flagged, cards too', () => {
  const label = (id, box, words) =>
    text(`${id}-label`, words, box.x + 20, box.y + 14, { containerId: box.id })
  const big = rect('enc', 40, 40, 240, 160, { boundElements: [{ type: 'text', id: 'enc-label' }] })
  const report = lintFigureScene(scene(DOUBLE, big, label('enc', big, 'encoder')))
  assert.match(of(report, 'empty-box')[0].message, /% empty/)
  // A second line of small text inside is content: no filler needed.
  const actor = rect('actor', 40, 40, 160, 64, {
    boundElements: [{ type: 'text', id: 'actor-label' }]
  })
  const filled = lintFigureScene(
    scene(
      DOUBLE,
      actor,
      text('actor-label', 'Actor', 60, 44, { containerId: 'actor' }),
      text('actor-note', 'LLM policy π', 60, 72, { fontSize: 14 })
    )
  )
  assert.deepEqual(of(filled, 'empty-box'), [])
  // A card with a small drawing in a large box is still a slab.
  const slab = lintFigureScene(
    scene(
      DOUBLE,
      rect('slab', 40, 40, 300, 200),
      rect('dot', 60, 60, 16, 16, { backgroundColor: '#333333' })
    )
  )
  assert.equal(of(slab, 'empty-box')[0]?.id, 'slab')
})

test('one tint behind the whole drawing encodes nothing; a tinted contribution passes', () => {
  const panel = (id, x, fill) =>
    rect(id, x, 12, 300, 300, { backgroundColor: fill, customData: { asterPanel: true } })
  const boxes = [rect('a', 40, 60, 80, 40), rect('b', 360, 60, 80, 40), rect('c', 680, 60, 80, 40)]
  const flat = lintFigureScene(
    scene(
      DOUBLE,
      panel('p1', 12, '#f4f4f4'),
      panel('p2', 332, '#f4f4f4'),
      panel('p3', 652, '#f4f4f4'),
      boxes
    )
  )
  assert.match(of(flat, 'flat-background')[0].message, /3 panels share one tint/)
  const ours = lintFigureScene(
    scene(
      DOUBLE,
      panel('p1', 12, '#f4f4f4'),
      panel('p2', 332, '#f4f4f4'),
      panel('p3', 652, '#dfeaf7'),
      boxes
    )
  )
  assert.deepEqual(of(ours, 'flat-background'), [])
})

test('a loss link across a data arrow, and a loss name floating alone, are flagged', () => {
  const loss = rect('loss', 400, 200, 80, 32, {
    backgroundColor: '#ffffff',
    strokeColor: '#8c8c8c',
    customData: { asterRole: 'loss', asterKit: 'loss' }
  })
  const link = line(
    'loss-in1',
    [
      [100, 216],
      [400, 216]
    ],
    { type: 'arrow', customData: { asterRole: 'loss-link', asterKit: 'loss' } }
  )
  const data = line(
    'flow',
    [
      [250, 120],
      [250, 300]
    ],
    { type: 'arrow' }
  )
  const crossed = lintFigureScene(scene(DOUBLE, loss, link, data))
  assert.match(of(crossed, 'loss-crossing')[0].message, /loss's links cross 1 data arrow \(flow\)/)
  const lone = lintFigureScene(
    scene(DOUBLE, rect('enc', 40, 40, 80, 40), text('l1', 'L1 loss', 600, 300))
  )
  assert.equal(of(lone, 'loss-floating')[0]?.id, 'l1')
  const beside = lintFigureScene(
    scene(DOUBLE, rect('enc', 40, 40, 80, 40), text('l1', 'L1 loss', 136, 50))
  )
  assert.deepEqual(of(beside, 'loss-floating'), [])
})

test('a box label drawn as runs that runs past the box is an overflow; a name outside passes', () => {
  const box = rect('actor', 200, 40, 96, 40, { customData: { asterKit: 'actor' } })
  const run = text('actor-label-0', 'Actor with a long label', 170, 50, {
    width: 156,
    customData: { asterKit: 'actor' }
  })
  const over = lintFigureScene(scene(DOUBLE, box, run))
  assert.match(
    of(over, 'text-overflow')[0].message,
    /actor's label needs 156 × 15 but the box is 96 × 40 .*do not wrap/
  )
  const above = text('net-label', 'reward model', 170, 8, {
    width: 156,
    customData: { asterKit: 'actor' }
  })
  assert.deepEqual(of(lintFigureScene(scene(DOUBLE, box, above)), 'text-overflow'), [])
})

test('stop-grad slashes touching a label are flagged; the kit keeps them clear of the arrow label', async () => {
  const slash = (x) =>
    line(
      'sg-1',
      [
        [x, 60],
        [x + 6, 44]
      ],
      { customData: { asterMark: 'stop-grad' }, groupIds: ['sg'] }
    )
  const label = text('z', 'z', 100, 44, { width: 10, height: 18 })
  const touching = lintFigureScene(scene(DOUBLE, label, slash(111)))
  assert.equal(of(touching, 'mark-on-label')[0]?.id, 'sg-1')
  assert.deepEqual(of(lintFigureScene(scene(DOUBLE, label, slash(118))), 'mark-on-label'), [])
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
  const os = await import('node:os')
  const path = await import('node:path')
  const { openFigure } = await import('./research-figures-kit.mjs')
  const { glyphBounds } = await import('./research-figures-text.mjs')
  const { elementBounds } = await import('./research-figures-geometry.mjs')
  const folder = await mkdtemp(path.join(os.tmpdir(), 'aster-sg-'))
  try {
    const file = path.join(folder, 'fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene(DOUBLE)))
    const fig = await openFigure(file)
    fig.box({ id: 'a', label: 'online', x: 40, y: 60 })
    fig.box({ id: 'b', label: 'target', x: 260, y: 60 })
    fig.arrow({ id: 'ab', from: 'a', to: 'b', label: 'z_\\theta' })
    fig.stopGrad('ab', { label: false })
    const words = fig.elements.filter(
      (element) =>
        element.id.startsWith('ab-') &&
        element.customData?.asterKit === 'ab' &&
        (element.type === 'text' || element.customData?.asterTex)
    )
    const marks = fig.elements.filter((element) => element.customData?.asterMark === 'stop-grad')
    for (const mark of marks) {
      for (const word of words) {
        const ink = word.type === 'text' ? glyphBounds(word) : elementBounds(word)
        const box = elementBounds(mark)
        const gap = Math.max(
          ink.x - box.right,
          box.x - ink.right,
          ink.y - box.bottom,
          box.y - ink.bottom
        )
        assert.ok(gap >= 3.9, `${mark.id} is ${gap} from ${word.id}`)
      }
    }
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})

test('a detour over twice the direct length names the title that sits on every direct route', () => {
  const around = line(
    'go',
    [
      [100, 100],
      [100, 40],
      [160, 40],
      [160, 100]
    ],
    { type: 'arrow' }
  )
  const title = text('panel-title', 'Router', 112, 92, { width: 36, height: 16, fontSize: 14 })
  const [finding] = of(lintFigureScene(scene(DOUBLE, around, title)), 'detour')
  assert.match(
    finding.message,
    /runs 180 units to reach 60 away: panel-title sits on every direct route/
  )
  const free = lintFigureScene(scene(DOUBLE, around))
  assert.match(of(free, 'detour')[0].message, /put its ends next to each other/)
})

test('a panel title wider than its panel is an overflow', () => {
  const panel = rect('p', 200, 40, 120, 160, {
    backgroundColor: '#f4f4f4',
    customData: { asterPanel: true, asterKit: 'p' }
  })
  const title = text('p-title-0', 'Reward model training (step 2)', 190, 46, {
    width: 200,
    customData: { asterKit: 'p' }
  })
  assert.match(
    of(lintFigureScene(scene(DOUBLE, panel, title)), 'text-overflow')[0].message,
    /p's title needs/
  )
})

test("fig.legend's swatches, fig.group's containers and a trajectory's rows pass their rules", () => {
  const legend = [0, 1].flatMap((index) => [
    rect(`key-s${index}`, 40, 40 + index * 24, 16, 16, {
      backgroundColor: index ? '#c5def8' : '#e9e9e9',
      customData: { asterLegend: 'key', asterKit: 'key' }
    }),
    text(`key-t${index}`, index ? 'ours' : 'frozen', 62, 38 + index * 24, {
      fontSize: 14,
      customData: { asterLegend: 'key', asterKit: 'key' }
    })
  ])
  assert.deepEqual(of(lintFigureScene(scene(DOUBLE, legend)), 'legend'), [])
  // A group container spans a hole between its items: the hole is still found.
  const row = (y, ...xs) => xs.map((x, index) => rect(`r${y}-${index}`, x, y, 120, 48))
  const items = [
    ...row(16, 16, 176, 336, 496, 656, 836),
    ...row(160, 16, 176, 656, 836),
    ...row(310, 16, 176, 336, 496, 656, 836)
  ]
  const container = rect('grp', 12, 12, 948, 350, {
    backgroundColor: 'transparent',
    customData: { asterContainer: true, asterIntentional: true }
  })
  assert.equal(of(lintFigureScene(scene(DOUBLE, items, container)), 'empty-region').length, 1)
  // A trajectory card: rows of example words in one box are data, not prose.
  const sentence = 'I should search for the Colorado orogeny and find the area it extends into.'
  const card = rect('traj-frame', 40, 40, 520, 120, {
    backgroundColor: '#ffffff',
    strokeColor: '#cccccc'
  })
  const steps = [0, 1, 2].map((index) =>
    text(`traj-s${index}-t0`, sentence, 120, 50 + index * 20, { width: 420, fontSize: 14 })
  )
  assert.deepEqual(of(lintFigureScene(scene(DOUBLE, card, steps)), 'prose'), [])
})

test('a faint rule under a title in a box with words is no ghost', () => {
  const card = rect('card', 40, 40, 300, 120, { backgroundColor: '#ffffff' })
  const rule = line(
    'rule',
    [
      [50, 70],
      [330, 70]
    ],
    { strokeColor: '#ececec' }
  )
  const title = text('card-title', 'Question', 50, 46)
  assert.deepEqual(of(lintFigureScene(scene(DOUBLE, card, rule, title)), 'faint-content'), [])
  assert.equal(of(lintFigureScene(scene(DOUBLE, card, rule)), 'faint-content').length, 1)
})
