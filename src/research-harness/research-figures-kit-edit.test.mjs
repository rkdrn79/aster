import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  TEXT_BASELINE,
  makeArrow,
  makeBox,
  makeDot,
  makeGrid,
  makeMath,
  makePolyline,
  makeStack,
  makeStopGrad,
  makeText,
  makeTrapezoid,
  openFigure
} from './research-figures-kit.mjs'
import { lintFigureScene } from './research-figures-lint.mjs'
import { figureElement, newFigureScene } from './research-figures-model.mjs'
import { glyphBounds } from './research-figures-text.mjs'

async function withFigure(run) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-edit-')))
  try {
    await mkdir(path.join(project, '.aster'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    await mkdir(path.join(project, 'paper/figures'), { recursive: true })
    const file = path.join(project, 'paper/figures/edit.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene({ widthIn: 5, heightIn: 3 })))
    await run(file)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const absolute = (arrow) => arrow.points.map(([x, y]) => [arrow.x + x, arrow.y + y])
const codes = (findings) => findings.map((finding) => `${finding.code}:${finding.id}`)

test('boxes keep an exact size, and a given size only grows to what the lint needs', () => {
  const [exact] = makeBox({ id: 'ln', label: 'Layer Norm', w: 60, h: 20, exact: true, size: 11 })
  assert.deepEqual([exact.width, exact.height], [60, 20])
  const [given, label] = makeBox({ id: 'ln', label: 'Layer Norm', w: 60, h: 20, size: 11 })
  assert.ok(given.width >= label.width + 10 && given.width < label.width + 12)
  assert.equal(given.height, 20, 'the ink of an 11-unit label fits in 20')
  const [roomy] = makeBox({ id: 'enc', label: 'Encoder' })
  assert.equal(roomy.height, 48)
  const scene = newFigureScene({ widthIn: 3, heightIn: 1 })
  scene.elements.push(
    ...makeBox({ id: 'ln', label: 'Layer Norm', x: 20, y: 20, w: 60, h: 20, size: 11 })
  )
  assert.deepEqual(codes(lintFigureScene(scene).errors), [])
})

test('arrows take a head size, a gap, exact points, chevrons, and sit under their shapes', async () => {
  await withFigure(async (file) => {
    const figure = await openFigure(file)
    figure.box({ id: 'a', label: 'A', x: 40, y: 60, w: 60, h: 40, exact: true })
    figure.box({ id: 'b', label: 'B', x: 200, y: 60, w: 60, h: 40, exact: true })
    const sized = figure.arrow({ id: 'ab', from: 'a', to: 'b', gap: 0, headSize: 6 })
    const ends = absolute(sized)
    assert.deepEqual(ends[0], [100, 80])
    assert.deepEqual(ends.at(-1), [200, 80])
    assert.deepEqual(ends.at(-2), [188, 80], 'the last segment is 2 × headSize long')
    assert.equal(sized.startBinding.elementId, 'a')
    const order = () => figure.elements.map((element) => element.id)
    assert.ok(order().indexOf('ab') < order().indexOf('a'), 'connectors sit under shapes')
    const path = [
      [70, 100],
      [70, 140],
      [230, 140],
      [230, 100]
    ]
    const exact = figure.arrow({
      id: 'loop',
      from: 'a',
      to: 'b',
      points: path,
      layer: 'top',
      headSize: 0
    })
    assert.deepEqual(absolute(exact), path)
    assert.equal(exact.endBinding.elementId, 'b')
    assert.equal(order().at(-1), 'loop')
    figure.arrow({
      id: 'open',
      from: 'b',
      to: [320, 80],
      head: 'chevron',
      headSize: 6,
      headWidth: 8
    })
    const head = figure.get('open-head')
    assert.equal(figure.get('open').endArrowhead, null)
    assert.deepEqual(absolute(head)[1], [320, 80], 'the chevron tip is the arrow end')
    assert.equal(Math.abs(absolute(head)[0][1] - absolute(head)[2][1]), 8)
    const report = await figure.save()
    assert.deepEqual(report.errors, [])
  })
})

test('labels take colour, alignment, offsets, two sizes; text a baseline; math accents', () => {
  const [box, left] = makeBox({
    id: 'p',
    label: 'predictor',
    x: 0,
    y: 0,
    w: 200,
    h: 40,
    labelAlign: 'left',
    labelColor: '#c00000'
  })
  assert.equal(left.strokeColor, '#c00000')
  assert.equal(left.textAlign, 'left')
  assert.equal(left.x, box.x + 5)
  const [, big, small] = makeBox({
    id: 'q',
    label: ['predictor ', { text: '(time-causal attention)', size: 11 }],
    x: 0,
    y: 0
  })
  assert.deepEqual([big.fontSize, small.fontSize], [16, 11])
  assert.equal(big.containerId ?? null, null, 'runs are free text grouped with the box')
  assert.ok(Math.abs(big.y + TEXT_BASELINE * 16 - (small.y + TEXT_BASELINE * 11)) < 1e-9)
  const [shifted] = makeBox({
    id: 'r',
    label: 'enc',
    x: 0,
    y: 0,
    w: 100,
    h: 40,
    labelOffset: [0, 8]
  }).slice(1)
  assert.ok(shifted.y + shifted.height / 2 > 28 - 0.01)
  const [line] = makeText({ id: 't', text: 'x', size: 13, x: 10, baseline: 50 })
  assert.ok(Math.abs(line.y + TEXT_BASELINE * 13 - 50) < 1e-9)
  const [right] = makeText({ id: 't', text: 'end', x: 100, y: 0, align: 'right' })
  assert.ok(Math.abs(right.x + right.width - 100) < 1e-9)
  const math = makeMath({ id: 'z', tex: '\\hat{z}_1', size: 13, color: '#c00000', cx: 50, y: 0 })
  assert.ok(math.width > 0)
  assert.ok(Math.abs(math.x + math.width / 2 - 50) < 1e-9)
  assert.ok(
    math.elements.some((element) => element.type === 'line' && element.id.endsWith('accent'))
  )
  assert.equal(math.elements.find((element) => element.text === '1').fontSize, 9)
  assert.equal(makeMath({ id: 'z', tex: 'z_1', size: 13, scriptSize: 10 }).elements[1].fontSize, 10)
  const scene = newFigureScene({ widthIn: 3, heightIn: 1 })
  scene.elements.push(...makeMath({ id: 's', tex: 's^(i)', x: 20, y: 20 }).elements)
  assert.ok(codes(lintFigureScene(scene).warnings).includes('math-script:s-0'))
})

test('rerunning replaces by id and keeps bindings; reset keeps only the page', async () => {
  await withFigure(async (file) => {
    const draw = async () => {
      const figure = await openFigure(file)
      figure.box({ id: 'a', label: 'A', x: 40, y: 60 })
      figure.box({ id: 'b', label: 'B', x: 240, y: 60 })
      figure.arrow({ id: 'ab', from: 'a', to: 'b', label: 'x_t' })
      figure.math({ id: 'eq', tex: '\\hat{y}', x: 40, y: 200 })
      figure.part('mlp', { id: 'mlp', x: 400, y: 60, w: 96 })
      await figure.save()
      return figure
    }
    const first = await draw()
    const count = first.elements.length
    const second = await draw()
    assert.equal(second.elements.length, count)
    const again = await openFigure(file)
    again.box({ id: 'a', label: 'A wider box', x: 40, y: 60 })
    assert.deepEqual(
      again.get('a').boundElements.map((bound) => bound.id),
      ['a-label', 'ab']
    )
    assert.equal(again.get('b').boundElements.filter((bound) => bound.id === 'ab').length, 1)
    assert.ok(again.get('mlp').width >= 96)
    assert.throws(() => again.box({ id: 'a', label: 'twice', x: 0, y: 0 }), /used twice/)
    assert.deepEqual(lintFigureScene(again.scene).errors, [])
    again.reset()
    assert.deepEqual(
      again.elements.map((element) => element.id),
      ['figure-page']
    )
  })
})

test('primitives and shapes: polyline, dot, stop-grad, grid rules, lopsided trapezoid, stack label', () => {
  const open = makePolyline({
    id: 'p',
    points: [
      [0, 0],
      [20, 10],
      [40, 0]
    ]
  })
  assert.equal(open.points.length, 3)
  assert.equal(open.backgroundColor, 'transparent')
  const [dot] = makeDot({ id: 'd', cx: 10, cy: 10, r: 4 })
  assert.deepEqual([dot.x, dot.width, dot.backgroundColor], [6, 8, dot.strokeColor])
  const arrow = makeArrow({ id: 'a', from: [0, 0], to: [100, 0] }, () => null)
  const slashes = makeStopGrad(arrow, { size: 20, spacing: 8, angle: 90 })
  const tops = slashes.map((slash) => absolute(slash))
  assert.equal(Math.hypot(tops[0][1][0] - tops[0][0][0], tops[0][1][1] - tops[0][0][1]), 20)
  assert.equal(tops[1][0][0] - tops[0][0][0], 8)
  const ruled = makeGrid({ id: 'g', rows: 1, cols: 4, cell: 10, rules: 'vertical', strokeWidth: 2 })
  assert.equal(ruled.length, 4, 'the block and three column rules')
  assert.equal(ruled[1].strokeColor, '#ffffff')
  assert.equal(ruled[0].strokeWidth, 2)
  const corners = [
    [0, 10],
    [80, 0],
    [100, 40],
    [10, 40]
  ]
  const [outline, bind] = makeTrapezoid({ id: 'tz', corners, label: 'VAE' })
  assert.deepEqual(absolute(outline).slice(0, 4), corners)
  assert.deepEqual([bind.x, bind.y, bind.width, bind.height], [0, 0, 100, 40])
  const stack = makeStack({
    id: 's',
    x: 0,
    y: 0,
    w: 40,
    h: 50,
    count: 3,
    offset: 5,
    label: 'frames'
  })
  const caption = stack.find((element) => element.id === 's-label')
  // Why 50: w × h is the stack's whole footprint, so its caption starts under h.
  assert.ok(caption.y >= 50)
})

test('overlap checks use the ink, not the 1.25 line box', () => {
  const [upper] = makeText({ id: 'u', text: 'upper', x: 20, y: 20 })
  const [lower] = makeText({ id: 'l', text: 'lower', x: 20, y: 38 })
  assert.ok(glyphBounds(upper).bottom < glyphBounds(lower).y)
  const scene = newFigureScene({ widthIn: 3, heightIn: 1 })
  const edge = figureElement('rectangle', { id: 'edge', x: 0, y: 0, width: 200, height: 39.5 })
  scene.elements.push(upper, lower, edge)
  const warnings = codes(lintFigureScene(scene).warnings)
  assert.ok(!warnings.includes('text-overlap:u'))
  assert.ok(
    !warnings.includes('text-over-shape:u'),
    'its line box crosses the edge, its ink does not'
  )
  assert.ok(!warnings.includes('text-over-shape:l'))
})
