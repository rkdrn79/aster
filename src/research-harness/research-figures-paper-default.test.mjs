// The paper look as the default (round 16): every figure but an illustrated teaser or a
// recreation draws in it, templates use words and shapes for actors and tools, return paths run in
// the nearest clear band and a long one is named (long-return), and on a small page no formula may
// overlap a word, another formula or the edge of a shape (paper-overlap).
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { pageLook } from './research-figures-paper.mjs'
import { PAPER_SERIF } from './research-figures-paper-fonts.mjs'
import { FIGURE_PAPER_RULE, FIGURE_SMALL_PAGE_RULE } from './research-figures-style-rules.mjs'
import { RETURN_REACH } from './research-figures-lint-return.mjs'
import { paperLookChecks } from './research-figures-lint-paper.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2.4 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-paperd-')))
  try {
    const folder = path.join(project, '.aster/figures')
    await mkdir(folder, { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const file = path.join(folder, 'fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene(size)))
    await run(await openFigure(file))
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const findings = (report) => [...report.errors, ...report.warnings, ...report.notes]
const of = (report, code) => findings(report).filter((entry) => entry.code === code)

test('the paper look is the default, except an illustrative teaser and a recreation', async () => {
  assert.equal(pageLook(null), 'paper')
  assert.equal(pageLook({ style: 'vision' }), 'paper')
  assert.equal(pageLook({ style: 'illustrative' }), null)
  assert.equal(pageLook({ style: 'illustrative', look: 'paper' }), 'paper')
  assert.equal(pageLook({ style: 'vision', look: 'preset' }), null)
  assert.equal(pageLook({ style: 'vision', reference: 'ref.png' }), null)
  await withFigure(async (fig) => {
    fig.text({ id: 't', text: 'Encoder', x: 20, y: 20 })
    assert.equal(fig.get('t').fontFamily, PAPER_SERIF.cm.id)
    fig.style('vision')
    fig.text({ id: 'u', text: 'Decoder', x: 20, y: 60 })
    assert.equal(fig.get('u').fontFamily, PAPER_SERIF.cm.id)
    fig.style('illustrative')
    fig.text({ id: 'v', text: 'Teaser', x: 20, y: 100 })
    assert.equal(fig.get('v').fontFamily, 6)
  })
  assert.match(FIGURE_PAPER_RULE, /default for method, architecture, pipeline and system figures/)
  assert.match(FIGURE_SMALL_PAGE_RULE, /move it under its panel, shorten it .* or stack it/)
})

test('templates draw actors and tools as words and shapes in the paper look', async () => {
  await withFigure(
    async (fig) => {
      const drawn = await fig.template('rag', { id: 'rag', x: 40, y: 30 })
      assert.equal(drawn.ids.documents.length, 3)
      assert.equal(fig.get('rag-query').type, 'text')
      assert.equal(fig.get('rag-db').customData?.asterIcon, undefined)
      await fig.template('preference', { id: 'pref', x: 40, y: 200 })
      assert.equal(
        fig.elements.filter((element) => element.customData?.asterIcon).length,
        0,
        'no icons'
      )
    },
    { widthIn: 6.75, heightIn: 4 }
  )
})

test("route: 'under' runs a return path in the nearest clear band and ends on the part it updates", async () => {
  await withFigure(async (fig) => {
    fig.box({ id: 'mlp', label: 'MLP', x: 40, y: 80, w: 80, h: 40 })
    fig.box({ id: 'mid', label: 'render', x: 200, y: 60, w: 80, h: 90 })
    fig.box({ id: 'loss', label: 'loss', x: 360, y: 80, w: 80, h: 40 })
    const back = fig.arrow({ id: 'g', from: 'loss', to: 'mlp', role: 'grad', route: 'under' })
    const ys = back.points.map(([, y]) => back.y + y)
    // Why 162: the band clears the tallest part between the ends (bottom 150) by 12 units.
    assert.equal(Math.max(...ys), 162)
    assert.equal(back.endBinding.elementId, 'mlp')
    assert.throws(
      () => fig.arrow({ id: 'h', from: [400, 40], to: 'mlp', route: 'over' }),
      /joins two items given by id/
    )
  })
})

test('a return path across more than half the page is long-return; allowed only on purpose', async () => {
  await withFigure(async (fig) => {
    fig.box({ id: 'mlp', label: 'MLP', x: 20, y: 80, w: 80, h: 40 })
    fig.box({ id: 'loss', label: 'loss', x: 860, y: 80, w: 80, h: 40 })
    fig.box({ id: 'near', label: 'render', x: 700, y: 80, w: 80, h: 40 })
    fig.arrow({ id: 'g', from: 'loss', to: 'mlp', role: 'grad', route: 'under' })
    fig.arrow({ id: 'f', from: 'loss', to: 'near', role: 'feedback', route: 'over' })
    const report = await fig.save({ dryRun: true })
    const long = of(report, 'long-return')
    assert.deepEqual(
      long.map((entry) => entry.id),
      ['g']
    )
    assert.match(long[0].message, /8\d% of the page .*nearest part it updates.*route: 'under'/)
    assert.ok(RETURN_REACH === 0.5)
    fig.allow('long-return', ['g'])
    assert.equal(of(await fig.save({ dryRun: true }), 'long-return').length, 0)
  })
})

test('on a small page a formula over a word, a formula or a box edge is paper-overlap', async () => {
  await withFigure(
    async (fig) => {
      fig.box({ id: 'z', label: 'z', x: 40, y: 40, w: 24, h: 24, color: 'white' })
      fig.math({
        id: 'zdim',
        tex: 'z\\in\\mathbb{R}^{h\\times w\\times c}',
        x: 40,
        y: 58,
        size: 14
      })
      fig.math({ id: 'a1', tex: '\\mathrm{Attention}(Q,K,V)=', x: 120, y: 120, size: 14 })
      fig.math({ id: 'a2', tex: '\\mathrm{softmax}(QK^T/\\sqrt{d})V', x: 120, y: 133, size: 14 })
      fig.math({ id: 'ok', tex: 'x_t', x: 300, y: 40, size: 14 })
      const overlaps = of(await fig.save({ dryRun: true }), 'paper-overlap')
      const ids = overlaps.map((entry) => entry.id)
      assert.ok(ids.includes('zdim-0'), ids.join(', '))
      assert.ok(
        ids.some((id) => id.startsWith('a1') || id.startsWith('a2')),
        ids.join(', ')
      )
      assert.ok(!ids.includes('ok-0'))
      assert.match(overlaps[0].message, /move it clear|under its panel/)
    },
    { widthIn: 3.25, heightIn: 1.6 }
  )
})

test('helpers that write their own words use the paper face; a sans plot counts as a second face', async () => {
  await withFigure(async (fig) => {
    fig.style('generative')
    fig.legend({
      id: 'lg',
      x: 20,
      y: 20,
      asked: true,
      items: [
        { label: 'denoising step', role: 'main' },
        { label: 'concat', symbol: 'concat' }
      ]
    })
    fig.subcaption({ id: 'cap', label: '(a)', text: 'ours', cx: 300, y: 100 })
    fig.box({ id: 'tf', label: 'T', x: 400, y: 60, w: 60, h: 40 })
    fig.frozen('tf')
    const words = fig.elements.filter((element) => element.type === 'text' && !element.isDeleted)
    assert.ok(words.length >= 4)
    assert.deepEqual([...new Set(words.map((element) => element.fontFamily))], [PAPER_SERIF.cm.id])
  })
  const page = { look: 'paper', width: 972, height: 288 }
  const said = []
  const add = (level, code, element, message) => said.push({ code, id: element?.id, message })
  paperLookChecks(
    [
      {
        id: 't',
        type: 'text',
        text: 'loss',
        x: 20,
        y: 20,
        width: 30,
        height: 20,
        fontSize: 16,
        fontFamily: 20
      },
      {
        id: 'sig',
        type: 'image',
        x: 100,
        y: 20,
        width: 120,
        height: 120,
        customData: { asterPlot: { style: { preset: 'vision' } } }
      },
      {
        id: 'ok',
        type: 'image',
        x: 300,
        y: 20,
        width: 120,
        height: 120,
        customData: { asterPlot: { style: { look: 'paper', serif: 'cm' } } }
      }
    ],
    page,
    add
  )
  const font = said.find((entry) => entry.code === 'paper-font')
  assert.match(font.message, /2 type faces .*remake sig with ap\.use\(…, look="paper"\)/)
})

test('a word touching the edge of a box it is not in is paper-overlap (K, V under its card)', async () => {
  await withFigure(
    async (fig) => {
      fig.box({ id: 'card', label: 'QKV', x: 100, y: 100, w: 48, h: 16 })
      fig.text({ id: 'kv', text: 'K, V', size: 14, x: 130, y: 116 })
      fig.text({ id: 'far', text: 'far', size: 14, x: 300, y: 40 })
      const found = of(await fig.save({ dryRun: true }), 'paper-overlap')
      assert.deepEqual(
        found.map((entry) => entry.id),
        ['kv']
      )
      assert.match(found[0].message, /touches the edge of card .*4 units clear/)
    },
    { widthIn: 3.25, heightIn: 1.6 }
  )
})
