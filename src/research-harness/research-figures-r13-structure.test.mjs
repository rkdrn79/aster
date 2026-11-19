// Round 13 structure: the U-Net helper, the bus, the ring and the cylinder, the motifs listed with
// fig.structure checked against what is drawn, the uniform look and the page that is too small.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { absolutePoints } from './research-figures-labels.mjs'
import { connectionGraph, pageFitChecks } from './research-figures-lint-structure.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2.8 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r13s-')))
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

test('unet draws levels that step down and back up, with a skip across each level', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('generative')
    const net = fig.unet({
      id: 'u',
      x: 24,
      y: 24,
      w: 320,
      h: 160,
      levels: 3,
      resolutions: ['64', '32', '16']
    })
    assert.equal(net.down.length, 3)
    assert.equal(net.skips.length, 3)
    const tops = net.down.map((id) => fig.get(id).y)
    assert.ok(tops[0] < tops[1] && tops[1] < tops[2], 'deeper levels sit lower')
    for (const [level, skip] of net.skips.entries()) {
      const arrow = fig.get(skip)
      assert.equal(arrow.startBinding.elementId, `u-d${level}`)
      assert.equal(arrow.endBinding.elementId, `u-u${level}`)
      assert.equal(arrow.strokeStyle, 'dashed')
    }
    const hour = fig.unet({
      id: 'h',
      shape: 'hourglass',
      direction: 'left',
      x: 400,
      y: 220,
      w: 300,
      h: 160,
      blocks: { enc: ['$Q$'], dec: ['$Q$'], mid: ['$K$'] }
    })
    assert.equal(hour.in, 'h-enc')
    assert.ok(fig.get('h-enc').x > fig.get('h-dec').x, 'data flows right to left')
    const report = await fig.save()
    assert.ok(!codes(report).includes('near-miss-align'), codes(report).join(', '))
    assert.ok(!codes(report).includes('stub-arrow'))
    assert.ok(!codes(report).includes('long-dash'), 'skip connections may run long')
  })
})

test('bus wires box to box port to port, and taps parallel rails without crossing', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'B', label: 'B', x: 40, y: 140, w: 32, h: 72 })
    fig.box({ id: 'A', label: 'A', x: 200, y: 40, w: 32, h: 72 })
    const { wires } = fig.bus({ id: 'ba', from: 'B', to: 'A', n: 4 })
    assert.equal(wires.length, 4)
    const turns = wires.map((wire) => absolutePoints(wire)[1][0])
    assert.ok(turns[0] < turns[1] && turns[2] < turns[3], 'the top wire turns first going up')
    for (const wire of wires) {
      assert.equal(wire.startBinding.elementId, 'B')
      assert.equal(wire.endBinding.elementId, 'A')
    }
    const rails = [0, 1, 2].map((index) => {
      fig.polyline({
        id: `r${index}`,
        points: [
          [40, 260 + index * 12],
          [500, 260 + index * 12]
        ]
      })
      return `r${index}`
    })
    fig.box({ id: 'C', label: 'C', x: 440, y: 320, w: 32, h: 60 })
    const taps = fig.bus({ id: 'rc', from: rails, to: 'C' })
    const x = taps.wires.map((wire) => absolutePoints(wire)[0][0])
    assert.ok(x[2] < x[1] && x[1] < x[0], 'the rail nearest the box turns first')
    assert.ok(fig.get('rc-1-joint0'), 'each tap has its junction dot')
    const edges = connectionGraph(fig.elements)
    assert.ok(edges.get('B').has('A'))
  })
})

test('structure: a listed loop drawn as a row is flagged until a ring closes it', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const steps = ['wood', 'table', 'zombie', 'diamond']
    steps.forEach((id, index) =>
      fig.box({ id, label: id, x: 40 + index * 96, y: 60, w: 72, h: 32 })
    )
    fig.structure({ loops: [steps], text: 'an automatic curriculum proposes tasks in a loop' })
    for (const [index, id] of steps.slice(1).entries()) {
      fig.arrow({ id: `a${index}`, from: steps[index], to: id })
    }
    const open = await fig.save()
    const finding = [...open.warnings].find((entry) => entry.code === 'missing-loop')
    assert.match(finding.message, /nothing leads from diamond to wood; its items sit in a row/)
    fig.reset()
    steps.forEach((id) => fig.box({ id, label: id, x: 40, y: 40, w: 72, h: 32 }))
    fig.ring({ id: 'loop', items: steps, cx: 300, cy: 180, r: 100 })
    fig.structure({ loops: [steps] })
    assert.ok(!codes(await fig.save()).includes('missing-loop'))
  })
})

test('structure: a text that says loop with no cycle drawn warns', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'a', label: 'propose', x: 40, y: 60, w: 72, h: 32 })
    fig.box({ id: 'b', label: 'act', x: 200, y: 60, w: 72, h: 32 })
    fig.arrow({ id: 'ab', from: 'a', to: 'b' })
    fig.structure({ text: '에이전트가 반복적으로 과제를 제안한다 (iterative prompting)' })
    assert.ok(codes(await fig.save()).includes('missing-loop'))
    fig.arrow({
      id: 'ba',
      from: 'b',
      to: 'a',
      route: 'vh',
      via: [
        [236, 140],
        [76, 140]
      ]
    })
    assert.ok(!codes(await fig.save()).includes('missing-loop'))
  })
})

