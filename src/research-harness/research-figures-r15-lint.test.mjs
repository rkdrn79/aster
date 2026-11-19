// Round 15 lint and kit fixes from the round-14 difficulties: small pages compact and never offer
// to drop what was asked, a backward path reaches the parameters it updates, labels stay off
// pictures, a near miss may be allowed on either item, panel headings are not floating losses,
// outlined light-gray regions are not a flat background, legends typeset math, the hourglass
// U-Net and the two-stream block grow to fit their cards, hash-grid draws one level, and a label
// too wide for its short arrow says what to do.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { dropCandidates } from './research-figures-lint-small.mjs'
import { perspectiveScene } from './research-figures-perspective-scene.mjs'
import { PERSPECTIVE_TEMPLATES } from './research-figures-perspective-templates.mjs'
import { FIGURE_SMALL_PAGE_RULE } from './research-figures-style-rules.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2.4 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r15l-')))
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

const all = (report) => [...report.errors, ...report.warnings, ...report.notes]
const of = (report, code) => all(report).filter((entry) => entry.code === code)

async function warned(run) {
  const said = []
  const original = console.warn
  console.warn = (message) => said.push(String(message))
  try {
    await run()
  } finally {
    console.warn = original
  }
  return said
}

test('the small-page rule keeps what the request names and compacts first', () => {
  assert.match(FIGURE_SMALL_PAGE_RULE, /keep everything the request names/)
  assert.match(FIGURE_SMALL_PAGE_RULE, /Compact first: shorter words.*gaps of 8.*inline/)
  assert.doesNotMatch(FIGURE_SMALL_PAGE_RULE, /move to the caption|becomes the caption/)
})

test('small-page advice compacts a legend, a formula and wide gaps; it never offers a drop', async () => {
  await withFigure(
    async (fig) => {
      fig.style('generative')
      fig.box({ id: 'e', label: 'E', x: 24, y: 40, w: 40, h: 32 })
      fig.box({ id: 'z', label: 'z', x: 104, y: 40, w: 40, h: 32 })
      fig.box({ id: 'u', label: 'U-Net', x: 184, y: 40, w: 64, h: 32 })
      for (const [k, kind] of ['cat', 'dog'].entries()) {
        await fig.image({ id: `v${k}`, kind, x: 300 + k * 50, y: 40, w: 40, h: 40 })
      }
      fig.math({ id: 'dims', tex: 'z \\in \\mathbb{R}^{h \\times w \\times c}', x: 24, y: 110 })
      fig.legend({
        id: 'lg',
        x: 24,
        y: 160,
        asked: true,
        items: ['denoising step', 'cross-attention', 'switch', 'skip connection', 'concat'].map(
          (label) => ({ label, color: 'a' })
        )
      })
      const offered = dropCandidates(fig.elements).map((entry) => entry.what)
      assert.ok(
        offered.some((what) => /formula dims: inline beside its symbol.*keep it/.test(what))
      )
      assert.ok(offered.some((what) => /gaps of \d+ units/.test(what)))
      assert.ok(
        offered.every((what) => !/keep two|caption|drop/.test(what)),
        offered.join('\n')
      )
      const report = await fig.save()
      for (const entry of of(report, 'small-page')) {
        assert.match(entry.message, /Compact rather than shrink/)
        assert.doesNotMatch(entry.message, /fewer things|keep two/)
      }
    },
    { widthIn: 3.25, heightIn: 1.6 }
  )
})

