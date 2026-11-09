import assert from 'node:assert/strict'
import test from 'node:test'
import { lintFigureScene } from './research-figures-lint.mjs'
import { figureElement, newFigureScene } from './research-figures-model.mjs'

const findings = (report) => [...report.errors, ...report.warnings, ...(report.notes ?? [])]
const codes = (report) => findings(report).map((entry) => entry.code)
const of = (report, code) => findings(report).filter((entry) => entry.code === code)
const DOUBLE = { widthIn: 6.75, heightIn: 2.6 }

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

const arrow = (id, points, extra = {}) =>
  figureElement('arrow', {
    id,
    x: points[0][0],
    y: points[0][1],
    width: 1,
    height: 1,
    points: points.map(([x, y]) => [x - points[0][0], y - points[0][1]]),
    strokeColor: '#555555',
    strokeWidth: 2,
    endArrowhead: 'triangle',
    ...extra
  })

test('a canvas role chip counts like the kit: loss and aux links may detour, data arrows not', () => {
  const detour = [
    [40, 100],
    [40, 300],
    [300, 300],
    [300, 110]
  ]
  const lint = (customData) =>
    of(lintFigureScene(scene(DOUBLE, arrow('l', detour, { customData }))), 'detour')
  assert.equal(lint({ asterRole: 'data' }).length, 1, 'a data arrow from the canvas is checked')
  assert.equal(lint({ asterRole: 'loss-link' }).length, 0, "the canvas's Loss chip")
  assert.equal(lint({ asterRole: 'aux' }).length, 0, "the canvas's Aux chip")
  assert.equal(lint({ asterLine: 'side' }).length, 0, "the kit's side line")
})

test('a loss node is not a row member, and an item lined up by fig.bounds is no slip', () => {
  const row = (...extra) =>
    lintFigureScene(
      scene(
        DOUBLE,
        rect('a', 40, 100, 80, 40),
        rect('b', 160, 100, 80, 40),
        rect('c', 280, 100, 80, 40),
        ...extra
      )
    )
  const placed = row(rect('loss', 400, 103, 60, 34, { customData: { asterRole: 'loss' } }))
  assert.ok(!codes(placed).includes('near-miss-align'), 'the kit placed the loss')
  // A bubble: body 100…140, tail to 152; its whole bounds' centre (126) is the row's (120)? No:
  // the agent centred the bubble with its tail on the row, so body and row are 6 apart.
  const bubble = [
    rect('q', 400, 94, 60, 40, { backgroundColor: '#ffffff', strokeColor: '#1e1e1e' }),
    figureElement('line', {
      id: 'q-tail',
      x: 404,
      y: 134,
      width: 14,
      height: 12,
      points: [
        [0, 0],
        [4, 12],
        [14, 0]
      ],
      strokeColor: '#1e1e1e',
      customData: { asterKit: 'q' }
    })
  ]
  assert.ok(
    !codes(row(bubble)).includes('near-miss-align'),
    JSON.stringify(of(row(bubble), 'near-miss-align'))
  )
  // A badge sticking out of a box gives no new way to miss.
  const badge = rect('c-badge', 352, 92, 16, 16, {
    customData: { asterKit: 'c', asterBadge: true }
  })
  assert.ok(!codes(row(badge)).includes('near-miss-align'))
  assert.ok(codes(row(rect('d', 400, 103, 80, 40))).includes('near-miss-align'), 'still a slip')
})

