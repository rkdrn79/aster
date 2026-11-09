import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { mainAxis, splitSpot } from './research-figures-kit-links.mjs'
import { absolutePoints } from './research-figures-labels.mjs'
import { pathsCross } from './research-figures-loss-links.mjs'
import { newFigureScene } from './research-figures-model.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 3 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-links-')))
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

const box = (x, y, w, h) => ({ lo: [x, y], hi: [x + w, y + h], c: [x + w / 2, y + h / 2] })
const labelOf = (fig, id) =>
  fig.elements.filter((element) => element.customData?.asterKit === id && element.type !== 'arrow')

test('lanes style each arrow, place each label, and bind to a small ellipsis', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'a', label: 'x_t', x: 40, y: 40, w: 64, h: 64 })
    const dots = fig.ellipsis({ id: 'dots', cx: 200, cy: 72 })
    assert.equal(dots.height, 24, 'the ellipsis has real bounds to bind to')
    assert.equal(
      fig.elements.filter((element) => element.id.startsWith('dots-dot')).length,
      3,
      'three dots'
    )
    const [p, q] = fig.lanes({
      id: 'l',
      between: ['a', 'dots'],
      colors: ['accent-ink'],
      arrows: [{ role: 'main' }, { dashed: true, color: 'muted' }],
      labels: ['p', 'q'],
      labelSides: ['below', 'above']
    })
    assert.notEqual(p.strokeColor, q.strokeColor, 'each lane takes its own colour')
    assert.equal(q.strokeStyle, 'dashed')
    assert.equal(p.strokeStyle, 'solid')
    assert.equal(p.endBinding.elementId, 'dots', 'binds to the ellipsis')
    assert.equal(q.startBinding.elementId, 'dots')
    const [pLabel] = labelOf(fig, 'l-1')
    assert.ok(pLabel.y > absolutePoints(p)[0][1], 'labelSides moves the first label below')
    fig.ellipsis({ id: 'vdots', cx: 300, cy: 200, axis: 'y', size: 30 })
    const [top, , bottom] = ['vdots-dot1', 'vdots-dot2', 'vdots-dot3'].map((id) => fig.get(id))
    assert.equal(top.x, bottom.x, '⋮ stacks its dots')
    assert.equal(bottom.y - top.y, 20)
    assert.throws(() => fig.ellipsis({ id: 'bad', axis: 'z' }), /axis/)
    fig.box({ id: 'far', label: 'b', x: 400, y: 200, w: 64, h: 64 })
    assert.throws(() => fig.lanes({ id: 'l2', between: ['a', 'far'] }), /share no row/)
  })
})

test('a fork goes down to targets below it, splits half way, and labels its trunk', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    // Targets spread left of and under the source: still a fork downward, never sideways.
    fig.box({ id: 'src', label: 'classify', x: 560, y: 40, w: 192 })
    fig.box({ id: 'a', label: 'output-first', x: 320, y: 160, w: 200 })
    fig.box({ id: 'b', label: 'input-first', x: 560, y: 160, w: 200 })
    const down = fig.fork({
      id: 'f',
      from: 'src',
      to: ['a', 'b'],
      labels: ['yes', 'no'],
      label: 'answer'
    })
    const trunk = absolutePoints(down.trunk)
    assert.equal(trunk[0][0], trunk.at(-1)[0], 'the trunk runs straight down')
    const source = fig.get('src')
    const split = trunk.at(-1)[1]
    assert.ok(split > source.y + source.height + 8 && split < 152, `split ${split} in the gap`)
    assert.ok(labelOf(fig, 'f-trunk').length, 'the trunk takes the label')
    const [yes] = labelOf(fig, 'f-1')
    const corner = absolutePoints(down.branches[0]).at(-1)
    assert.ok(yes.x + yes.width <= corner[0], 'the left branch is labelled on its outer side')
    // A source below its targets, close to them: the dot sits in the gap, no U-turn.
    fig.box({ id: 'img', label: 'x', x: 120, y: 280, w: 48, h: 48 })
    fig.box({ id: 'sv', label: 'student', x: 20, y: 200, w: 120, h: 48 })
    fig.box({ id: 'tv', label: 'teacher', x: 160, y: 200, w: 120, h: 48 })
    const up = fig.fork({ id: 'g', from: 'img', to: ['sv', 'tv'] })
    const dot = up.dot.y + up.dot.height / 2
    assert.ok(dot > 248 + 4 && dot < 280 - 4, `dot at ${dot} between the rows`)
    const path = absolutePoints(up.trunk)
    assert.ok(
      path.every(([, y]) => y <= 280),
      'the trunk never turns back into the source'
    )
    // split: { y } fixes the axis and the place.
    const forced = fig.fork({ id: 'h', from: 'src', to: ['a', 'b'], split: { y: 136 } })
    assert.equal(absolutePoints(forced.trunk).at(-1)[1], 136)
    assert.throws(
      () => fig.fork({ id: 'i', from: 'src', to: ['a'], split: { x: 1, y: 2 } }),
      /split/
    )
  })
})

