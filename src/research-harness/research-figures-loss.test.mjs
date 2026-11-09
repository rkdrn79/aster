import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { absolutePoints } from './research-figures-labels.mjs'
import { newFigureScene } from './research-figures-model.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2.6 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-loss-')))
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

const length = (element) => {
  const points = absolutePoints(element)
  return points
    .slice(1)
    .reduce(
      (sum, point, index) =>
        sum + Math.hypot(point[0] - points[index][0], point[1] - points[index][1]),
      0
    )
}
const inside = (element, page) =>
  element.x >= page.x &&
  element.y >= page.y &&
  element.x + element.width <= page.x + page.width &&
  element.y + element.height <= page.y + page.height

test('a loss stays on the page, beside or between its sets, with links long enough', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    // Sets at the right edge: no room on the right, so the loss goes between the rows.
    fig.features({ id: 'p', x: 840, y: 30, rows: 3, cols: 6 })
    fig.features({ id: 't', x: 840, y: 250, rows: 3, cols: 6 })
    const between = fig.loss({
      id: 'l1',
      label: '\\frac{1}{N}\\sum_i \\ell_i',
      predictions: 'p',
      targets: 't',
      links: 'dashed'
    })
    assert.ok(inside(between, fig.page), JSON.stringify(between))
    assert.ok(between.y > 80 && between.y + between.height < 250, 'between the rows')
    assert.ok(
      fig.elements.some((element) =>
        String(element.customData?.asterMath ?? '').includes('\\dfrac')
      ),
      'fractions print in display size'
    )
    for (const id of ['l1-in1', 'l1-in2']) {
      assert.ok(length(fig.get(id)) >= 40, `${id} is ${length(fig.get(id))}`)
    }
    fig.box({ id: 'a', label: 'policy', x: 40, y: 40 })
    fig.box({ id: 'b', label: 'reference', x: 40, y: 140 })
    const near = fig.loss({
      id: 'l2',
      label: ['\\log\\sigma(\\beta r_w', '- \\beta r_l)'],
      inputs: ['a', 'b'],
      links: 'dashed',
      cx: 230,
      cy: 110
    })
    assert.equal(
      fig.get('a').strokeColor,
      'transparent',
      'inputs are linked, not marked as compared'
    )
    assert.ok(near.height > 40, 'two lines')
    for (const id of ['l2-in1', 'l2-in2']) {
      assert.ok(length(fig.get(id)) >= 40, `${id} nudged out to ${length(fig.get(id))}`)
    }
  })
})

test('images get a ring; scattered targets are ringed one by one and joined in one link', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    await fig.image({ id: 'img', kind: 'cat', x: 40, y: 40, w: 50, h: 50 })
    fig.box({ id: 'enc', label: 'encoder', x: 160, y: 40 })
    fig.loss({ id: 'rec', label: 'L_{rec}', compare: ['img'], x: 60, y: 180 })
    assert.equal(fig.get('rec-ring-img').customData.asterRole, 'compared')
    fig.tokens({ id: 'seq', x: 300, y: 40, items: ['a', '<BOI>', 'b', 'c', '<EOI>', 'd'] })
    fig.loss({
      id: 'lm',
      label: 'L_{LM}',
      targets: ['seq-0', 'seq-2', 'seq-5'],
      group: 'rings',
      x: 420,
      y: 180
    })
    for (const index of [0, 2, 5]) {
      assert.ok(fig.get(`lm-ring-seq-${index}`))
    }
    const into = fig.elements.filter(
      (element) => element.type === 'arrow' && element.endBinding?.elementId === 'lm'
    )
    assert.equal(into.length, 1, 'one link into the loss')
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
  })
})

