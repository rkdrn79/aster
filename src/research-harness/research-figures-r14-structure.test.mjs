// Round 14 structure: planar wiring (bus between boxes, rails and lists, rails through bars, a
// fork onto a shared rail, trunks that keep room), U-Net cards that fit their labels, and
// fig.structure links followed through chains, groups and the U-Net's own skips.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { absolutePoints } from './research-figures-labels.mjs'
import { bareTexLabel } from './research-figures-draw.mjs'
import { forkSpot } from './research-figures-kit-rail.mjs'
import { wireCrossings } from './research-figures-kit-wiring.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2.8 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r14s-')))
  try {
    const folder = path.join(project, '.aster/figures')
    await mkdir(folder, { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const file = path.join(folder, 'fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene(size)))
    await run(file)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const codes = (report) =>
  [...report.errors, ...report.warnings, ...report.notes].map((entry) => entry.code)
const paths = (wires) => wires.map((wire) => absolutePoints(wire))
/** Kit warnings printed while `run` runs. */
async function kitWarnings(run) {
  const seen = []
  const original = console.warn
  console.warn = (message) => seen.push(String(message))
  try {
    await run()
  } finally {
    console.warn = original
  }
  return seen
}

test('bus: a column of cells into one box, pairs and a same-side C route never cross', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const cells = [0, 1, 2, 3].map((index) => {
      fig.box({ id: `h${index}`, label: `${index + 1}`, x: 40, y: 40 + index * 32, w: 40, h: 24 })
      return `h${index}`
    })
    fig.box({ id: 'C', label: 'C', x: 240, y: 240, w: 96, h: 32 })
    const many = fig.bus({ id: 'read', from: cells, to: 'C', toSide: 'top' })
    assert.equal(many.wires.length, 4)
    assert.deepEqual(many.crossings, { wires: 0, lanes: 0 })
    assert.equal(wireCrossings(paths(many.wires)).wires, 0)
    for (const [index, wire] of many.wires.entries()) {
      assert.equal(wire.startBinding.elementId, cells[index])
      assert.equal(wire.endBinding.elementId, 'C')
    }
    // Pairs: source i to target i.
    fig.box({ id: 'a', label: 'a', x: 480, y: 40, w: 48, h: 32 })
    fig.box({ id: 'b', label: 'b', x: 480, y: 120, w: 48, h: 32 })
    fig.box({ id: 'p', label: 'p', x: 720, y: 72, w: 48, h: 32 })
    fig.box({ id: 'q', label: 'q', x: 720, y: 152, w: 48, h: 32 })
    const pairs = fig.bus({ id: 'pq', from: ['a', 'b'], to: ['p', 'q'] })
    assert.equal(pairs.crossings.wires, 0)
    assert.equal(pairs.wires[1].endBinding.elementId, 'q')
    // Both on their left sides: a C round both boxes, turning left of them.
    fig.box({ id: 'm', label: 'm', x: 600, y: 240, w: 64, h: 32 })
    const c = fig.bus({ id: 'cc', from: ['a', 'b'], to: 'm', fromSide: 'left', toSide: 'left' })
    for (const points of paths(c.wires)) {
      assert.ok(points[1][0] < 476, 'the C turns outside the boxes it joins')
    }
    assert.equal(c.crossings.wires, 0)
  })
})

test('bus: a box joins rails with dots and no heads; rails through bars break at each bar', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'B', label: 'B', x: 200, y: 40, w: 40, h: 120, bar: true })
    fig.box({ id: 'A', label: 'A', x: 400, y: 40, w: 40, h: 120, bar: true })
    const lanes = fig.rails({
      id: 'h',
      n: 4,
      x: 40,
      y: 64,
      w: 600,
      spacing: 24,
      through: ['B', 'A']
    })
    assert.equal(lanes.lanes.length, 4)
    assert.equal(lanes.stretches.length, 3)
    assert.equal(fig.get('h-1-1').endBinding.elementId, 'B')
    assert.equal(fig.get('h-1-2').startBinding.elementId, 'B')
    assert.equal(fig.get('h-1-2').endBinding.elementId, 'A')
    assert.throws(
      () => fig.rails({ id: 'bad', n: 4, x: 40, y: 140, w: 600, spacing: 24, through: ['B'] }),
      /does not span the lanes? at y/
    )
    // A box under the first stretch joins each lane of it (the lanes cross, so it warns).
    fig.box({ id: 'X', label: 'X', x: 48, y: 240, w: 48, h: 48 })
    let joined
    const warned = await kitWarnings(() => {
      joined = fig.bus({ id: 'in', from: 'X', to: lanes.stretches[0], fromSide: 'right' })
    })
    assert.equal(joined.wires.length, 4)
    for (const wire of joined.wires) {
      assert.equal(wire.endArrowhead, null, 'a wire joining a lane has no head')
    }
    assert.ok(fig.get('in-1-joint1'), 'it joins the lane at a dot')
    assert.equal(joined.crossings.wires, 0)
    assert.ok(joined.crossings.lanes > 0)
    assert.ok(warned.some((line) => /cross other rails/.test(line)))
  })
})

