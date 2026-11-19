// Round 13 arrows: short arrows keep a shaft, labels clear their heads, fromAt { y } takes a share,
// labels print as words unless they hold math, and arrows end on lines by id.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { flowLabel } from './research-figures-labels.mjs'

async function withFigure(run, size = { widthIn: 3.25, heightIn: 1.6 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r13a-')))
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

test('arrows between close boxes keep a shaft, and their labels clear the head', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('generative')
    for (const [index, gap] of [16, 32].entries()) {
      const y = 24 + index * 56
      fig.box({ id: `a${index}`, label: 'E', x: 24, y, w: 40, h: 32 })
      fig.box({ id: `b${index}`, label: 'D', x: 64 + gap, y, w: 40, h: 32 })
      fig.arrow({ id: `ar${index}`, from: `a${index}`, to: `b${index}`, label: 'K, V' })
    }
    assert.equal(fig.get('ar0').points.at(-1)[0], 12, 'a 16-unit gap leaves a 12-unit arrow')
    const report = await fig.save()
    assert.deepEqual(found(report, 'stub-arrow'), [])
    assert.deepEqual(found(report, 'label-on-head'), [])
  })
})

test('fromAt { y } takes a share of the side, and picks a left or right side', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'tall', label: 'B', x: 40, y: 40, w: 32, h: 120 })
    fig.box({ id: 'out', label: 'A', x: 200, y: 40, w: 48, h: 32 })
    const share = fig.arrow({ id: 's', from: 'tall', to: 'out', fromAt: { y: 0.25 } })
    assert.equal(share.y, 70)
    assert.equal(share.x, 76, 'leaves the right side, facing the target')
    const absolute = fig.arrow({ id: 'abs', from: 'tall', to: 'out', fromAt: { y: 120 } })
    assert.equal(absolute.y, 120)
  })
})

test('arrow and lane labels print as words unless they hold math', () => {
  assert.deepEqual(flowLabel('Env Feedback\nExecution Errors'), [
    'Env Feedback',
    '\n',
    'Execution Errors'
  ])
  assert.deepEqual(flowLabel('x_t'), [{ tex: 'x_t', auto: true }])
  assert.deepEqual(flowLabel('K, V'), [{ tex: 'K, V', auto: true }])
  assert.deepEqual(flowLabel('score $r_t$'), ['score $r_t$'])
})

test('an arrow ends on a polyline by its id, with no dot under its head', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.polyline({
      id: 'rail',
      points: [
        [40, 120],
        [400, 120]
      ]
    })
    fig.box({ id: 'src', label: 'B', x: 180, y: 30, w: 48, h: 32 })
    const arrow = fig.arrow({ id: 'tap', from: 'src', to: 'rail' })
    const tip = [arrow.x + arrow.points.at(-1)[0], arrow.y + arrow.points.at(-1)[1]]
    assert.equal(Math.round(tip[1]), 120)
    assert.equal(Math.round(tip[0]), 204, 'level with the box')
    assert.throws(() => fig.get('tap-joint1'), /No element/)
    const branch = fig.arrow({ id: 'off', from: 'rail', to: 'src', fromAt: undefined })
    assert.ok(branch && fig.get('off-joint0'), 'a start on a line keeps its junction dot')
  })
})