test('uneven spacing passes an even pitch, rows lined up across panels and ⋯ items', () => {
  // Boxes of different heights on an even 64-unit pitch: gaps of 32 and 24, centres even.
  const pitch = lintFigureScene(
    scene(DOUBLE, rect('a', 40, 20, 80, 40), rect('b', 40, 92, 80, 24), rect('c', 40, 140, 80, 56))
  )
  assert.ok(!codes(pitch).includes('uneven-spacing'), JSON.stringify(of(pitch, 'uneven-spacing')))
  // Left panel: gaps of 20 and 30, its middle box on the right panel's middle row.
  const panels = lintFigureScene(
    scene(
      DOUBLE,
      rect('pl', 20, 20, 200, 300, {
        customData: { asterPanel: true },
        backgroundColor: '#f4f4f4'
      }),
      rect('l1', 40, 40, 120, 40),
      rect('l2', 40, 100, 120, 40),
      rect('l3', 40, 170, 120, 40),
      rect('pr', 300, 20, 200, 300, {
        customData: { asterPanel: true },
        backgroundColor: '#f4f4f4'
      }),
      rect('r1', 320, 40, 120, 40),
      rect('r2', 320, 100, 120, 40),
      rect('r3', 320, 160, 120, 40)
    )
  )
  assert.ok(!codes(panels).includes('uneven-spacing'), JSON.stringify(of(panels, 'uneven-spacing')))
  const dots = figureElement('text', {
    id: 'dots-label',
    x: 210,
    y: 110,
    width: 12,
    height: 20,
    text: '⋯',
    originalText: '⋯',
    fontSize: 16,
    fontFamily: 9,
    containerId: 'dots'
  })
  const ellipsis = lintFigureScene(
    scene(
      DOUBLE,
      rect('a', 40, 100, 60, 40),
      rect('b', 120, 100, 60, 40),
      rect('dots', 194, 100, 36, 40, { boundElements: [{ id: 'dots-label', type: 'text' }] }),
      dots,
      rect('c', 250, 100, 60, 40)
    )
  )
  assert.ok(
    !codes(ellipsis).includes('uneven-spacing'),
    JSON.stringify(of(ellipsis, 'uneven-spacing'))
  )
})

test('one hue for trained modules and a matrix highlight says two things; a predicted grid not', () => {
  const module = (id, x) => [
    rect(id, x, 40, 120, 48, {
      backgroundColor: '#c5def8',
      boundElements: [{ id: `${id}-label`, type: 'text' }]
    }),
    figureElement('text', {
      id: `${id}-label`,
      x: x + 30,
      y: 54,
      width: 60,
      height: 20,
      text: 'encoder',
      originalText: 'encoder',
      fontSize: 16,
      fontFamily: 9,
      containerId: id
    })
  ]
  const cells = (glyph, fill, role) => [
    rect(glyph, 400, 40, 96, 96, {
      backgroundColor: 'transparent',
      strokeColor: '#1e1e1e',
      customData: role ? { asterRole: role } : {}
    }),
    ...[0, 1].flatMap((i) =>
      [0, 1].map((j) =>
        rect(`${glyph}-r${i}c${j}`, 400 + j * 48, 40 + i * 48, 48, 48, {
          backgroundColor: fill(i, j),
          customData: { asterKit: glyph }
        })
      )
    )
  ]
  const diagonal = (i, j) => (i === j ? '#7fb0e2' : '#e9e9e9')
  const highlight = lintFigureScene(scene(DOUBLE, module('enc', 40), cells('sim', diagonal)))
  assert.equal(of(highlight, 'hue-meaning').length, 1)
  const predicted = lintFigureScene(
    scene(DOUBLE, module('enc', 40), cells('yhat', diagonal, 'compared'))
  )
  assert.equal(of(predicted, 'hue-meaning').length, 0, 'predictions tinted where they predict')
  const gray = lintFigureScene(
    scene(
      DOUBLE,
      module('enc', 40),
      cells('sim', (i, j) => (i === j ? '#555555' : '#e9e9e9'))
    )
  )
  assert.equal(of(gray, 'hue-meaning').length, 0)
})

test('a sparse page reports its blank share; short token chips read as specks at print size', () => {
  const sparse = lintFigureScene(
    scene(
      DOUBLE,
      rect('a', 40, 40, 120, 48),
      rect('b', 400, 40, 120, 48),
      rect('c', 760, 280, 160, 60)
    )
  )
  const blank = findings(sparse).find((entry) => /% of the page is blank/.test(entry.message))
  assert.ok(blank, JSON.stringify(findings(sparse).map((entry) => entry.code)))
  const strip = (h) =>
    [0, 1, 2].map((index) =>
      rect(`seq-${index}`, 40 + index * 30, 40, 26, h, {
        groupIds: ['seq-glyph'],
        customData: { asterKit: 'seq' }
      })
    )
  assert.equal(of(lintFigureScene(scene(DOUBLE, strip(12))), 'small-chip').length, 1)
  assert.equal(of(lintFigureScene(scene(DOUBLE, strip(24))), 'small-chip').length, 0)
  // A page twice the column's width prints its 24-unit chips at 12.
  assert.equal(
    of(lintFigureScene(scene({ widthIn: 13.5, heightIn: 3 }, strip(24))), 'small-chip').length,
    1
  )
})
