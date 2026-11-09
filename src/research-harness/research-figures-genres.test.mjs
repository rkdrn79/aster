import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { countShares, formatCount, parseCount } from './research-figures-cards.mjs'
import { MARK_INKS } from './research-figures-annotate.mjs'
import {
  FIGURE_STYLES,
  SEMANTIC_COLORS,
  figureStyle,
  styleColor
} from './research-figures-style.mjs'
import { FIGURE_ICONS, iconFile } from './research-figures-icons.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-genres-')))
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

const codes = (report) => [...report.errors, ...report.warnings].map((entry) => entry.code)

test('counts read and print as papers write them, and shrink on a log scale', () => {
  assert.equal(parseCount('5.8B'), 5.8e9)
  assert.equal(parseCount('12,000'), 12000)
  assert.equal(formatCount(5.8e9), '5.8B')
  assert.equal(formatCount(1.4e8), '140M')
  assert.equal(formatCount('1M hours'), '1M hours', 'a string prints as written')
  const shares = countShares([5.8e9, 2.1e9, 1.4e8])
  assert.equal(shares[0], 1)
  assert.ok(shares[1] > shares[2] && shares[2] >= 0.2, 'the smallest still shows')
  assert.ok(countShares([100, 50], { scale: 'linear' })[1] === 0.5)
})

test('a pipeline: stage cards with icons, notes, counts and thumbnails, joined and looped', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('illustrative')
    const result = await fig.pipeline({
      id: 'pipe',
      x: 20,
      y: 20,
      w: 932,
      numbered: true,
      stages: [
        {
          title: 'Common Crawl',
          icon: 'globe',
          note: '95 snapshots',
          count: 5.8e9,
          thumbs: ['street', 'food']
        },
        { title: 'Language ID', icon: 'language', count: 2.1e9, snippet: 'the cat sat on the mat' },
        {
          title: 'Dedup',
          icon: 'dedup',
          count: 9.8e8,
          thumbs: ['dog', { kind: 'dog', mark: 'cross' }]
        },
        { title: 'Final set', icon: 'database', count: 1.4e8 }
      ],
      loop: { from: 3, to: 2, label: 'retrain' }
    })
    assert.deepEqual(result.ids, ['pipe-s0', 'pipe-s1', 'pipe-s2', 'pipe-s3'])
    const cards = result.ids.map((id) => fig.get(id))
    assert.ok(
      cards.every((card) => card.height === cards[0].height),
      'one row, one height'
    )
    assert.ok(cards.every((card) => card.y === cards[0].y))
    const index = (id) => fig.elements.findIndex((element) => element.id === id)
    assert.ok(index('pipe-s0-icon') > index('pipe-s0'), 'the icon sits over its card')
    assert.ok(index('pipe-s0-th0') > index('pipe-s0'), 'the photos too')
    const bars = result.ids.map((id) => fig.get(`${id}-bar`).width)
    assert.ok(bars[0] > bars[1] && bars[1] > bars[3], 'count bars shrink with the counts')
    assert.equal(fig.get('pipe-s3-count').text, '140M')
    assert.notEqual(
      fig.get('pipe-s3').backgroundColor,
      fig.get('pipe-s0').backgroundColor,
      'the dataset is the hero'
    )
    assert.equal(fig.get('pipe-s2-th1-mark').customData.asterMark, 'cross')
    assert.ok(fig.get('pipe-a1') && fig.get('pipe-a3'), 'arrows between stages')
    assert.ok(fig.get('pipe-loop').points.length >= 4, 'a loop under the row')
    assert.equal(fig.get('pipe-s1-step-n').text, '2')
    const title = fig.get('pipe-s0-title-0')
    assert.ok(title.x + title.width <= cards[0].x + cards[0].width, 'the title fits its card')
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
  })
})

test('a funnel shrinks with the counts; the remainder takes the accent', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const result = fig.funnel({
      id: 'f',
      x: 40,
      y: 40,
      stages: [
        { label: 'crawl', count: '5.8B' },
        { label: 'filtered', count: '2.1B' },
        { label: 'final', count: '140M' }
      ]
    })
    assert.ok(result.bars[0].h > result.bars[1].h && result.bars[1].h > result.bars[2].h)
    assert.equal(fig.get('f-n2').text, '140M')
    assert.notEqual(fig.get('f-bar2').backgroundColor, fig.get('f-bar1').backgroundColor)
    assert.deepEqual((await fig.save()).errors, [])
  })
})

