// Round 13 lint false positives: a preset's own accent is not a library colour, a family of one
// colour beside other hues is not a monotone figure, and the deliberate cases can be allowed.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'

async function withFigure(run) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r13l-')))
  try {
    const folder = path.join(project, '.aster/figures')
    await mkdir(folder, { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const file = path.join(folder, 'fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene({ widthIn: 6.75, heightIn: 2 })))
    await run(file)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const codes = (report) =>
  [...report.errors, ...report.warnings, ...report.notes].map((entry) => entry.code)

test('library-color passes the preset’s own accent and data cells', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('illustrative')
    fig.box({ id: 'ours', label: 'Planner', x: 40, y: 40, w: 120, h: 40, color: 'accent-solid' })
    fig.grid({
      id: 'c',
      x: 200,
      y: 40,
      rows: 2,
      cols: 2,
      cell: 20,
      fills: [
        ['#22c55e', null],
        [null, '#22c55e']
      ]
    })
    assert.ok(!codes(await fig.save()).includes('library-color'))
    fig.box({ id: 'tw', label: 'Critic', x: 300, y: 40, w: 120, h: 40, fill: '#3b82f6' })
    assert.ok(codes(await fig.save()).includes('library-color'))
    fig.allow('library-color', ['tw'])
    assert.ok(!codes(await fig.save()).includes('library-color'))
  })
})

test('monotone-figure: one colour for one role beside other hues passes; a mono figure can be allowed', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('generative')
    const inputs = ['Semantic map', 'Text', 'Representations', 'Images']
    inputs.forEach((label, index) =>
      fig.box({ id: `in${index}`, label, x: 24, y: 24 + index * 48, w: 136, h: 32, color: 'd' })
    )
    fig.box({ id: 'enc', label: 'Encoder', x: 240, y: 60, w: 96, h: 40, color: 'c' })
    assert.ok(!codes(await fig.save()).includes('monotone-figure'))
    const again = await openFigure(file)
    again.box({ id: 'enc', label: 'Encoder', x: 240, y: 60, w: 96, h: 40, color: 'd' })
    assert.ok(codes(await again.save()).includes('monotone-figure'), 'one hue on every module type')
    again.allow('monotone-figure')
    assert.ok(!codes(await again.save()).includes('monotone-figure'))
  })
})

test('a card of prose is content, not a module type', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('graphite')
    const lines = [
      'Put the strawberry into the bowl',
      'Pick the nearly falling bag',
      'Pick the object that is different',
      'Move the can to the left'
    ]
    lines.forEach((label, index) =>
      fig.box({ id: `b${index}`, label, x: 24, y: 24 + index * 56, w: 320, h: 40 })
    )
    assert.ok(!codes(await fig.save()).includes('monotone-figure'))
  })
})
