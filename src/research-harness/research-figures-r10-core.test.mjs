import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { nonFiniteFields, suspectOptions } from './research-figures-kit-validate.mjs'
import {
  checkFigureScene,
  figureElement,
  newFigureScene,
  repairFigureScene
} from './research-figures-model.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 3 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r10-')))
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

test('the kit never draws NaN: the error names the call, the id and the option', async () => {
  assert.deepEqual(
    nonFiniteFields({
      x: Number.NaN,
      points: [
        [0, 0],
        [1, Infinity]
      ]
    }),
    ['x', 'points[1][1]']
  )
  assert.deepEqual(suspectOptions({ x: 4, cell: 'wide', w: Number.NaN }), [
    'cell: "wide"',
    'w: NaN'
  ])
  assert.deepEqual(suspectOptions({ x: 4, cell: [40, 20] }), ['cell: [40,20]'], 'a pair last')
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    assert.throws(
      () => fig.box({ id: 'b', x: 10, y: 10, w: 'wide', h: 20 }),
      /fig\.box\(\{ id: 'b' \}\) drew b with width = NaN.*Check w: "wide"/
    )
    fig.box({ id: 'ok', x: 10, y: 10, w: 40, h: 20 })
    fig.get('ok').y = Number.NaN
    const before = await readFile(file, 'utf8')
    await assert.rejects(fig.save(), /ok has y = NaN/)
    assert.equal(await readFile(file, 'utf8'), before, 'nothing written')
  })
})

test('a scene with NaN geometry (null on disk) opens without the broken elements', () => {
  const scene = newFigureScene({ widthIn: 3.25, heightIn: 2 })
  const box = figureElement('rectangle', { id: 'box', x: 0, y: 0, width: 40, height: 20 })
  const broken = {
    ...figureElement('rectangle', { id: 'cell', width: 40, height: 20 }),
    x: null,
    boundElements: [{ type: 'text', id: 'cell-text' }]
  }
  const label = figureElement('text', {
    id: 'cell-text',
    text: 'a',
    width: 8,
    height: 20,
    containerId: 'cell'
  })
  const link = {
    ...figureElement('arrow', { id: 'link', width: 40, height: 0 }),
    points: [
      [0, 0],
      [40, 0]
    ],
    startBinding: { elementId: 'box' },
    endBinding: { elementId: 'cell' }
  }
  const line = {
    ...figureElement('line', { id: 'line', width: 40, height: 0 }),
    points: [
      [0, 0],
      [null, 0]
    ]
  }
  scene.elements.push(box, broken, label, link, line)
  const disk = JSON.parse(JSON.stringify(scene))
  assert.ok(checkFigureScene(disk).length, 'the raw file does not open')
  const { scene: repaired, repairs } = repairFigureScene(disk)
  assert.deepEqual(repairs, ['Dropped cell: x not a number', 'Dropped line: points not a number'])
  assert.deepEqual(checkFigureScene(repaired), [])
  const byId = new Map(repaired.elements.map((element) => [element.id, element]))
  assert.equal(byId.get('cell-text').containerId, null)
  assert.equal(byId.get('link').endBinding, null)
  assert.equal(byId.get('link').startBinding.elementId, 'box')
  assert.equal(repairFigureScene(scene).repairs.length, 2, 'NaN in memory too')
  const clean = newFigureScene({ widthIn: 3.25, heightIn: 2 })
  assert.equal(repairFigureScene(clean).scene, clean, 'a sound scene is returned as is')
})