test('motivation pieces: cards with highlights and marks, a mini chart, braces, steps, sub-captions', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const card = fig.card({
      id: 'ans',
      x: 40,
      y: 40,
      w: 180,
      role: 'Q:',
      text: 'There are two cups on the table.',
      highlights: [{ text: 'two cups', color: 'accent' }],
      mark: 'cross'
    })
    assert.ok(card.height > 30)
    assert.equal(fig.get('ans-role').text, 'Q:', 'a short role leads the first line')
    const span = fig.elements.find((element) => element.customData?.asterHighlight)
    assert.ok(span && span.width > 30, 'the phrase is tinted behind its words')
    assert.equal(fig.get('ans-mark').strokeColor, MARK_INKS.cross)
    const header = fig.card({
      id: 'out',
      x: 260,
      y: 40,
      w: 180,
      role: 'Model output',
      text: 'Three.'
    })
    assert.ok(fig.get('out-role').y < fig.get('out-t0').y, 'a long role heads the card')
    assert.ok(header.height > card.height - 30)
    const chart = fig.chart({
      id: 'acc',
      x: 500,
      y: 40,
      values: [41.2, 48.5, 63.9],
      labels: ['A', 'B', 'Ours'],
      highlight: 'last',
      yLabel: 'acc. (%)'
    })
    assert.ok(chart.plot.h > 20)
    const bars = [0, 1, 2].map((index) => fig.get(`acc-b${index}`))
    assert.ok(bars[2].height > bars[0].height, 'bars follow the values')
    assert.notEqual(bars[2].backgroundColor, bars[0].backgroundColor, 'ours stands out')
    assert.equal(fig.get('acc-v2').text, '63.9')
    fig.chart({
      id: 'curve',
      kind: 'line',
      x: 680,
      y: 40,
      series: [
        { values: [1, 2, 3], label: 'ours' },
        { values: [1, 1.5, 2], label: 'base' }
      ],
      highlight: 0
    })
    assert.equal(fig.get('curve-l0').text, 'ours', 'lines are labelled at their ends')
    fig.brace({ id: 'br', around: ['ans', 'out'], side: 'bottom', label: 'same question' })
    assert.equal(fig.get('br').customData.asterBrace, 'curly')
    assert.ok(fig.get('br-2'), 'two halves meeting at the tip')
    const step = fig.step({ id: 's1', n: 1, cx: 60, cy: 200 })
    assert.equal(step.type, 'ellipse')
    fig.subcaption({ id: 'sub', under: 'ans', label: '(a)', text: 'prior work' })
    assert.ok(
      fig.elements.some(
        (element) => element.id.startsWith('sub') && element.text === '(a) prior work'
      )
    )
    fig.mark({ id: 'ok', kind: 'check', on: 'out' })
    assert.equal(
      fig.get('ok-disc').backgroundColor,
      '#ffffff',
      'a white disc under a mark on an item'
    )
    assert.throws(() => fig.mark({ id: 'bad', kind: 'tick' }), /kind/)
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
    assert.ok(!codes(report).includes('legend'), 'cards and charts are not a legend')
  })
})

test('a grid of qualitative examples: headers, photo and text cells, marks and row labels', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const grid = await fig.examples({
      id: 'ex',
      x: 40,
      y: 20,
      w: 120,
      h: 80,
      columns: ['Input', 'Baseline', 'Ours'],
      highlightColumn: 2,
      rowLabels: ['denoise', 'QA'],
      arrows: true,
      rows: [
        [
          { kind: 'bird', noise: 0.5 },
          { kind: 'bird', mark: 'cross' },
          { kind: 'bird', mark: 'check' }
        ],
        [
          { text: 'Capital of Australia?', role: 'Q:' },
          { text: 'Sydney.', mark: 'cross' },
          { text: 'Canberra.', mark: 'check' }
        ]
      ]
    })
    assert.deepEqual(grid.ids[1], ['ex-r1c0', 'ex-r1c1', 'ex-r1c2'])
    assert.equal(fig.get('ex-r0c1').type, 'image')
    assert.equal(fig.get('ex-r1c2').customData.asterCard, true)
    assert.ok(fig.get('ex-r0c2-mark'))
    assert.equal(fig.get('ex-c2').strokeColor, fig.palette().accents[0].ink, 'ours in the accent')
    assert.ok(fig.get('ex-r0a'), 'an arrow from the input to its output')
    assert.equal(
      fig.get('ex-r0c0').x + 120 + 32 <= fig.get('ex-r0c1').x,
      true,
      'room for the arrow'
    )
    assert.deepEqual((await fig.save()).errors, [])
  })
})

test('pipeline icons are line art with no emoji', () => {
  for (const name of [
    'filter',
    'dedup',
    'merge',
    'code',
    'annotator',
    'inspect',
    'language',
    'tag'
  ]) {
    assert.ok(FIGURE_ICONS[name], name)
    assert.match(iconFile(name, 'emoji'), /lucide/, `${name} has no emoji, so it stays line art`)
  }
})

test('right and wrong take the good and bad roles in every preset, never counted as palette', async () => {
  for (const name of Object.keys(FIGURE_STYLES)) {
    const style = figureStyle(name)
    assert.equal(styleColor(style, 'good').fill, SEMANTIC_COLORS.good.fill, name)
    assert.equal(styleColor(style, 'bad-ink').ink, SEMANTIC_COLORS.bad.ink, name)
  }
  assert.deepEqual(MARK_INKS, { check: SEMANTIC_COLORS.good.ink, cross: SEMANTIC_COLORS.bad.ink })
  const draw = async (good, bad) => {
    let report
    await withFigure(async (file) => {
      const fig = await openFigure(file)
      fig.style('graphite', { accent: 'blue' })
      fig.box({ id: 'ours', label: 'Ours', x: 40, y: 40, w: 120, h: 48, color: 'accent' })
      fig.card({ id: 'right', x: 200, y: 40, w: 180, text: 'Paris.', color: good, mark: 'check' })
      fig.card({ id: 'wrong', x: 420, y: 40, w: 180, text: 'Lyon.', color: bad, mark: 'cross' })
      fig.card({
        id: 'hl',
        x: 640,
        y: 40,
        w: 200,
        text: 'The answer is Paris.',
        highlights: ['Paris'],
        mark: 'check'
      })
      report = await fig.save()
      const span = fig.elements.find((element) => element.customData?.asterHighlight)
      assert.equal(
        span.backgroundColor,
        SEMANTIC_COLORS.good.fill,
        'a marked card highlights in its tone'
      )
    })
    return report
  }
  const roles = await draw('good', 'bad')
  assert.deepEqual(
    codes(roles).filter((code) =>
      ['uniform-tints', 'generated-palette', 'hue-count'].includes(code)
    ),
    []
  )
  // Why hex near the roles: the same pastel step by hand is still the generated look.
  const hand = await draw('#c6e6c6', '#fbd2cc')
  assert.ok(codes(hand).includes('uniform-tints'), JSON.stringify(codes(hand)))
})