test('a loss takes the form the figure needs, in ink, with no frame and ordinary links', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.features({ id: 'p', x: 40, y: 40, rows: 3, cols: 3 })
    fig.features({ id: 't', x: 40, y: 200, rows: 3, cols: 3 })
    const symbol = fig.loss({ id: 'l1', symbol: '\\mathcal{L}_1', predictions: 'p', targets: 't' })
    assert.equal(symbol.strokeColor, 'transparent', 'no frame by default')
    assert.equal(symbol.customData.asterLossForm, 'symbol')
    assert.ok(symbol.y > 80 && symbol.y + symbol.height < 200, 'between stacked sets')
    const link = fig.get('l1-in1')
    assert.equal(link.strokeStyle, 'solid', 'ordinary links')
    assert.equal(link.strokeColor, fig.palette().line)
    assert.equal(link.customData.asterRole, 'loss-link')
    assert.equal(fig.get('p').strokeColor, fig.palette().line, 'compared tensors framed in ink')

    fig.box({ id: 'a', label: 'student', x: 300, y: 40 })
    fig.box({ id: 'b', label: 'teacher', x: 300, y: 200 })
    const name = fig.loss({ id: 'l2', name: 'cross-entropy', inputs: ['a', 'b'], boxed: true })
    assert.equal(name.customData.asterLossForm, 'name')
    assert.equal(name.strokeColor, fig.palette().muted, 'a thin neutral frame when asked')
    const words = fig.elements.find((element) => element.containerId === 'l2')
    assert.equal(words.text, 'cross-entropy', 'a name is plain text, not TeX')
    assert.equal(words.strokeColor, fig.palette().ink)

    fig.features({ id: 'q', x: 560, y: 40, rows: 3, cols: 3 })
    fig.features({ id: 'r', x: 700, y: 40, rows: 3, cols: 3 })
    const match = fig.loss({
      id: 'l3',
      form: 'compare',
      predictions: 'q',
      targets: 'r',
      symbol: '\\ell_1'
    })
    assert.equal(match.type, 'arrow')
    assert.equal(match.startArrowhead, match.endArrowhead, 'two heads, no node')
    assert.ok(
      fig.elements.some((element) => element.id.startsWith('l3-label')),
      'a small label on the link'
    )
    assert.ok(!fig.elements.some((element) => element.customData?.asterLossForm === 'compare'))

    fig.features({ id: 'u', x: 560, y: 200, rows: 3, cols: 3 })
    fig.features({ id: 'v', x: 560, y: 300, rows: 2, cols: 3 })
    fig.loss({
      id: 'l4',
      form: 'compare',
      link: 'bracket',
      predictions: 'u',
      targets: 'v',
      name: 'match'
    })
    assert.equal(fig.get('l4').type, 'line')

    const none = fig.loss({ id: 'l5', form: 'none', predictions: 'q', targets: 'r' })
    assert.equal(none.length, 2, 'predictions and targets stay marked')

    const report = await fig.save()
    assert.ok(!report.warnings.some((entry) => entry.code === 'loss-color'))
    assert.deepEqual(report.errors, [])
  })
})

test('colour is opt-in: tone red reserves red for the loss, tone accent takes its shade', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.features({ id: 'p', x: 40, y: 40, rows: 3, cols: 3 })
    fig.features({ id: 't', x: 40, y: 200, rows: 3, cols: 3 })
    fig.loss({ id: 'l1', symbol: 'L', predictions: 'p', targets: 't', tone: 'red', boxed: true })
    assert.equal(fig.get('l1').strokeColor, '#ba2c25')
    assert.equal(fig.get('l1-in1').strokeColor, '#ba2c25')
    fig.box({ id: 'odd', label: 'odd', x: 400, y: 60, stroke: '#ba2c25' })
    const red = await fig.save()
    assert.ok(
      red.warnings.some((entry) => entry.code === 'loss-color'),
      'red off a red loss'
    )
    const again = await openFigure(file)
    again.remove('odd')
    again.loss({ id: 'l1', symbol: 'L', predictions: 'p', targets: 't', tone: 'accent' })
    assert.equal(again.get('l1-in1').strokeColor, again.palette().accents[0].ink)
    again.box({ id: 'odd', label: 'odd', x: 400, y: 60, stroke: '#ba2c25' })
    const accent = await again.save()
    assert.ok(!accent.warnings.some((entry) => entry.code === 'loss-color'), 'red is free again')
    assert.throws(() => fig.loss({ id: 'l9', tone: 'pink' }), /tone/)
    assert.throws(() => fig.loss({ id: 'l8', form: 'equation' }), /form/)
  })
})

test('an automatic loss sits between its sets, clear of what is drawn, on the page and in line', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.features({ id: 'p', x: 40, y: 60, rows: 3, cols: 3 })
    fig.features({ id: 't', x: 240, y: 60, rows: 3, cols: 3 })
    const between = fig.loss({ id: 'l1', symbol: '\\mathcal{L}_1', predictions: 'p', targets: 't' })
    const [p, t] = [fig.bounds('p'), fig.bounds('t')]
    assert.equal(
      between.x + between.width / 2,
      (p.right + t.x) / 2,
      'half way between side-by-side sets'
    )
    assert.equal(between.y + between.height / 2, p.y + p.height / 2, 'on their centre line')
    fig.features({ id: 'p2', x: 500, y: 40, rows: 3, cols: 3 })
    fig.features({ id: 't2', x: 500, y: 200, rows: 3, cols: 3 })
    fig.box({ id: 'blk', label: 'decoder', x: 490, y: 100, w: 80, h: 40 })
    const clear = fig.loss({ id: 'l2', symbol: 'L_2', predictions: 'p2', targets: 't2' })
    const block = fig.get('blk')
    assert.ok(
      clear.x >= block.x + block.width ||
        clear.x + clear.width <= block.x ||
        clear.y >= block.y + block.height ||
        clear.y + clear.height <= block.y,
      'never on top of another item'
    )
    fig.box({ id: 'a', label: 'a', x: 700, y: 14 })
    fig.box({ id: 'b', label: 'b', x: 800, y: 14 })
    const fallback = fig.loss({ id: 'l3', symbol: 'L_3', inputs: ['a', 'b'], side: 'above' })
    assert.ok(fallback.y >= 12, 'a side with no room falls back to one on the page')
    const report = await fig.save()
    assert.deepEqual(report.errors, [], JSON.stringify(report.errors))
  })
})