test('the main axis is the one the targets lie beyond; the split keeps clear of both edges', () => {
  const source = box(560, 40, 192, 48)
  const row = [box(320, 160, 200, 48), box(560, 160, 200, 48)]
  assert.equal(mainAxis(source, row), 1, 'targets below, though further sideways')
  assert.equal(mainAxis(box(40, 40, 60, 40), [box(200, 0, 60, 40), box(200, 120, 60, 40)]), 0)
  assert.equal(splitSpot(88, 160), 120, 'half way, on the grid')
  assert.equal(splitSpot(276, 248), 264, 'upward too')
  assert.equal(splitSpot(100, 118), 109, 'off the grid rather than on an edge')
})

test('a merge joins half way between its sources and its target', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 's1', label: 'image', x: 40, y: 40, w: 96 })
    fig.box({ id: 's2', label: 'text', x: 200, y: 40, w: 96 })
    fig.box({ id: 't', label: 'fusion', x: 120, y: 120, w: 96 })
    const merged = fig.merge({ id: 'm', from: ['s1', 's2'], to: 't', label: 'concat' })
    const join = absolutePoints(merged.trunk)[0][1]
    assert.ok(join > fig.get('s1').y + fig.get('s1').height + 4 && join < 120 - 4, `join ${join}`)
    assert.ok(labelOf(fig, 'm-trunk').length, 'the trunk takes the label')
  })
})

const crossesAny = (fig, ids) =>
  ids.flatMap((id) =>
    fig.elements.filter(
      (other) =>
        other.type === 'arrow' &&
        !other.id.startsWith('l-') &&
        other.strokeStyle === 'solid' &&
        pathsCross(absolutePoints(fig.get(id)), absolutePoints(other))
    )
  )

test('an automatic loss sits between two sets in a row with room for two stubs, in that row', async () => {
  await withFigure(
    async (file) => {
      const fig = await openFigure(file)
      fig.distribution({ id: 'ps', x: 84, y: 16, w: 88, h: 44, values: [1, 2, 3, 2] })
      fig.distribution({ id: 'pt', x: 316, y: 16, w: 88, h: 44, values: [1, 5, 1, 1] })
      const node = fig.loss({
        id: 'l',
        symbol: 'H(P_t, P_s)',
        predictions: ['ps'],
        targets: ['pt']
      })
      assert.ok(node.x > 172 && node.x + node.width < 316, 'between them')
      assert.equal(Math.round(node.y + node.height / 2), 38, 'on their row')
      // A row given with cy is kept; the kit picks the spot along it.
      fig.box({ id: 'a', label: 'a', x: 40, y: 200, w: 48 })
      fig.box({ id: 'b', label: 'b', x: 360, y: 200, w: 48 })
      const kept = fig.loss({ id: 'k', symbol: 'L', inputs: ['a', 'b'], cy: 216 })
      assert.equal(kept.y + kept.height / 2, 216)
    },
    { widthIn: 3.25, heightIn: 3.2 }
  )
})