test('a gradient that says it updates weights must end on a module, never a region', async () => {
  await withFigure(async (fig) => {
    fig.box({ id: 'mlp', label: 'MLP', x: 40, y: 40, w: 72, h: 36 })
    fig.box({ id: 'c', label: 'c', x: 160, y: 40, w: 48, h: 36 })
    fig.panel({ id: 'nerf', around: ['mlp', 'c'], title: 'NeRF' })
    await fig.image({ id: 'render', kind: 'bird', x: 320, y: 30, w: 72, h: 72 })
    fig.box({ id: 'loss', label: 'SDS', x: 480, y: 40, w: 64, h: 36 })
    fig.arrow({ id: 'g1', from: 'loss', to: 'render', role: 'grad' })
    fig.arrow({ id: 'g2', from: 'render', to: 'nerf', role: 'grad', label: 'onto NeRF weights' })
    const report = await fig.save()
    const found = of(report, 'grad-target')
    assert.equal(found.length, 1, JSON.stringify(found))
    assert.match(found[0].message, /ends on the region nerf.*\(mlp/)
  })
  await withFigure(async (fig) => {
    await fig.image({ id: 'view', kind: 'bird', x: 40, y: 30, w: 72, h: 72 })
    fig.box({ id: 'zero', label: 'Zero-1-to-3', x: 200, y: 40, w: 96, h: 36 })
    fig.arrow({ id: 'sjc', from: 'zero', to: 'view', role: 'grad', label: '$\\nabla L$' })
    const report = await fig.save()
    assert.deepEqual(of(report, 'grad-target'), [], 'a gradient on a picture is fine')
  })
})

test('a label over a picture is flagged; the picture its own caption is not', async () => {
  await withFigure(async (fig) => {
    await fig.image({ id: 'img', kind: 'cat', x: 100, y: 40, w: 80, h: 80, label: 'x' })
    fig.text({ id: 'eps', text: 'noise ε', x: 130, y: 70 })
    const report = await fig.save()
    const found = of(report, 'label-over-image')
    assert.equal(found.length, 1)
    assert.match(found[0].message, /the label eps lies over the picture img/)
  })
})

test('near-miss-align is allowed on either item; a panel heading is not a floating loss', async () => {
  await withFigure(async (fig) => {
    fig.box({ id: 'a', label: 'A', x: 40, y: 40, w: 60, h: 32 })
    fig.box({ id: 'b', label: 'B', x: 160, y: 44, w: 60, h: 32 })
    fig.box({ id: 'c', label: 'C', x: 280, y: 40, w: 60, h: 32 })
    fig.allow('near-miss-align', ['a'])
    fig.allow('near-miss-align', ['c'])
    fig.box({ id: 'r', label: 'render', x: 420, y: 60, w: 80, h: 32 })
    fig.panel({ id: 'pd', around: ['r'], outline: true, color: 'none', titleRow: false })
    const box = fig.bounds('pd')
    fig.text({ id: 'head', text: '(d) Rendering Loss', x: box.x + 2, y: box.y - 22 })
    const report = await fig.save()
    assert.deepEqual(of(report, 'near-miss-align'), [])
    assert.deepEqual(of(report, 'loss-floating'), [])
  })
})

test('outlined near-white regions pass flat-background; a legend typesets math', async () => {
  await withFigure(
    async (fig) => {
      for (const [k, id] of ['p', 'q'].entries()) {
        fig.box({ id: `${id}-box`, label: id, x: 60 + k * 420, y: 60, w: 80, h: 40 })
        fig.panel({ id, around: [`${id}-box`], outline: true, pad: 60 })
      }
      const legend = fig.legend({
        id: 'lg',
        x: 300,
        y: 280,
        items: [{ label: 'pose $(R_i, T_i)$', role: 'cond' }]
      })
      assert.ok(legend.width > 40)
      assert.ok(
        fig.elements.some(
          (element) => element.id.startsWith('lg-t0') && element.customData?.asterTex
        )
      )
      const report = await fig.save()
      assert.deepEqual(of(report, 'flat-background'), [])
      assert.deepEqual(of(report, 'literal-math'), [])
    },
    { widthIn: 6.75, heightIn: 3 }
  )
})

test('the hourglass U-Net and the two-stream block grow so their cards fit', async () => {
  await withFigure(
    async (fig) => {
      const said = await warned(() =>
        fig.unet({
          id: 'u',
          shape: 'hourglass',
          x: 24,
          y: 40,
          w: 160,
          h: 80,
          levels: 2,
          blocks: { enc: ['QKV', 'QKV'], dec: ['QKV', 'QKV'] }
        })
      )
      assert.match(said.join('\n'), /unet u: grew from w 160/)
      const grown = await warned(() =>
        fig.template('two-stream', { id: 'mm', x: 300, y: 12, w: 200, h: 200 })
      )
      assert.match(grown.join('\n'), /two-stream mm: grew to w \d+, h 388/)
      for (const part of ['mm-attn', 'mm-l-qkv', 'mm-r-mlp', 'mm-l-add2', 'mm-cond-norm1-l']) {
        assert.ok(
          fig.elements.some((element) => element.id === part),
          part
        )
      }
      const report = await fig.save()
      assert.deepEqual(
        report.errors.map((entry) => `${entry.code} ${entry.id}`),
        []
      )
    },
    { widthIn: 6.75, heightIn: 3 }
  )
})

test('hash-grid draws one level; mip-cone takes a colour per sample', () => {
  const b = perspectiveScene({ photos: null })
  PERSPECTIVE_TEMPLATES['hash-grid'].draw(b, { dims: 2, level: 1 })
  assert.ok(b.anchors['l1.v0'] && !b.anchors['l0.v0'])
  assert.throws(
    () => PERSPECTIVE_TEMPLATES['hash-grid'].draw(perspectiveScene({ photos: null }), { level: 4 }),
    /levels has 2 entries/
  )
  const c = perspectiveScene({ photos: null })
  PERSPECTIVE_TEMPLATES['mip-cone'].draw(c, {
    mode: 'ray',
    sampleColors: ['#2a9d8f'],
    heroColor: '#e76f51'
  })
  const roles = c.units.filter((unit) => unit.type === 'dot').map((unit) => unit.role)
  assert.ok(roles.includes('#2a9d8f') && roles.includes('#e76f51'))
})

test('a label too wide for its short arrow says how to name the input instead', async () => {
  await withFigure(async (fig) => {
    fig.box({ id: 'a', label: 'A', x: 40, y: 40, w: 60, h: 32 })
    fig.box({ id: 'b', label: 'B', x: 130, y: 40, w: 60, h: 32 })
    fig.box({ id: 'c', label: 'over', x: 92, y: 10, w: 46, h: 22 })
    fig.box({ id: 'd', label: 'under', x: 92, y: 80, w: 46, h: 22 })
    const said = await warned(() =>
      fig.arrow({ id: 'ab', from: 'a', to: 'b', label: 'a long camera pose label' })
    )
    assert.match(said.join('\n'), /arrow ab: its label .* has no clear spot.*on: 'ab'/)
  })
})

test("a U-Net's own nested skips are not an arrow chain", async () => {
  await withFigure(async (fig) => {
    fig.unet({ id: 'u', shape: 'hourglass', x: 40, y: 40, w: 200, h: 90, levels: 3 })
    const report = await fig.save()
    assert.deepEqual(of(report, 'arrow-chain'), [])
  })
})
