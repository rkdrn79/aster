import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { readsAsWords } from './research-figures-type.mjs'

const under = (fig, id) =>
  fig.elements.filter((element) => element.customData?.asterKit === id && !element.isDeleted)

async function withFigure(run, size = { widthIn: 6.75, heightIn: 3 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-math-')))
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

test('explicit math is always TeX; TeX-by-default labels print as words only when they read as words', async () => {
  for (const word of ['softmax', 'KL', 'ViT-L/16', 'LoRA', 'ResNet-50', 'image encoder', 'top-k']) {
    assert.equal(readsAsWords(word), true, word)
  }
  for (const math of ['sg', 'x_t', 'BAx', 'Wx', 'O(TL)', 'T-L', 'f(x)']) {
    assert.equal(readsAsWords(math), false, math)
  }
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const typeset = (id) => under(fig, id).filter((element) => element.customData?.asterTex)
    const printed = (id) => under(fig, id).filter((element) => element.type === 'text')
    fig.math({ id: 'm1', tex: 'O(TL)', x: 10, y: 10 })
    fig.math({ id: 'm2', tex: 'softmax', x: 10, y: 40 })
    fig.text({ id: 't1', text: 'cost $O(TL)$ and $T-L$', x: 10, y: 70 })
    fig.box({ id: 'b1', x: 10, y: 100, w: 120, h: 40, label: [{ tex: 'BAx' }] })
    fig.text({
      id: 'r1',
      runs: ['Actor ', { text: 'uses $\\pi_\\theta$', size: 12 }],
      x: 10,
      y: 160
    })
    assert.equal(typeset('m1').length, 1, '$…$-free fig.math is TeX')
    assert.equal(typeset('m2').length, 1, 'fig.math never demotes to words')
    assert.equal(typeset('t1').length, 2)
    assert.equal(typeset('b1').length, 1)
    assert.equal(typeset('r1').length, 1, '$…$ inside a small-text run')
    assert.ok(!printed('r1').some((element) => element.text.includes('$')))
    assert.equal(printed('r1').find((element) => element.text.includes('uses'))?.fontSize, 12)
    fig.box({ id: 'a', x: 300, y: 10, w: 60, h: 30 })
    fig.box({ id: 'b', x: 300, y: 120, w: 60, h: 30 })
    fig.arrow({ id: 'l1', from: 'a', to: 'b', label: 'BAx' })
    fig.arrow({ id: 'l2', from: 'a', to: 'b', label: 'softmax', labelSide: 'left' })
    assert.equal(typeset('l1').length, 1, 'an auto label that is math')
    assert.equal(typeset('l2').length, 0, 'an auto label that reads as words')
  })
})
