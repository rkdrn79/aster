import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { lintFigureScene } from './research-figures-lint.mjs'
import { newFigureScene } from './research-figures-model.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 3 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-groups-')))
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

const index = (fig, id) => fig.elements.findIndex((element) => element.id === id)

test('an arrow into an item inside a panel is drawn over the panel', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'src', x: 40, y: 40, w: 96, h: 40, label: 'policy' })
    fig.panel({ id: 'p', x: 240, y: 20, w: 300, h: 200, title: 'data' })
    fig.box({ id: 'inner', x: 320, y: 120, w: 120, h: 40, label: 'reward' })
    const arrow = fig.arrow({ id: 'a', from: 'src', to: 'inner' })
    assert.ok(index(fig, 'a') > index(fig, 'p'), 'above the panel')
    assert.ok(index(fig, 'a') < index(fig, 'inner'), 'still under what it joins')
    assert.equal(arrow.endBinding.elementId, 'inner')
  })
})

test('an arrow to several items binds to an invisible group around them', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'src', x: 40, y: 100, w: 96, h: 40, label: 'policy' })
    fig.box({ id: 'y1', x: 300, y: 40, w: 96, h: 40, label: 'good' })
    fig.box({ id: 'y2', x: 300, y: 160, w: 96, h: 40, label: 'bad' })
    const arrow = fig.arrow({ id: 'a', from: 'src', to: ['y1', 'y2'] })
    const group = fig.get('a-to')
    assert.equal(arrow.endBinding.elementId, 'a-to')
    assert.deepEqual([group.x, group.y, group.width, group.height], [296, 36, 104, 168])
    assert.equal(group.strokeColor, 'transparent')
    assert.equal(group.backgroundColor, 'transparent')
    assert.ok(index(fig, 'a-to') < index(fig, 'y1'), 'under its members')
    const own = fig.group({ id: 'g', ids: ['y1', 'y2'], pad: 8 })
    assert.equal(own.width, 112)
    assert.equal(fig.arrow({ id: 'b', from: 'src', to: 'g' }).endBinding.elementId, 'g')
    assert.throws(() => fig.group({ id: 'h' }), /give it ids, or x, y, w and h/)
    const lint = lintFigureScene(fig.scene)
    const codes = [...lint.errors, ...lint.warnings].filter((item) =>
      ['a-to', 'g'].includes(item.id)
    )
    assert.deepEqual(codes, [], 'the lint takes a group for what it is')
  })
})

test('a legend lays out swatches and labels, returns its bounds, and is not flagged', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const row = fig.legend({
      id: 'lg',
      x: 40,
      y: 300,
      items: [
        { label: 'ours', color: 'accent' },
        { label: 'frozen', color: 'block' },
        { label: 'gradient', dashed: true, color: 'accent-ink' }
      ]
    })
    assert.equal(row.items.length, 3)
    assert.ok(row.width > 150 && row.height > 0)
    assert.equal(row.right, row.x + row.width)
    assert.ok(row.items[1].x > row.items[0].x + row.items[0].width, 'items do not overlap')
    assert.equal(fig.get('lg-s2').type, 'line')
    assert.equal(fig.get('lg-s2').strokeStyle, 'dashed')
    const column = fig.legend({
      id: 'lc',
      x: 600,
      y: 280,
      direction: 'column',
      items: [
        { label: 'ours', color: 'accent' },
        { label: 'data', dashed: true }
      ]
    })
    assert.equal(fig.get('lc-t0').x, fig.get('lc-t1').x, 'labels line up in a column')
    assert.ok(column.height > row.height)
    const lint = lintFigureScene(fig.scene)
    assert.ok(![...lint.errors, ...lint.warnings].some((item) => item.code === 'legend'))
    const text = fig.text({ id: 't', text: 'cost $O(TL)$', x: 40, y: 360 })
    assert.ok(text.width > 40 && text.right > text.x)
  })
})

test('a sub-caption reaches into the gaps beside its panel before it wraps', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.panel({ id: 'a', x: 40, y: 40, w: 200, h: 120 })
    fig.panel({ id: 'b', x: 270, y: 40, w: 200, h: 120 })
    fig.panel({ id: 'c', x: 500, y: 40, w: 200, h: 120 })
    const lines = (id) =>
      new Set(fig.elements.filter((e) => e.customData?.asterKit === id).map((e) => e.y)).size
    fig.subcaption({ id: 'cb', under: 'b', label: '(b)', text: 'Sliding window w/ re-compute' })
    assert.equal(lines('cb'), 1, 'a little wider than its panel: one line')
    fig.subcaption({
      id: 'cc',
      under: 'c',
      label: '(c)',
      text: 'Sliding window attention with re-computation of the recent tokens'
    })
    assert.ok(lines('cc') > 1, 'much wider: wrapped')
  })
})
