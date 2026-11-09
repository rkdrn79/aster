import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { measureText } from './research-figures-text.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2.4 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-ill-')))
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

const all = (report) => [...report.errors, ...report.warnings].map((entry) => entry.code)

test('the illustrative style: Nunito text, tinted rounded panels, coloured key phrases', async () => {
  assert.notEqual(measureText('reward model', 20, 6).width, measureText('reward model', 20).width)
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('illustrative', { panels: ['sand', 'sky'] })
    assert.equal(fig.page.style, 'illustrative')
    assert.deepEqual(fig.page.panels, ['sand', 'sky'])
    fig.bubble({ id: 'yw', x: 40, y: 110, label: 'y_w' })
    fig.math({ id: 'gt', tex: '\\succ', x: 106, cy: 133, size: 20 })
    fig.bubble({ id: 'yl', x: 126, y: 110, label: 'y_l' })
    fig.icon('trophy', { id: 'cup', x: 34, y: 102, size: 20, fill: 'amber' })
    assert.equal(fig.get('cup').customData.asterIcon, 'trophy')
    fig.arrow({ id: 'a1', from: [210, 133], to: [262, 133] })
    const phrase = fig.callout({ id: 'ml', text: 'maximum\nlikelihood', under: 'a1' })
    assert.ok(phrase.elements.every((element) => element.fontFamily === 6))
    assert.ok(phrase.elements[0].y > 133, 'under the arrow')
    const rm = fig.nn({ id: 'rm', x: 280, y: 120, w: 140, h: 84, label: 'reward model' })
    assert.equal(rm.nodes.flat().length, 14)
    const name = fig.elements.find((element) => element.id.startsWith('rm-label'))
    assert.ok(name.y + name.height <= 120, 'the network is named above it')
    assert.equal(name.fontSize, 16)
    fig.nn({ id: 'pol', x: 528, y: 120, w: 140, h: 84, label: 'LM policy', highlight: [3, 1] })
    assert.notEqual(fig.get('pol-n3-1').backgroundColor, fig.get('pol-n3-0').backgroundColor)
    const loop = fig.cycle({
      id: 'loop',
      between: ['rm', 'pol'],
      labels: { top: 'label rewards', bottom: 'sample completions' }
    })
    const arcs = loop.filter((element) => element.type === 'arrow')
    assert.equal(arcs.length, 2)
    assert.ok(arcs.every((arc) => arc.customData.asterCurve && arc.roundness?.type === 2))
    fig.callout({ id: 'rl', text: 'reinforcement learning', color: 'loss', under: 'loop' })
    const left = fig.panel({
      id: 'rlhf',
      around: ['yw', 'yl', 'rm', 'pol', 'loop', 'rl', 'ml'],
      title: 'RLHF',
      color: 'panel-1'
    })
    const right = fig.panel({
      id: 'dpo',
      x: 720,
      y: 110,
      w: 220,
      h: 60,
      title: 'DPO',
      color: 'panel-2',
      same: 'rlhf'
    })
    assert.deepEqual([right.y, right.height], [left.y, left.height], 'compared panels line up')
    assert.equal(fig.elements.find((element) => element.id.startsWith('rlhf-title')).fontSize, 22)
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
    for (const code of ['generated-palette', 'loss-color', 'legend', 'text-over-shape', 'font']) {
      assert.ok(!all(report).includes(code), `${code} in ${all(report).join(', ')}`)
    }
  })
})

test('badges and icons are line art unless emoji is asked for', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'enc', label: 'encoder', x: 40, y: 40, color: 'accent' })
    fig.box({ id: 'tgt', label: 'target', x: 240, y: 40 })
    fig.trainable('enc')
    fig.frozen('tgt')
    const svg = (id) => fig.scene.files[fig.get(id).fileId].dataURL
    const text = (id) => Buffer.from(svg(id).split(',')[1], 'base64').toString()
    // Signs drawn to read at 8 pt: a solid flame with a white tongue in the accent, a snowflake
    // in the line gray on a white disc.
    assert.match(text('enc-trainable'), /fill="#1263a6"/)
    assert.match(text('enc-trainable'), /fill="#ffffff"/)
    assert.match(text('tgt-frozen'), /stroke="#333333"/)
    assert.equal(fig.get('tgt-frozen').customData.asterIcon, 'snowflake')
    fig.trainable('tgt', { color: 'amber' })
    assert.doesNotMatch(text('tgt-trainable'), /fill="#1263a6"/)
    fig.icon('robot', { id: 'bot', x: 400, y: 40, variant: 'emoji' })
    assert.doesNotMatch(
      Buffer.from(svg('bot').split(',')[1], 'base64').toString(),
      /stroke-width="2"/
    )
  })
})