test('fork: a row of targets beside the source hangs off a rail; small gaps warn', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 's', label: 'x', x: 24, y: 120, w: 56, h: 32 })
    const row = ['v1', 'v2', 'v3']
    row.forEach((id, index) =>
      fig.box({ id, label: id, x: 160 + index * 120, y: 112, w: 72, h: 48 })
    )
    const made = fig.fork({ id: 'f', from: 's', to: row, labels: ['a', 'b', 'c'] })
    assert.ok(made.rails.length >= 1, 'targets in a row take a rail')
    const boxes = row.map((id) => fig.bounds(id))
    for (const [index, branch] of made.branches.entries()) {
      const points = absolutePoints(branch)
      const x = points[0][0]
      assert.ok(Math.abs(x - (boxes[index].x + boxes[index].width / 2)) < 1, 'drops at the centre')
      assert.ok(
        points.every(([, y]) => y <= boxes[index].y),
        'never runs through a target'
      )
      assert.equal(branch.endBinding.elementId, row[index])
    }
    // A forced axis keeps the dot fork; a 22-unit gap is too tight and says so.
    fig.box({ id: 'src', label: 'P', x: 40, y: 300, w: 64, h: 32 })
    fig.box({ id: 't1', label: 'B', x: 24, y: 246, w: 40, h: 32 })
    fig.box({ id: 't2', label: 'C', x: 120, y: 246, w: 40, h: 32 })
    const warned = await kitWarnings(() =>
      fig.fork({ id: 'g', from: 'src', to: ['t1', 't2'], axis: 'y' })
    )
    assert.ok(warned.some((line) => /fork g: only 22 units/.test(line)))
    assert.deepEqual(forkSpot(100, 160), { value: 128, tight: false })
    assert.equal(forkSpot(100, 142).value, 120)
    assert.ok(forkSpot(100, 122).tight)
  })
})

test('unet: hourglass cards fit their labels and its skips satisfy structure', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('generative')
    const h = fig.unet({
      id: 'h',
      shape: 'hourglass',
      x: 40,
      y: 40,
      w: 248,
      h: 136,
      levels: 2,
      skips: 'below',
      blocks: { enc: ['conv', 'QKV'], dec: ['QKV', { label: 'conv', color: 'b' }] }
    })
    assert.equal(h.cards.enc.length, 2)
    assert.equal(h.cards.dec.length, 2)
    const need = fig.measure('box', { label: 'QKV', w: 8, h: 8 }).width
    assert.ok(fig.bounds(h.cards.enc[1]).width >= need - 0.5, 'QKV fits its card')
    for (const skip of h.skips) {
      assert.ok(fig.get(skip).y > fig.bounds('h-enc').y, 'skips: below draws them under')
      assert.deepEqual(fig.get(skip).customData.asterLink, {
        from: 'h-enc',
        to: 'h-dec',
        unet: 'h'
      })
    }
    fig.structure({
      skips: [
        ['h', 'h'],
        ['h-enc', 'h-dec']
      ]
    })
    const report = await fig.save()
    assert.ok(!codes(report).includes('missing-link'), codes(report).join(', '))
    assert.ok(!codes(report).includes('text-overflow'), codes(report).join(', '))
  })
})

test('structure: feedback through a chain in one role or through a dot counts; data through a module does not', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'mlp', label: 'MLP', x: 40, y: 40, w: 72, h: 32 })
    fig.box({ id: 'render', label: 'render', x: 240, y: 40, w: 72, h: 32 })
    fig.box({ id: 'loss', label: 'loss', x: 440, y: 40, w: 72, h: 32 })
    fig.arrow({ id: 'f1', from: 'mlp', to: 'render' })
    fig.arrow({ id: 'f2', from: 'render', to: 'loss' })
    fig.arrow({
      id: 'g1',
      from: 'loss',
      to: 'render',
      role: 'grad',
      route: 'vh',
      via: [
        [476, 120],
        [276, 120]
      ]
    })
    fig.arrow({
      id: 'g2',
      from: 'render',
      to: 'mlp',
      role: 'grad',
      route: 'vh',
      via: [
        [276, 140],
        [76, 140]
      ]
    })
    fig.box({ id: 'a', label: 'a', x: 40, y: 200, w: 72, h: 32 })
    fig.node({ id: 'sg', symbol: 'minus', cx: 276, cy: 216 })
    fig.box({ id: 'b', label: 'b', x: 440, y: 200, w: 72, h: 32 })
    fig.arrow({ id: 'a-sg', from: 'a', to: 'sg' })
    fig.arrow({ id: 'sg-b', from: 'sg', to: 'b' })
    fig.group({ id: 'col', ids: ['mlp', 'a'] })
    fig.structure({
      feedback: [
        ['loss', 'mlp'],
        ['a', 'b'],
        ['mlp', 'loss']
      ],
      fanouts: [{ from: 'col', to: ['render', 'sg'] }]
    })
    const report = await fig.save()
    const links = [...report.warnings].filter((entry) => entry.code === 'missing-link')
    assert.equal(links.length, 1, 'only the data path through a module stays missing')
    assert.match(links[0].message, /mlp → loss/)
    assert.doesNotMatch(links[0].message, /loss → mlp|a → b/)
    assert.ok(!codes(report).includes('missing-fanout'), 'a group names the column it holds')
    fig.structure({ fanouts: [{ from: 'h-t', to: ['render'] }] })
    const missing = [...(await fig.save()).warnings].find(
      (entry) => entry.code === 'missing-fanout'
    )
    assert.match(missing.message, /no item h-t/)
  })
})

test('bare TeX in a box label is typeset; words and $…$ stay as written', () => {
  assert.equal(bareTexLabel('\\tau_\\theta'), '$\\tau_\\theta$')
  assert.equal(
    bareTexLabel('Denoising U-Net \\epsilon_\\theta'),
    'Denoising U-Net $\\epsilon_\\theta$'
  )
  assert.equal(bareTexLabel('h_{t-1}'), '$h_{t-1}$')
  assert.equal(bareTexLabel('Encoder'), 'Encoder')
  assert.equal(bareTexLabel('$x_t$ in'), '$x_t$ in')
  assert.equal(bareTexLabel('snake_case_name'), 'snake_case_name')
})
