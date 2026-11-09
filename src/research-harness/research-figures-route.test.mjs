import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { makeArrow, makeBox, openFigure } from './research-figures-kit.mjs'
import { absolutePoints } from './research-figures-labels.mjs'
import { lintFigureScene } from './research-figures-lint.mjs'
import { figureElement, newFigureScene } from './research-figures-model.mjs'
import { orthogonalize } from './research-figures-route.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 3.6 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-route-')))
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

/** The arrow's corners, without the point the kit adds to size its head. */
function corners(element) {
  const points = absolutePoints(element).map(([x, y]) => [Math.round(x), Math.round(y)])
  return points.filter((point, index) => {
    const [before, after] = [points[index - 1], points[index + 1]]
    return (
      !before ||
      !after ||
      !(
        (before[0] === point[0] && point[0] === after[0]) ||
        (before[1] === point[1] && point[1] === after[1])
      )
    )
  })
}

const axisAligned = (element) =>
  absolutePoints(element)
    .slice(1)
    .every((point, index, rest) => {
      const before = index ? rest[index - 1] : absolutePoints(element)[0]
      return Math.abs(point[0] - before[0]) <= 0.5 || Math.abs(point[1] - before[1]) <= 0.5
    })

const codes = (report) => [...report.errors, ...report.warnings].map((entry) => entry.code)

test('REPA-style elbows: one sharp bend each, arriving on the side that faces the turn', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    for (let index = 0; index < 4; index += 1) {
      fig.box({ id: `b${index}`, label: 'DiT block', x: 360, y: 352 - index * 52, w: 224, h: 40 })
    }
    fig.box({ id: 'ra', label: 'Alignment', x: 20, y: 150, w: 160, h: 56, color: 'white' })
    fig.box({ id: 'mlp', label: 'MLP', x: 216, y: 222, w: 64, h: 34, color: 'accent' })
    fig.arrow({ id: 'tomlp', from: 'b1', to: 'mlp' })
    fig.arrow({ id: 'tora', from: 'mlp', to: 'ra' })
    // The block's left side, left to the MLP's centre, then up into its bottom.
    assert.deepEqual(corners(fig.get('tomlp')), [
      [356, 320],
      [248, 320],
      [248, 260]
    ])
    // The MLP's top, up to the alignment box's centre line, then left into its right side.
    assert.deepEqual(corners(fig.get('tora')), [
      [248, 218],
      [248, 178],
      [184, 178]
    ])
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
    assert.ok(!codes(report).includes('elbow-hug') && !codes(report).includes('many-bends'))
  })
})

test('routes keep clear of boxes, snap near-aligned ends straight, and slide junctions level', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    for (const [index, name] of ['a', 'b', 'c'].entries()) {
      fig.box({ id: name, label: name.toUpperCase(), x: 40 + index * 120, y: 40, w: 60, h: 40 })
    }
    fig.arrow({ id: 'ac', from: 'a', to: 'c' })
    const around = corners(fig.get('ac'))
    assert.equal(around.length, 4, 'two bends around the box in between')
    assert.ok(around[1][1] >= 80 + 8 || around[1][1] <= 40 - 8, JSON.stringify(around))
    fig.arrow({ id: 'pp', from: [40, 300], to: [200, 305] })
    assert.deepEqual(corners(fig.get('pp')), [
      [40, 300],
      [200, 300]
    ])
    fig.box({ id: 'enc', label: 'encoder', x: 420, y: 300, w: 120, h: 40 })
    fig.box({ id: 'dec', label: 'decoder', x: 420, y: 160, w: 120, h: 40 })
    fig.box({ id: 'mlp', label: 'MLP', x: 600, y: 222, w: 80, h: 40 })
    fig.arrow({ id: 'ed', from: 'enc', to: 'dec' })
    fig.arrow({ id: 'ht', from: { on: 'ed', at: 'auto' }, to: 'mlp' })
    assert.deepEqual(corners(fig.get('ht')), [
      [480, 242],
      [596, 242]
    ])
    assert.equal(fig.get('ht-joint0').y + fig.get('ht-joint0').height / 2, 242)
    // A number is where the dot goes: it stays, and the branch bends instead.
    fig.arrow({ id: 'fixed', from: { on: 'ed', at: 0.25 }, to: 'mlp' })
    const dot = fig.get('fixed-joint0')
    const [first] = corners(fig.get('fixed'))
    assert.deepEqual(first, [dot.x + dot.width / 2, dot.y + dot.height / 2].map(Math.round))
    assert.ok(corners(fig.get('fixed')).length >= 3, 'it bends instead of moving the dot')
    assert.throws(
      () => fig.arrow({ id: 'bad', from: { on: 'ed', x: 480 }, to: 'mlp' }),
      /runs along x 480/
    )
    assert.throws(
      () => fig.arrow({ id: 'bad', from: { on: 'ed', at: 1.5 }, to: 'mlp' }),
      /fraction/
    )
    for (const arrow of fig.elements.filter((element) => element.type === 'arrow')) {
      assert.ok(axisAligned(arrow), arrow.id)
    }
  })
})

