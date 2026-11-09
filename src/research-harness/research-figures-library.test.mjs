import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { FIGURE_ICONS } from './research-figures-icons.mjs'
import { TEMPLATES } from './research-figures-templates.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { renderPicture } from './research-figures-pictures.mjs'

async function withProject(run, size = { widthIn: 6.75, heightIn: 3 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r6-')))
  const userLibrary = path.join(project, 'user-library')
  const previous = process.env.ASTER_FIGURE_LIBRARY
  process.env.ASTER_FIGURE_LIBRARY = userLibrary
  try {
    await mkdir(path.join(project, '.aster'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    await mkdir(path.join(project, 'paper/figures'), { recursive: true })
    const file = path.join(project, 'paper/figures/fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene(size)))
    await run(file, project, userLibrary)
  } finally {
    if (previous === undefined) {
      delete process.env.ASTER_FIGURE_LIBRARY
    } else {
      process.env.ASTER_FIGURE_LIBRARY = previous
    }
    await rm(project, { recursive: true, force: true })
  }
}

const codes = (report) => report.warnings.map((warning) => warning.code)
const svgOf = (fig, element) =>
  Buffer.from(fig.scene.files[element.fileId].dataURL.split(',')[1], 'base64').toString('utf8')

test('math is typeset by MathJax as vector SVG, coloured, on the label baseline', async () => {
  await withProject(async (file) => {
    const fig = await openFigure(file)
    const eq = fig.math({
      id: 'eq',
      tex: '\\mathcal{L}_{\\text{REPA}} = \\frac{1}{N}\\sum_n s_n',
      x: 40,
      y: 40,
      color: 'red'
    })
    const [image] = eq.elements
    assert.equal(image.type, 'image')
    const svg = svgOf(fig, image)
    assert.match(svg, /^<svg[^>]*viewBox=/)
    assert.match(svg, /<path /)
    assert.ok(svg.includes('#ba2c25') && !svg.includes('currentColor'))
    assert.ok(eq.width > 60 && image.height > 20, 'a fraction is taller than a line')
    assert.throws(() => fig.math({ id: 'bad', tex: '\\frac{1}', x: 0, y: 0 }), /TeX error/)
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
    assert.ok(!codes(report).includes('image'))
  })
})

test('icons and badges: Noto emoji and Lucide line icons, vector, neither hue nor prose', async () => {
  await withProject(async (file) => {
    const fig = await openFigure(file)
    assert.equal(Object.keys(FIGURE_ICONS).length >= 40, true)
    const robot = fig.icon('robot', { id: 'bot', x: 40, y: 40, size: 24 })
    assert.match(svgOf(fig, robot), /<svg/)
    const line = fig.icon('search', { id: 'find', x: 80, y: 40, variant: 'line', color: 'accent' })
    assert.ok(svgOf(fig, line).includes('stroke="#1263a6"'))
    fig.box({ id: 'enc', label: 'encoder', x: 140, y: 40, color: 'accent' })
    fig.box({ id: 'dino', label: 'DINOv2', x: 300, y: 40, color: 'strong' })
    fig.trainable('enc')
    fig.frozen('dino')
    const flame = fig.get('enc-trainable')
    const encoder = fig.bounds('enc')
    assert.ok(Math.abs(flame.x + flame.width / 2 - (encoder.right - 2)) < 0.01, 'on the corner')
    fig.trapezoid({
      id: 'vae',
      label: 'VAE',
      x: 140,
      y: 140,
      w: 120,
      h: 40,
      narrow: 'top',
      ratio: 0.5
    })
    fig.frozen('vae')
    const flake = fig.get('vae-frozen')
    assert.ok(flake.x + flake.width / 2 < 140 + 120 - 20, 'on the slanted shape, not its box')
    assert.throws(() => fig.icon('unicorn', { id: 'u', x: 0, y: 0 }), /Unknown icon/)
    const report = await fig.save()
    assert.ok(!codes(report).includes('hue-count') && !codes(report).includes('prose'))
  })
})

test('every template draws cleanly and returns its ids', async () => {
  for (const name of Object.keys(TEMPLATES)) {
    await withProject(
      async (file) => {
        const fig = await openFigure(file)
        const drawn = fig.template(name, { id: name, x: 40, y: 30 })
        assert.equal(drawn.id, name)
        assert.ok(Object.keys(drawn.ids).length > 0, name)
        const again = await openFigure(file)
        again.template(name, { id: name, x: 40, y: 30 })
        const report = await fig.save()
        assert.deepEqual(report.errors, [], `${name}: ${JSON.stringify(report.errors)}`)
      },
      { widthIn: 6.75, heightIn: 4.4 }
    )
  }
})

test('saved parts: project and user libraries, placed again with fresh ids', async () => {
  await withProject(async (file, project, userLibrary) => {
    const fig = await openFigure(file)
    fig.box({ id: 'enc', label: 'encoder', x: 40, y: 40 })
    fig.box({ id: 'dec', label: 'decoder', x: 200, y: 40 })
    fig.arrow({ id: 'a', from: 'enc', to: 'dec' })
    const saved = await fig.savePart('Encoder pair', ['enc', 'dec', 'a'])
    assert.equal(saved, path.join(project, 'paper/figures/library/encoder-pair.excalidrawlib'))
    await fig.savePart('Mine', ['enc'], { scope: 'user' })
    assert.ok(
      (await readFile(path.join(userLibrary, 'mine.excalidrawlib'), 'utf8')).includes(
        'excalidrawlib'
      )
    )
    const next = await openFigure(file)
    const main = next.part('Encoder pair', { id: 'copy', x: 40, y: 160 })
    assert.equal(main.id, 'copy')
    const arrow = next.elements.find(
      (element) => element.type === 'arrow' && element.id.startsWith('copy-')
    )
    const ends = [arrow.startBinding.elementId, arrow.endBinding.elementId]
    assert.ok(
      ends.every((id) => next.get(id)),
      'bindings follow the new ids'
    )
    assert.ok(next.part('Mine', { id: 'mine', x: 300, y: 160 }))
    assert.throws(() => next.part('nothing', { id: 'n' }), /No part/)
    assert.deepEqual((await next.save()).errors, [])
  })
})

test('loss nodes fit their formula, route by geometry and ring single tensors; lines take roles', async () => {
  await withProject(
    async (file) => {
      const fig = await openFigure(file)
      fig.box({ id: 'pred', label: 'prediction', x: 40, y: 40 })
      fig.box({ id: 'tgt', label: 'target', x: 40, y: 160 })
      const loss = fig.loss({ id: 'l', label: 'L_1', x: 260, y: 100, compare: ['pred', 'tgt'] })
      assert.ok(loss.width < 70 && loss.height < 40, 'sized to the formula')
      assert.deepEqual([loss.backgroundColor, loss.strokeColor], ['transparent', 'transparent'])
      assert.equal(fig.get('pred').strokeColor, '#333333', 'a single compared tensor is ringed')
      assert.ok(fig.get('l-in1').points.length > 2, 'an elbow, not a diagonal')
      fig.panel({
        id: 'bg',
        x: 20,
        y: 20,
        w: 400,
        h: 220,
        title: 'objective',
        titlePosition: 'bottom-right'
      })
      assert.equal(fig.elements.indexOf(fig.get('bg')), 1, 'a panel goes to the back')
      const strip = fig.tokens({ id: 'seq', x: 40, y: 260, items: ['a', 'b', 'c'] })
      assert.ok(strip)
      fig.highlight(['seq'], { cell: 1 })
      assert.ok(fig.get('seq-highlight-1'))
      assert.throws(() => fig.arrow({ id: 'x', from: [0, 0], to: [10, 0], head: 'none2' }), /head/)
    },
    { widthIn: 6.75, heightIn: 2.5 }
  )
})

test('thumbnails: CC0 photos cropped to shape, gray noise laid over them', async () => {
  await withProject(async (file) => {
    const fig = await openFigure(file)
    const photo = await fig.image({
      id: 'cat',
      kind: 'cat',
      x: 40,
      y: 40,
      w: 80,
      h: 40,
      noise: 0.5
    })
    assert.equal(photo.fileId, 'aster-photo-cat')
    assert.ok(Math.abs(photo.crop.width / photo.crop.height - 2) < 0.01)
    assert.equal(fig.get('cat-noise').opacity, 50)
    const gray = renderPicture({ kind: 'noise', width: 4, height: 4 })
    for (let index = 0; index < gray.length; index += 3) {
      assert.ok(gray[index] === gray[index + 1] && gray[index + 1] === gray[index + 2])
    }
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
  })
})
