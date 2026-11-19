// Round 12 lint: the arrow-chain and label-on-head false positives from round H's scenes (steps
// meeting at a dot, labels beside a slanted head) and typeset math set under 7 pt at print.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { boxPolygonDistance } from './research-figures-geometry.mjs'
import { headBox, headTriangle } from './research-figures-labels.mjs'
import { lintFigureScene } from './research-figures-lint.mjs'
import { figureElement, newFigureScene } from './research-figures-model.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2.5 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r12l-')))
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

const found = (report, code) =>
  [...report.errors, ...report.warnings].filter((entry) => entry.code === code)

/** Round H g5-mpgd: a step to x', then its projection, each arrow bound to the dots it joins. */
function stepScene({ bound = true, slanted = true } = {}) {
  const scene = newFigureScene({ widthIn: 6.75, heightIn: 1.6 })
  const dot = (id, cx, cy) =>
    figureElement('ellipse', {
      id,
      x: cx - 3,
      y: cy - 3,
      width: 6,
      height: 6,
      strokeColor: '#1e1e1e',
      backgroundColor: '#1e1e1e',
      boundElements: []
    })
  const arrow = (id, points, from, to) =>
    figureElement('arrow', {
      id,
      x: points[0][0],
      y: points[0][1],
      width: 1,
      height: 1,
      points: points.map(([px, py]) => [px - points[0][0], py - points[0][1]]),
      endArrowhead: 'triangle',
      startBinding: bound ? { elementId: from, focus: 0, gap: 3 } : null,
      endBinding: bound ? { elementId: to, focus: 0, gap: 3 } : null,
      customData: slanted ? { asterDiagonal: true } : {}
    })
  scene.elements.push(
    dot('d-x0', 817.7, 176.4),
    dot('d-x0s', 865, 138),
    dot('d-gm', 869.8, 171),
    arrow(
      'd-g',
      [
        [820.7, 173.4],
        [846.4, 152.8],
        [862, 140.3]
      ],
      'd-x0',
      'd-x0s'
    ),
    arrow(
      'd-p',
      [
        [867.1, 141.6],
        [867.6, 147.5],
        [869.4, 167.5]
      ],
      'd-x0s',
      'd-gm'
    )
  )
  return scene
}

test('arrow-chain: steps meeting at a dot pass; a head in the middle of a line still warns', () => {
  assert.deepEqual(found(lintFigureScene(stepScene()), 'arrow-chain'), [])
  // Why still clean unbound: the dot under the meeting point is the junction.
  assert.deepEqual(found(lintFigureScene(stepScene({ bound: false })), 'arrow-chain'), [])
  const scene = newFigureScene({ widthIn: 6.75, heightIn: 1.6 })
  const run = (id, from, to) =>
    figureElement('arrow', {
      id,
      x: from[0],
      y: from[1],
      width: to[0] - from[0],
      height: 0,
      points: [
        [0, 0],
        [to[0] - from[0], to[1] - from[1]]
      ],
      endArrowhead: 'triangle'
    })
  scene.elements.push(run('one', [40, 100], [140, 100]), run('two', [142, 100], [240, 100]))
  assert.deepEqual(
    found(lintFigureScene(scene), 'arrow-chain').map((entry) => entry.id),
    ['one']
  )
  scene.elements.find((e) => e.id === 'one').customData = { asterAllow: ['arrow-chain'] }
  assert.deepEqual(found(lintFigureScene(scene), 'arrow-chain'), [])
})

test('label-on-head: the head triangle, not its box; a free label is told where to move', () => {
  const scene = newFigureScene({ widthIn: 6.75, heightIn: 1.6 })
  const vector = figureElement('arrow', {
    id: 'u',
    x: 40,
    y: 160,
    width: 60,
    height: 60,
    points: [
      [0, 0],
      [60, -60]
    ],
    endArrowhead: 'triangle',
    strokeWidth: 2,
    customData: { asterDiagonal: true }
  })
  // Round H g1/g5: a label beside a slanted head, inside the head's box but clear of its ink.
  const label = (id, x, y) =>
    figureElement('text', {
      id,
      x,
      y,
      width: 30,
      height: 14,
      text: 'u_t',
      fontSize: 14,
      fontFamily: 9,
      lineHeight: 1.25,
      strokeColor: '#1e1e1e'
    })
  const beside = label('beside', 100, 112)
  scene.elements.push(vector, beside)
  const ink = { x: 100, y: 114, width: 20, height: 9 }
  assert.ok(boxPolygonDistance(ink, headTriangle(vector)) > 2.5)
  const box = headBox(vector, false, 3)
  assert.ok(ink.x < box.right && ink.y < box.bottom, 'the old box test called this touching')
  assert.deepEqual(found(lintFigureScene(scene), 'label-on-head'), [])
  scene.elements.push(label('on', 92, 94))
  const [hit] = found(lintFigureScene(scene), 'label-on-head')
  assert.equal(hit?.id, 'on')
  assert.match(hit.message, /move on about \d+ units (right|left|up|down)/)
})

test('small-math: TeX set under 7 pt warns once per label, at the print scale', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.math({ id: 'small', tex: 'p_t(x)', x: 40, y: 40, size: 12 })
    fig.math({ id: 'fine', tex: 'p_t(x)', x: 40, y: 100, size: 16 })
    const report = await fig.save()
    assert.deepEqual(
      found(report, 'small-math').map((entry) => entry.id.split('-')[0]),
      ['small']
    )
    assert.match(found(report, 'small-math')[0].message, /6 pt at print .* set math at 16/)
  })
})