test('a diagonal needs allowDiagonal; hand-given points get corners', () => {
  const box = (id, x, y) => makeBox({ id, label: id, x, y, w: 60, h: 40 })
  const shapes = [...box('p', 0, 0), ...box('q', 200, 120)]
  const lookup = (id) => shapes.find((element) => element.id === id)
  const routed = makeArrow({ id: 'r', from: 'p', to: 'q' }, lookup, { elements: shapes })
  assert.ok(axisAligned(routed))
  assert.equal(corners(routed).length, 3, 'one elbow')
  const slanted = makeArrow({ id: 's', from: 'p', to: 'q', allowDiagonal: true }, lookup)
  assert.equal(slanted.customData.asterDiagonal, true)
  assert.ok(!axisAligned(slanted))
  assert.deepEqual(
    orthogonalize([
      [0, 0],
      [100, 60],
      [104, 200]
    ]),
    [
      [0, 0],
      [100, 0],
      [100, 60],
      [100, 200]
    ]
  )
})

test('route lint: slanted segments, many bends, hugging an edge, near misses, uneven gaps', () => {
  const scene = newFigureScene({ widthIn: 6.75, heightIn: 3 })
  const add = (...items) => scene.elements.push(...items)
  add(...makeBox({ id: 'a', label: 'A', x: 20, y: 40, w: 60, h: 40 }))
  add(...makeBox({ id: 'b', label: 'B', x: 120, y: 40, w: 60, h: 40 }))
  add(...makeBox({ id: 'c', label: 'C', x: 236, y: 40, w: 60, h: 40 }))
  add(...makeBox({ id: 'd', label: 'D', x: 20, y: 120, w: 60, h: 40 }))
  add(...makeBox({ id: 'e', label: 'E', x: 120, y: 125, w: 60, h: 40 }))
  add(...makeBox({ id: 'wall', label: 'wall', x: 400, y: 200, w: 120, h: 40 }))
  const line = (id, points) =>
    figureElement('arrow', {
      id,
      x: points[0][0],
      y: points[0][1],
      points: points.map(([x, y]) => [x - points[0][0], y - points[0][1]]),
      endArrowhead: 'triangle'
    })
  add({
    ...line('de', [
      [80, 145],
      [120, 145]
    ]),
    startBinding: { elementId: 'd', focus: 0, gap: 4 },
    endBinding: { elementId: 'e', focus: 0, gap: 4 }
  })
  add(
    line('slant', [
      [20, 300],
      [120, 360]
    ])
  )
  add(
    line('zigzag', [
      [600, 20],
      [640, 20],
      [640, 60],
      [680, 60],
      [680, 100]
    ])
  )
  add(
    line('hug', [
      [380, 160],
      [460, 160],
      [460, 198],
      [560, 198]
    ])
  )
  const report = lintFigureScene(scene)
  const found = (code) =>
    [...report.errors, ...report.warnings].filter((entry) => entry.code === code)
  assert.deepEqual(
    report.errors.filter((entry) => entry.code === 'diagonal-segment').map((entry) => entry.id),
    ['slant']
  )
  assert.deepEqual(
    found('many-bends').map((entry) => entry.id),
    ['zigzag']
  )
  assert.deepEqual(
    found('elbow-hug').map((entry) => entry.id),
    ['hug']
  )
  assert.deepEqual(
    found('near-miss-align').map((entry) => entry.id),
    ['e']
  )
  assert.deepEqual(
    found('uneven-spacing').map((entry) => entry.id),
    ['b']
  )
})

