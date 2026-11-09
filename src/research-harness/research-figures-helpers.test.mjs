import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { absolutePoints } from './research-figures-labels.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { contrast } from './research-figures-palette.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 3 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-help-')))
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

test('glyph helpers: grid tokens, labelled bars, block-causal attention', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.tokens({ id: 'mix', x: 40, y: 40, items: ['a', { grid: { rows: 2, cols: 3 } }, 'b'] })
    assert.equal(fig.get('mix-1').customData.asterGrid.cols, 3, 'a small grid as one token')
    fig.style('illustrative')
    fig.distribution({
      id: 'p',
      x: 300,
      y: 40,
      w: 72,
      h: 40,
      values: [1, 3, 2],
      color: 'block',
      labels: ['cat', { tex: 'x_2' }, 'dog']
    })
    const bar = fig.get('p-b0').backgroundColor
    assert.ok(contrast(bar, fig.palette().panel) >= 1.5, `${bar} stands out on the panel`)
    const names = fig.elements.filter((element) => element.id.startsWith('p-l'))
    assert.deepEqual(
      names.map((element) => element.type),
      ['text', 'image', 'text']
    )
    assert.ok(
      names.every((element) => element.y >= 80),
      'under the baseline'
    )
    fig.attention({
      id: 'att',
      x: 500,
      y: 40,
      mask: 'block-causal',
      groups: [
        { label: 'z1', n: 2, block: 1 },
        { label: 'a1', n: 1, block: 1 },
        { label: 'z2', n: 2 }
      ]
    })
    const filled = (row, col) => fig.get(`att-r${row}c${col}`).backgroundColor !== '#ffffff'
    assert.ok(filled(0, 2), 'a frame sees its own action, one block')
    assert.ok(filled(3, 1), 'and every earlier block')
    assert.ok(!filled(2, 3), 'never a later block')
    assert.throws(() => fig.attention({ id: 'bad', mask: 'sliding' }), /block-causal/)
  })
})

test('illustrations: nn named above, cycles bulge outward either way, bubbles hold text', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('illustrative')
    fig.nn({ id: 'rm', x: 400, y: 80, w: 112, h: 72, label: 'reward model', color: 'muted' })
    const label = fig.elements.filter((element) => element.id.startsWith('rm-label'))
    assert.ok(
      label.every((element) => element.y + element.height <= 80),
      'the name sits above'
    )
    assert.equal(label[0].fontSize, 16)
    assert.equal(fig.get('rm-n0-0').backgroundColor, fig.palette().muted)
    fig.nn({ id: 'pol', x: 120, y: 80, w: 112, h: 72, label: 'policy' })
    const bulge = (id) => {
      const points = absolutePoints(fig.get(id))
      return points[1][1] - (points[0][1] + points.at(-1)[1]) / 2
    }
    // between: [right, left] used to draw an X.
    fig.cycle({ id: 'loop', between: ['rm', 'pol'] })
    assert.ok(bulge('loop-top') < 0, 'the top arc bulges up')
    assert.ok(bulge('loop-bottom') > 0, 'the bottom arc bulges down')
    fig.cycle({ id: 'back', between: ['pol', 'rm'] })
    assert.ok(bulge('back-top') < 0 && bulge('back-bottom') > 0)

    const bubble = fig.bubble({ id: 'b', x: 40, y: 200, text: 'write a poem' })
    assert.equal(bubble.strokeWidth, 1.5)
    assert.ok(fig.elements.some((element) => element.id.startsWith('b-text')))
    assert.equal(fig.bounds('b', { own: true }).height + 12, fig.bounds('b').height)
    fig.bubble({ id: 'short', x: 200, y: 200, w: 52, h: 24, lines: 3, label: 'y_w' })
    const rows = fig.elements
      .filter((element) => /^short-line\d$/.test(element.id))
      .map((element) => element.y)
    for (let index = 1; index < rows.length; index += 1) {
      assert.ok(rows[index] - rows[index - 1] >= 6, 'rows never merge')
    }
    fig.bubble({ id: 'empty', x: 300, y: 200, w: 40, h: 30, lines: 0, label: 'A', tail: 'none' })
    const inside = fig.bounds('empty-label')
    assert.ok(inside.y >= 200 && inside.bottom <= 230, 'the label stays in the bubble')
    assert.ok(!fig.elements.some((element) => element.id === 'empty-tail'))
  })
})

