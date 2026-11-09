import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'

async function withFigure(run, size) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-dit-')))
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

test('the DiT block fills a tall single-column page, with token rows in and out', async () => {
  await withFigure(
    async (file) => {
      const fig = await openFigure(file)
      const plain = fig.template('dit', { id: 'a', x: 0, y: 12, w: 250 })
      const natural = plain.in[1] - 12
      fig.remove(
        ...fig.elements
          .filter((element) => element.id.startsWith('a-'))
          .map((element) => element.id)
      )
      const tall = fig.template('dit', { id: 'b', x: 0, y: 12, w: 250, tokens: 4, h: 720 })
      assert.ok(tall.in[1] - 12 > natural + 120, `${tall.in[1]} fills more than ${natural}`)
      assert.ok(tall.in[1] <= 12 + 720 + 1, 'and stays inside the height asked for')
      assert.equal(fig.get('b-zt-0').type, 'image', 'noised latent tokens in')
      assert.equal(fig.get('b-eps-0').type, 'image', 'predicted noise out')
      assert.match(
        fig.get('b-in').startBinding?.elementId ?? '',
        /^b-zt/,
        'the input leaves the tokens'
      )
      const blocks = ['b-attn', 'b-ffn'].map((id) => fig.get(id).height)
      assert.ok(
        blocks.every((height) => height <= 30 * 1.15 + 1),
        'blocks grow at most 15%'
      )
      const report = await fig.save()
      assert.deepEqual(report.errors, [])
      assert.ok(!report.warnings.some((entry) => entry.code === 'empty-box'))
    },
    { widthIn: 3.25, heightIn: 5.2 }
  )
})

test('the DiT block varies: in-context conditioning rides t and c as tokens', async () => {
  await withFigure(
    async (file) => {
      const fig = await openFigure(file)
      const drawn = fig.template('dit', { id: 'c', x: 40, y: 20, variant: 'in-context' })
      assert.ok(!fig.elements.some((element) => element.id === 'c-mlp'), 'no adaLN MLP')
      const texts = fig.elements.filter((element) => element.id.startsWith('c-zt-'))
      assert.ok(texts.length >= 6, 'latent tokens plus t and c')
      assert.ok(drawn.ids.zt && drawn.ids.attn)
      assert.throws(() => fig.template('dit', { id: 'd', variant: 'cross' }), /variant/)
      const report = await fig.save()
      assert.deepEqual(report.errors, [])
    },
    { widthIn: 6.75, heightIn: 3.6 }
  )
})