test('uniform-look flags identical boxes with gray arrows; shapes or coloured arrows clear it', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('language', { look: 'preset' })
    const names = ['Tokenizer', 'Encoder', 'Retriever', 'Reader', 'Decoder', 'Ranker']
    names.forEach((label, index) =>
      fig.box({ id: `m${index}`, label, x: 24 + index * 152, y: 120, w: 112, h: 40 })
    )
    names
      .slice(1)
      .forEach((_, index) => fig.arrow({ id: `e${index}`, from: `m${index}`, to: `m${index + 1}` }))
    assert.ok(codes(await fig.save()).includes('uniform-look'))
    const again = await openFigure(file)
    again.remove('m2')
    again.cylinder({ id: 'm2', label: 'Memory', x: 328, y: 112, w: 112, h: 56, color: 'b' })
    again.arrow({ id: 'e1', from: 'm1', to: 'm2', role: 'cond' })
    const report = await again.save()
    assert.ok(!codes(report).includes('uniform-look'))
    assert.notEqual(
      again.get('e1').strokeColor,
      again.get('e0').strokeColor,
      'cond takes a world hue'
    )
  })
})

test('page-overfull: crowding on a page someone set is a note to cut, not to resize', () => {
  const findings = []
  const page = { widthIn: 3.25, heightIn: 1.6, sizeBy: 'person' }
  const report = {
    errors: [],
    warnings: ['stub-arrow', 'stub-arrow', 'label-on-head', 'text-over-shape'].map((code) => ({
      code
    }))
  }
  pageFitChecks(page, report, (level, code, _element, message) =>
    findings.push({ level, code, message })
  )
  assert.equal(findings[0].level, 'note')
  assert.match(findings[0].message, /does not fit the 3.25 × 1.6 in page.*keep its size/)
  findings.length = 0
  pageFitChecks(
    { ...page, sizeBy: 'agent' },
    { errors: [], warnings: report.warnings.slice(0, 2) },
    (...args) => findings.push(args)
  )
  assert.equal(findings.length, 0, 'two findings of one kind are not a page that is too small')
})

test('a plot embedded in a cell is rendered at that cell, and keeps it on later runs', async (t) => {
  const { findPlotPython, createPlot, runPlot } = await import('./research-figures-plot.mjs')
  if (!(await findPlotPython())) {
    t.skip('no Python with numpy and matplotlib')
    return
  }
  await withFigure(async (file) => {
    const project = path.dirname(path.dirname(path.dirname(file)))
    await createPlot(project, { name: 'fig-cell', slug: 'fig-cell', kind: 'blank' })
    const source = path.join(project, '.aster/figures/src/fig-cell.plot.py')
    await writeFile(
      source,
      'import aster_plot as ap\np, ax = ap.figure(size=(2.0, 1.5), panel=True)\nax.plot([0, 1], [0, 1])\np.save()\n'
    )
    assert.ok((await runPlot(project, 'fig-cell')).saved)
    const fig = await openFigure(file)
    const placed = await fig.plot({ id: 'p', figure: 'fig-cell', x: 40, y: 40, w: 216, h: 144 })
    assert.equal(Math.round(placed.width), 216)
    assert.equal(Math.round(placed.height), 144)
    assert.equal(placed.scale, 1, 'rendered at the cell, not scaled into it')
    const again = await runPlot(project, 'fig-cell')
    assert.ok(again.saved)
  })
})

test('a loop may name a group, and TeX typed as plain text is flagged', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'p1', label: 'task one', x: 40, y: 40, w: 72, h: 32 })
    fig.box({ id: 'p2', label: 'task two', x: 40, y: 88, w: 72, h: 32 })
    fig.group({ id: 'tasks', ids: ['p1', 'p2'] })
    fig.box({ id: 'agent', label: 'agent', x: 240, y: 64, w: 72, h: 32 })
    fig.arrow({ id: 'go', from: 'tasks', to: 'agent' })
    fig.arrow({
      id: 'back',
      from: 'agent',
      to: 'tasks',
      route: 'vh',
      via: [
        [276, 160],
        [76, 160]
      ]
    })
    fig.structure({ loops: [['tasks', 'agent']] })
    fig.text({ id: 'b', text: 'B_t', x: 400, y: 40 })
    // Why typeset: a box label typed as bare TeX (B_t, \\tau_\\theta) is math, never backslashes.
    fig.box({ id: 'tau', label: '\\tau_\\theta', x: 400, y: 120, w: 48, h: 32 })
    const report = await fig.save()
    const found = codes(report)
    assert.ok(!found.includes('missing-loop'), found.join(', '))
    assert.ok(found.includes('literal-math'))
    assert.ok(
      fig.elements.some((element) => element.customData?.asterMath === '\\tau_\\theta'),
      'the box label is typeset'
    )
    const placed = fig.image({ id: 'pic', kind: 'cat', x: 500, y: 40 })
    assert.ok(placed.asterPlaced, 'an image is placed at once, so save need not wait for it')
  })
})