test('an automatic loss lands on no closed outline and keeps its note on the page', async () => {
  await withFigure(
    async (file) => {
      const fig = await openFigure(file)
      fig.matrix({ id: 'sim', x: 248, y: 120, rows: 4, cols: 4, cell: 60 })
      fig.matrix({ id: 'tgt', x: 808, y: 60, rows: 4, cols: 4, cell: 28 })
      fig.trapezoid({ id: 'enc', x: 80, y: 120, w: 96, h: 240, label: 'image encoder' })
      const node = fig.loss({
        id: 'l',
        name: 'contrastive loss',
        predictions: 'sim',
        targets: 'tgt',
        note: 'cross-entropy over\nrows and columns'
      })
      const enc = fig.bounds('enc')
      assert.ok(node.x >= enc.right || node.x + node.width <= enc.x, 'not on the encoder')
      const report = await fig.save()
      assert.deepEqual(
        report.errors.filter((error) => String(error.id).startsWith('l')),
        [],
        JSON.stringify(report.errors)
      )
    },
    { widthIn: 6.75, heightIn: 2.6 }
  )
})

test('loss links never cross a solid arrow, else the kit says where to put the loss', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'p', label: 'prediction', x: 100, y: 60 })
    fig.box({ id: 't', label: 'target', x: 100, y: 260 })
    fig.box({ id: 'src', label: 'input', x: 400, y: 160 })
    fig.arrow({ id: 'in', from: 'src', to: [180, 176] })
    const node = fig.loss({ id: 'l', name: 'L1 loss', predictions: 'p', targets: 't' })
    assert.ok(node)
    assert.deepEqual(crossesAny(fig, ['l-in1', 'l-in2']), [], 'clear of the input arrow')
    // A wall of arrows between the two sets: every spot crosses one, so the kit throws.
    fig.box({ id: 'q', label: 'q', x: 40, y: 140, w: 48 })
    fig.box({ id: 'r', label: 'r', x: 860, y: 140, w: 48 })
    fig.arrow({ id: 'wall', from: [480, 14], to: [480, 420], heads: 'none' })
    assert.throws(
      () => fig.loss({ id: 'w', name: 'loss', predictions: 'q', targets: 'r' }),
      /loss w: no automatic spot.*(crosses the arrow wall|units from).*cx: \d+, cy: \d+/
    )
  })
})

test('group rings rings spread predictions too, and frames a run of touching ones', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    for (const k of [0, 1, 2]) {
      fig.box({ id: `o${k}`, label: `o${k}`, x: 80 + k * 120, y: 40, w: 40, h: 32 })
      fig.box({ id: `z${k}`, label: `z${k}`, x: 80 + k * 120, y: 200, w: 40, h: 32 })
    }
    fig.loss({
      id: 'l',
      name: 'L1 loss',
      predictions: ['o0', 'o1', 'o2'],
      targets: ['z0', 'z1', 'z2'],
      group: 'rings',
      x: 560,
      y: 128
    })
    assert.ok(fig.get('l-ring-o1') && fig.get('l-ring-z1'), 'both strips ringed one by one')
    assert.ok(fig.get('l-pjoin1') && fig.get('l-join1'), 'both joined by a bus')
    const tokens = fig.tokens({ id: 'seq', x: 80, y: 320, items: ['a', 'b', 'c'] })
    fig.loss({
      id: 'm',
      symbol: 'L',
      predictions: tokens.cells.map((cell) => cell.id),
      targets: ['z0', 'z2'],
      group: 'rings',
      x: 700,
      y: 300
    })
    assert.ok(fig.get('m-set1'), 'touching predictions share one frame')
  })
})

test('an arrow end picks its height on a box and stays bound', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'enc', label: 'encoder', x: 400, y: 40, w: 120, h: 200, exact: true })
    fig.box({ id: 'lat', label: 'z', x: 600, y: 60, w: 40, h: 40 })
    fig.box({ id: 'dec', label: 'decoder', x: 720, y: 40, w: 120, h: 200, exact: true })
    const p = fig.arrow({ id: 'p', from: 'enc', to: 'lat', fromAt: { y: 80 } })
    assert.deepEqual(absolutePoints(p)[0], [524, 80], 'leaves the encoder at y 80')
    assert.equal(p.startBinding.elementId, 'enc', 'still bound')
    const r = fig.arrow({ id: 'r', from: 'enc', to: 'dec', fromAt: 0.8, toAt: 0.8 })
    const path = absolutePoints(r)
    assert.equal(path.length, 3, 'straight, with the head-size point')
    assert.ok(
      path.every(([, y]) => y === 200),
      'at four fifths of both'
    )
    assert.equal(r.endBinding.elementId, 'dec')
    const down = fig.arrow({ id: 'd', from: 'lat', to: 'dec', fromSide: 'bottom', toAt: 0.9 })
    const legs = absolutePoints(down)
    assert.equal(legs[0][1], 104, 'leaves from the bottom of z')
    assert.equal(legs.at(-1)[1], 220, 'meets the decoder at nine tenths')
    assert.throws(() => fig.arrow({ id: 'bad', from: 'enc', to: 'lat', fromAt: 1.5 }), /fromAt/)
    assert.throws(
      () => fig.arrow({ id: 'bad2', from: 'enc', to: 'lat', fromAt: { y: 400 } }),
      /fromAt/
    )
  })
})