test('lint precision: rows need a parent and a reason; stubs, chains, hidden arrows, fractions', async () => {
  await withFigure(
    async (file) => {
      const fig = await openFigure(file)
      // Two panels side by side: boxes in different panels are not one row.
      fig.box({ id: 'p1a', label: 'encoder', x: 40, y: 60 })
      fig.box({ id: 'p2a', label: 'decoder', x: 330, y: 63 })
      fig.panel({ id: 'left', around: ['p1a'], title: 'stage 1' })
      fig.panel({ id: 'right', around: ['p2a'], title: 'stage 2' })
      // A card with bars inside is not an empty box; an intentional one passes too.
      fig.box({ id: 'card', label: 'memory', x: 560, y: 40, w: 200, h: 120, color: 'block' })
      fig.box({ id: 'bar1', label: '', x: 580, y: 100, w: 12, h: 40, color: 'strong' })
      fig.box({ id: 'wide', label: 'gate', x: 560, y: 200, w: 200, h: 90, intentional: true })
      // A stub, a chain of two arrows, and an arrow under a box drawn later.
      fig.arrow({ id: 'stub', from: [40, 300], to: [50, 300] })
      fig.arrow({ id: 'one', from: [100, 300], to: [180, 300] })
      fig.arrow({ id: 'two', from: [180, 300], to: [260, 300] })
      fig.arrow({ id: 'under', from: [300, 400], to: [500, 400] })
      fig.box({ id: 'lid', label: 'lid', x: 360, y: 380, w: 60, h: 40 })
      fig.math({ id: 'frac', tex: '\\frac{1}{N}', x: 40, y: 420 })
      const report = await fig.save()
      const found = (code) =>
        [...report.errors, ...report.warnings]
          .filter((entry) => entry.code === code)
          .map((entry) => entry.id)
      assert.deepEqual(found('near-miss-align'), [])
      assert.ok(!found('empty-box').includes('card') && !found('empty-box').includes('wide'))
      assert.deepEqual(found('stub-arrow'), ['stub'])
      assert.deepEqual(found('arrow-chain'), ['one'])
      assert.deepEqual(found('hidden-arrow'), ['under'])
      assert.ok(found('small-script').length === 1)
    },
    { widthIn: 6.75, heightIn: 3.4 }
  )
})

test('skip, fork and merge: one dot each, orthogonal branches, the lane clear of the blocks', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'ln', label: 'Layer norm', x: 80, y: 300, w: 160, h: 32 })
    fig.box({ id: 'attn', label: 'Attention', x: 80, y: 220, w: 160, h: 40 })
    fig.node({ id: 'add', kind: 'add', cx: 160, cy: 160 })
    fig.arrow({ id: 'in', from: [160, 400], to: 'ln' })
    fig.arrow({ id: 'a2', from: 'attn', to: 'add' })
    const skip = fig.skip({ id: 'res', from: { on: 'in', at: 0.5 }, to: 'add' })
    const path = corners(skip)
    assert.equal(path.length, 4, 'out, along the lane, in')
    assert.ok(path[1][0] <= 80 - 16, `the lane ${path[1][0]} clears the blocks`)
    assert.equal(skip.endBinding.elementId, 'add')
    fig.box({ id: 'src', label: 'router', x: 380, y: 200, w: 90, h: 36 })
    for (let i = 0; i < 3; i += 1) {
      fig.box({ id: `e${i}`, label: `E${i + 1}`, x: 560, y: 120 + i * 80, w: 70, h: 36 })
    }
    const fork = fig.fork({ id: 'fk', from: 'src', to: ['e0', 'e1', 'e2'] })
    assert.equal(fork.branches.length, 3)
    const at = [fork.dot.x + fork.dot.width / 2, fork.dot.y + fork.dot.height / 2]
    for (const branch of fork.branches) {
      assert.deepEqual(absolutePoints(branch)[0], at, 'every branch leaves the one dot')
      assert.ok(axisAligned(branch))
    }
    fig.box({ id: 'sum', label: 'combine', x: 740, y: 200, w: 100, h: 36 })
    const merge = fig.merge({ id: 'mg', from: ['e0', 'e1', 'e2'], to: 'sum' })
    const join = [merge.dot.x + merge.dot.width / 2, merge.dot.y + merge.dot.height / 2]
    for (const branch of merge.branches) {
      assert.deepEqual(absolutePoints(branch).at(-1), join, 'every branch meets at the dot')
    }
    assert.equal(merge.trunk.endBinding.elementId, 'sum')
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
  })
})