test('teacher-forcing rings fit between tokens and join on the side free of input arrows', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const strip = fig.tokens({
      id: 'seq',
      x: 40,
      y: 150,
      items: ['a', 'cat', '<BOI>', 'b', 'c', '<EOI>', 'd']
    })
    for (const cell of strip.cells) {
      fig.arrow({ id: `${cell.id}-up`, from: [cell.x + cell.w / 2, 230], to: cell.id })
    }
    fig.box({
      id: 'lm',
      label: 'Transformer',
      x: 40,
      y: 60,
      w: strip.width,
      h: 40,
      exact: true,
      bar: true
    })
    fig.loss({
      id: 'lm-loss',
      symbol: '\\mathcal{L}_{LM}',
      targets: ['seq-3', 'seq-4'],
      group: 'rings'
    })
    const [left, right] = ['seq-3', 'seq-4'].map((id) => fig.get(`lm-loss-ring-${id}`))
    assert.ok(left.x + left.width < right.x, 'neighbouring rings do not overlap')
    const join = absolutePoints(fig.get('lm-loss-join1'))
    assert.ok(
      join.every(([, y]) => y <= 150),
      'joined above, away from the arrows below'
    )
    fig.loss({
      id: 'lm-below',
      symbol: '\\mathcal{L}_{2}',
      targets: ['seq-0', 'seq-6'],
      group: 'rings',
      join: 'below',
      x: 320,
      y: 200
    })
    assert.ok(
      absolutePoints(fig.get('lm-below-join1')).some(([, y]) => y > 178),
      'join: below'
    )
    await fig.image({ id: 'img', kind: 'cat', x: 500, y: 40, w: 50, h: 50, label: 'x_0' })
    fig.box({ id: 'rec', label: 'decoder', x: 600, y: 40 })
    fig.loss({ id: 'rl', symbol: 'L_{rec}', compare: ['img', 'rec'] })
    const ring = fig.get('rl-ring-img')
    const label = fig.elements.find((element) => element.id.startsWith('img-label'))
    assert.ok(ring.y + ring.height <= label.y, 'the ring leaves the image’s label out')
  })
})

test('two links never merge into one trunk; a note goes where no link enters; tfrac stays small', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.distribution({ id: 'ps', x: 100, y: 60, w: 60, h: 40, values: [1, 3, 5, 2] })
    fig.distribution({ id: 'pt', x: 300, y: 60, w: 60, h: 40, values: [1, 3, 5, 2] })
    fig.loss({
      id: 'ce',
      symbol: 'H(P_t, P_s)',
      inputs: ['ps', 'pt'],
      cx: 230,
      y: 200,
      note: 'teacher frozen'
    })
    const [a, b] = ['ce-in1', 'ce-in2'].map((id) => absolutePoints(fig.get(id)).at(-1))
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) >= 6, 'separate ends')
    const node = fig.get('ce')
    const note = fig.elements.filter((element) => element.id.startsWith('ce-note'))
    assert.ok(note.length && note.every((element) => element.y >= node.y + node.height), 'below')
    fig.loss({
      id: 'tf',
      formula: ['\\frac{1}{N}\\sum_i \\ell_i', '+ \\tfrac{1}{2}\\|w\\|^2'],
      x: 500,
      y: 150
    })
    const lines = fig.elements
      .filter((element) => element.customData?.asterKit === 'tf' && element.type === 'image')
      .toSorted((first, second) => first.y - second.y)
    assert.ok(lines[1].customData.asterMath.includes('\\tfrac'), 'tfrac is not made dfrac')
    assert.ok(
      lines[0].y + lines[0].height <= lines[1].y,
      'the line under a fraction starts below it'
    )
    fig.box({ id: 'x', label: 'x', x: 700, y: 40 })
    fig.box({ id: 'y', label: 'y', x: 700, y: 120 })
    const kept = fig.loss({
      id: 'near',
      symbol: 'L',
      inputs: ['x', 'y'],
      x: 760,
      y: 92,
      links: 'dashed'
    })
    assert.equal(kept.x, 760, 'a spot the script gave is never nudged')
  })
})