test('links: per-branch roles, opposite lanes, a zoom, an arrow from a glyph label', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'src', label: 'x', x: 40, y: 100, w: 48, h: 40, exact: true })
    fig.box({ id: 'a', label: 'a', x: 200, y: 40, w: 48, h: 40, exact: true })
    fig.box({ id: 'b', label: 'b', x: 200, y: 160, w: 48, h: 40, exact: true })
    const forked = fig.fork({
      id: 'f',
      from: 'src',
      to: ['a', { id: 'b', role: 'aux' }],
      roles: ['main']
    })
    assert.equal(forked.branches[0].strokeWidth, 2.5, 'the first branch is main')
    assert.equal(forked.branches[1].strokeStyle, 'dashed', 'the second is aux')

    fig.box({ id: 'x0', label: 'x_0', x: 400, y: 100, w: 56, h: 40, exact: true })
    fig.box({ id: 'xt', label: 'x_t', x: 560, y: 100, w: 56, h: 40, exact: true })
    const [q, p] = fig.lanes({ id: 'qp', between: ['x0', 'xt'], labels: ['q', 'p_\\theta'] })
    const [qs, ps] = [absolutePoints(q), absolutePoints(p)]
    assert.ok(qs[0][0] < qs.at(-1)[0] && ps[0][0] > ps.at(-1)[0], 'opposite directions')
    assert.ok(qs[0][1] < ps[0][1], 'q runs above p')
    assert.equal(q.endBinding.elementId, 'xt')
    assert.throws(() => fig.lanes({ id: 'no', between: ['a', 'xt'] }), /share no row/)

    fig.panel({ id: 'detail', x: 700, y: 40, w: 200, h: 160 })
    const lines = fig.zoom({ id: 'z', from: 'xt', to: 'detail' })
    assert.equal(lines.length, 2)
    assert.equal(fig.bounds('z').x, 616)
    assert.equal(fig.bounds('z').right, 700)

    fig.grid({ id: 'g', x: 40, y: 240, rows: 2, cols: 2, cell: 16, label: 'z' })
    const arrow = fig.arrow({ id: 'fromlabel', from: 'g-label', to: 'src' })
    assert.ok(arrow.startBinding.elementId.startsWith('g-label'), 'an arrow starts at a label')
    const report = await fig.save()
    assert.deepEqual(
      report.errors.filter((entry) => entry.code !== 'near-miss-align'),
      [],
      JSON.stringify(report.errors)
    )
  })
})

test('templates scale, expose their parts, draw post-norm and two-way diffusion steps', async () => {
  await withFigure(
    async (file) => {
      const fig = await openFigure(file)
      const pre = fig.template('transformer', { id: 'pre', x: 10, y: 10 })
      const post = fig.template('transformer', {
        id: 'post',
        x: 260,
        y: 10,
        variant: 'post-norm',
        h: 460
      })
      // Post-norm: attention, ⊕, then the norm; pre-norm: the norm first.
      assert.ok(fig.bounds(post.ids.norm1).y < fig.bounds(post.ids.add1).y)
      assert.ok(fig.bounds(pre.ids.norm1).y > fig.bounds(pre.ids.attn).y)
      assert.ok(post.ids.res1 && post.ids.in, 'residuals and the input are parts too')
      assert.ok(fig.bounds('post-panel').height > fig.bounds('pre-panel').height + 60)
      assert.throws(
        () => fig.template('transformer', { id: 'bad', variant: 'sandwich' }),
        /pre-norm or post-norm/
      )
      const short = fig.template('dit', { id: 'dit', x: 520, y: 10 })
      const shortHeight = fig.bounds('dit-panel').height
      fig.template('dit', { id: 'tall', x: 920, y: 10, h: 640 })
      assert.ok(fig.bounds('tall-panel').height > shortHeight + 20, 'h fills a taller page')
      assert.ok(short.ids.bus && short.ids.res1)
      const report = await fig.save()
      assert.deepEqual(report.errors, [])
    },
    { widthIn: 9.5, heightIn: 4.8 }
  )
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const small = fig.template('lora', { id: 'lora', x: 20, y: 20, size: 64 })
    assert.equal(fig.get(small.ids.weight).width, 64)
    assert.ok(small.ids.rank)
    const moe = fig.template('moe', { id: 'moe', x: 420, y: 20, gate: true, h: 40 })
    assert.equal(fig.get(moe.ids.experts[0]).height, 40)
    assert.equal(moe.ids.gates.length, 2)
    const chain = await fig.template('diffusion', { id: 'diff', x: 40, y: 230 })
    const [back, forth] = [fig.get(chain.ids.reverse[0]), fig.get(chain.ids.forward[0])]
    assert.equal(back.startBinding.elementId, 'diff-x0', 'p_θ runs from x_T toward x_0')
    assert.equal(forth.startBinding.elementId, 'diff-x1', 'q runs back')
    assert.equal(forth.strokeStyle, 'dashed')
    assert.ok(fig.elements.some((element) => element.id.startsWith(chain.ids.reverseLabel)))
  })
})