test('a panel title moves a straight arrow aside instead of round it', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'in', label: 'tokens', x: 64, y: 20, w: 176 })
    fig.box({ id: 'attn', label: 'Self-Attention', x: 64, y: 120, w: 176, h: 40, exact: true })
    fig.box({ id: 'ffn', label: 'FFN', x: 64, y: 200, w: 176, h: 40, exact: true })
    fig.panel({ id: 'block', around: ['attn', 'ffn'], title: 'Transformer block ×N' })
    const arrow = fig.arrow({ id: 'a', from: 'in', to: 'attn' })
    const path = absolutePoints(arrow)
    assert.ok(
      path.every(([x]) => x === path[0][0]),
      `straight: ${JSON.stringify(path)}`
    )
    const report = await fig.save()
    const crossing = [...report.errors, ...report.warnings].filter((finding) => finding.id === 'a')
    assert.deepEqual(crossing, [], 'clear of the title')
  })
})

test('a skip from a short arrow leaves where its head is not', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'x', label: 'x', x: 100, y: 300, w: 80, h: 32 })
    fig.box({ id: 'attn', label: 'attention', x: 100, y: 268 - 36, w: 80, h: 36 })
    fig.node({ id: 'add', kind: 'plus', cx: 140, cy: 180 })
    fig.arrow({ id: 'in', from: 'x', to: 'attn' })
    fig.arrow({ id: 'up', from: 'attn', to: 'add' })
    const skip = fig.skip({ id: 's', from: 'in', to: 'add' })
    const start = absolutePoints(skip)[0]
    const line = absolutePoints(fig.get('in'))
    const head = line.at(-1)
    assert.ok(
      Math.abs(start[1] - head[1]) >= 14,
      `the junction ${start} sits off the head at ${head}`
    )
  })
})

test('a placed loss reroutes a link off a solid arrow; routes picks each link its own', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'p', label: 'prediction', x: 100, y: 100 })
    fig.box({ id: 't', label: 'target', x: 500, y: 300 })
    fig.arrow({ id: 'wall', from: [250, 80], to: [250, 150], heads: 'none' })
    fig.loss({ id: 'l', name: 'L', predictions: 'p', targets: 't', x: 300, y: 200 })
    const crossed = pathsCross(absolutePoints(fig.get('l-in1')), absolutePoints(fig.get('wall')))
    assert.equal(crossed, false, 'the link takes the elbow clear of the arrow')
    fig.loss({ id: 'm', name: 'M', predictions: 'p', targets: 't', x: 420, y: 200, routes: ['hv'] })
    const first = absolutePoints(fig.get('m-in1'))
    assert.equal(first[0][1], first[1][1], 'the first link leaves horizontally as asked')
    assert.ok(
      pathsCross(first, absolutePoints(fig.get('wall'))),
      'a route the script gave is kept, even across an arrow'
    )
    assert.throws(
      () => fig.loss({ id: 'n', predictions: 'p', x: 1, y: 1, routes: ['up'] }),
      /route/
    )
  })
})

test('two links into a placed loss never run along each other as one trunk', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'p', label: 'prediction', x: 100, y: 20, w: 96 })
    fig.box({ id: 't', label: 'target', x: 100, y: 200, w: 96 })
    fig.loss({ id: 'l', name: 'L1 loss', predictions: 'p', targets: 't', x: 400, y: 300 })
    const [a, b] = ['l-in1', 'l-in2'].map((id) => absolutePoints(fig.get(id)))
    assert.equal(pathsCross(a, b), false, `${JSON.stringify(a)} and ${JSON.stringify(b)}`)
  })
})
