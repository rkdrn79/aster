import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  makeGrid,
  makeNode,
  makeRoundedEnd,
  makeStopGrad,
  makeTrapezoid,
  openFigure,
  parseMath
} from './research-figures-kit.mjs'
import { focusDistance } from './research-figures-geometry.mjs'
import { lintFigureScene } from './research-figures-lint.mjs'
import { buildFigurePart } from './research-figures-parts.mjs'
import { encodePng, pngIsBlank } from './research-figures-png.mjs'
import { showFigure } from './research-figures.mjs'
import { figureElement, newFigureScene } from './research-figures-model.mjs'
import { measureText, missingGlyphs } from './research-figures-text.mjs'

const cli = path.join(import.meta.dirname, 'cli.mjs')

async function withProject(run) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-kit-')))
  try {
    await mkdir(path.join(project, '.aster'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    await mkdir(path.join(project, 'paper/figures'), { recursive: true })
    await run(project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

function harness(project, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args, '--project', project, '--json'], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, result: JSON.parse(stdout) }))
  })
}

test('text is measured with Liberation Sans advances, and missing glyphs are named', () => {
  assert.equal(Math.round(measureText('Linear', 16).width * 10) / 10, 44.5)
  assert.equal(Math.round(measureText('Add & Norm', 16).width), 87)
  assert.equal(Math.round(measureText('Predictor', 16).width), 64)
  assert.deepEqual(measureText('Two\nlines', 16).height, 40)
  assert.deepEqual(missingGlyphs('QKᵀ ⊕ x₂ √d ×'), ['ᵀ', '⊕', '₂'])
})

test('the focus matches Excalidraw: 0 through the center, signed off it', () => {
  const box = { type: 'rectangle', x: 100, y: 100, width: 100, height: 50 }
  assert.equal(focusDistance(box, [0, 125], [96, 125]), 0)
  assert.equal(Math.round(focusDistance(box, [0, 110], [96, 110]) * 100) / 100, 0.6)
  assert.equal(Math.round(focusDistance(box, [0, 140], [96, 140]) * 100) / 100, -0.6)
})

test('the lint reports what would print wrong, with ids', () => {
  const scene = newFigureScene({ widthIn: 3.25, heightIn: 2 })
  const [box, label] = buildFigurePart('encoder', { id: 'enc', x: 40, y: 40, width: 40 })
  label.text = 'A much longer label'
  const outside = figureElement('rectangle', { id: 'far', x: 440, y: 40, width: 80, height: 40 })
  const up = figureElement('arrow', {
    id: 'up',
    x: 100,
    y: 200,
    width: 40,
    height: 80,
    points: [
      [0, 0],
      [-40, -80]
    ],
    endBinding: { elementId: 'enc', focus: 0, gap: 4 }
  })
  const glyph = figureElement('text', {
    id: 'tex',
    x: 200,
    y: 200,
    width: 40,
    height: 20,
    text: 'QKᵀ',
    fontSize: 12
  })
  scene.elements.push(box, label, outside, up, glyph)
  const report = lintFigureScene(scene)
  const codes = (list) => list.map((finding) => `${finding.code}:${finding.id}`)
  assert.ok(codes(report.errors).includes('text-overflow:enc-label'))
  assert.ok(codes(report.errors).includes('outside-page:far'))
  assert.ok(codes(report.errors).includes('binding:up'), 'enc does not list the arrow')
  assert.ok(codes(report.errors).includes('missing-glyph:tex'))
  assert.ok(codes(report.warnings).includes('small-text:tex'))
  assert.ok(!codes(report.errors).includes('outside-page:up'), 'an up-left arrow is inside')
})

test('the kit sizes boxes to labels, binds arrows both ways, and keeps other elements', async () => {
  await withProject(async (project) => {
    const file = path.join(project, 'paper/figures/method.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene({ widthIn: 6.75, heightIn: 2.5 })))
    const figure = await openFigure(file)
    const encoder = figure.box({
      id: 'enc',
      label: 'Context encoder\nViT-B/16',
      x: 40,
      y: 60,
      color: 'blue'
    })
    figure.box({ id: 'loss', label: 'Loss', x: 400, y: 200, color: 'vermillion' })
    const arrow = figure.arrow({
      id: 'a1',
      from: 'enc',
      to: 'loss',
      route: 'hv',
      label: 's_y^{(i)}'
    })
    figure.math({ id: 'qk', tex: 'QK^T/√d_k', x: 600, y: 40 })
    const report = await figure.save()
    assert.deepEqual(report.errors, [])
    assert.ok(encoder.width >= measureText('Context encoder', 16).width + 10)
    assert.equal(encoder.height, 64, 'two lines with room above and below')
    assert.deepEqual(arrow.points.at(-1)[0], arrow.points.at(-2)[0], 'enters loss straight down')
    assert.equal(arrow.endArrowhead, 'triangle')
    const saved = JSON.parse(await readFile(file, 'utf8'))
    const byId = new Map(saved.elements.map((element) => [element.id, element]))
    assert.ok(byId.has('figure-page'))
    assert.ok(byId.get('loss').boundElements.some((bound) => bound.id === 'a1'))
    assert.equal(byId.get('a1').endBinding.elementId, 'loss')
    assert.deepEqual(
      parseMath('s_y^{(i)}').map((run) => run.level),
      ['base', 'sub', 'sup']
    )
    const again = await openFigure(file)
    again.remove('loss')
    await again.save()
    const after = JSON.parse(await readFile(file, 'utf8'))
    assert.ok(!after.elements.some((element) => element.id === 'loss-label'))
    assert.equal(after.elements.find((element) => element.id === 'a1').endBinding, null)
  })
})

test('parts take ids, sizes and labels, and fit multi-line labels', () => {
  const [box, label] = buildFigurePart('attention', { id: 'attn', x: 10, y: 20 })
  assert.equal(box.id, 'attn')
  assert.equal(label.id, 'attn-label')
  assert.equal(label.height, 40)
  assert.equal(label.y, box.y + (box.height - 40) / 2)
  const tensor = buildFigurePart('tensor', { id: 'feat', scale: 0.5 })
  assert.equal(tensor[0].strokeColor, 'transparent')
  assert.equal(tensor[0].id, 'feat')
  const elbow = buildFigurePart('elbow-arrow', { id: 'e' })[0]
  assert.equal(elbow.elbowed, false)
  assert.equal(elbow.points.length, 4)
  const green = buildFigurePart('process', { id: 'p', color: 'green' })[0]
  assert.deepEqual([green.backgroundColor, green.strokeColor], ['#c8e5c1', 'transparent'])
})

test('figures preview waits for the render of the current file and explains a miss', async () => {
  await withProject(async (project) => {
    const scene = path.join(project, 'paper/figures/method.excalidraw')
    const text = JSON.stringify(newFigureScene({ widthIn: 3.25, heightIn: 2 }))
    await writeFile(scene, text)
    const missing = await harness(project, ['figures', 'preview', '--wait', '0.5'])
    assert.equal(missing.code, 1)
    assert.match(missing.result.error.message, /most likely still rendering/)
    assert.match(missing.result.error.message, /--wait 180/)
    assert.doesNotMatch(missing.result.error.message, /Reload|open it|not open/)
    const cache = path.join(project, '.aster/cache/figures')
    await mkdir(cache, { recursive: true })
    await writeFile(path.join(cache, 'method.png'), 'png')
    const sidecar = (sha) =>
      JSON.stringify({
        sceneSha256: sha,
        widthPx: 702,
        heightPx: 432,
        renderedAt: 't',
        compare: '.aster/cache/figures/method.compare.png',
        overlay: '.aster/cache/figures/method.overlay.png',
        print: '.aster/cache/figures/method.print.png',
        printDpi: 150,
        lint: '.aster/cache/figures/method.lint.png',
        lintFindings: 2
      })
    await writeFile(path.join(cache, 'method.json'), sidecar('old'))
    const stale = await harness(project, ['figures', 'preview', '--wait', '0.5'])
    assert.match(stale.result.error.message, /older version of the file/)
    assert.doesNotMatch(stale.result.error.message, /Reload|ask the user/)
    const sha = createHash('sha256').update(text).digest('hex')
    setTimeout(() => void writeFile(path.join(cache, 'method.json'), sidecar(sha)), 300)
    const fresh = await harness(project, ['figures', 'preview', '--wait', '5'])
    assert.equal(fresh.code, 0)
    assert.equal(fresh.result.png, path.join(cache, 'method.png'))
    assert.equal(fresh.result.widthPx, 702)
    assert.equal(fresh.result.compare, path.join(cache, 'method.compare.png'))
    assert.equal(fresh.result.overlay, path.join(cache, 'method.overlay.png'))
    assert.equal(fresh.result.print, path.join(cache, 'method.print.png'))
    assert.equal(fresh.result.lint, path.join(cache, 'method.lint.png'))
    const shown = spawnSync(process.execPath, [cli, 'figures', 'preview', '--project', project], {
      encoding: 'utf8'
    })
    assert.match(shown.stdout, /method\.print\.png\n\(the same page at print size, 150 dpi/)
    assert.match(shown.stdout, /2 lint findings boxed in red/)
    assert.equal(fresh.result.problem, null)
  })
})

test('figures preview warns when the current PNG is blank or far smaller than the page', async () => {
  await withProject(async (project) => {
    const text = JSON.stringify(newFigureScene({ widthIn: 3.25, heightIn: 2 }))
    await writeFile(path.join(project, 'paper/figures/method.excalidraw'), text)
    const cache = path.join(project, '.aster/cache/figures')
    await mkdir(cache, { recursive: true })
    const sha = createHash('sha256').update(text).digest('hex')
    await writeFile(
      path.join(cache, 'method.json'),
      JSON.stringify({ sceneSha256: sha, widthPx: 96, heightPx: 96, renderedAt: 't' })
    )
    await writeFile(
      path.join(cache, 'method.png'),
      encodePng(96, 96, Buffer.alloc(96 * 96 * 3, 255))
    )
    const blank = await harness(project, ['figures', 'preview', '--wait', '1'])
    assert.equal(blank.code, 0)
    assert.match(blank.result.problem, /blank \(96 × 96 px; the page is about 702 × 432\)/)
    const shown = spawnSync(process.execPath, [cli, 'figures', 'preview', '--project', project], {
      encoding: 'utf8'
    })
    assert.match(shown.stdout, /^WARNING The preview PNG is blank/)
    const pixels = Buffer.alloc(702 * 432 * 3, 255)
    pixels.fill(0, 3000, 3600)
    await writeFile(path.join(cache, 'method.png'), encodePng(702, 432, pixels))
    assert.equal((await harness(project, ['figures', 'preview'])).result.problem, null)
    assert.equal(pngIsBlank(encodePng(4, 4, Buffer.alloc(48, 200))), true)
    assert.equal(pngIsBlank(Buffer.from('not a png')), null)
  })
})

function pngHeader(width, height) {
  const bytes = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0)
  bytes.writeUInt32BE(13, 8)
  bytes.write('IHDR', 12, 'latin1')
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}

test('recurring paper shapes: polygons bind through a box, grids, nodes, stop-grad', () => {
  const [outline, box, label] = makeTrapezoid({
    id: 'vae',
    label: 'VAE Encoder',
    x: 0,
    y: 0,
    w: 200,
    h: 48
  })
  assert.equal(outline.type, 'line')
  assert.deepEqual(outline.points[0], outline.points.at(-1), 'closed, so Excalidraw fills it')
  assert.equal(box.id, 'vae')
  assert.equal(box.strokeColor, 'transparent')
  assert.equal(label.containerId, 'vae')
  const arch = makeRoundedEnd({ id: 'enc', side: 'top', w: 100, h: 120 })[0]
  assert.equal(Math.min(...arch.points.map((point) => point[1])) + arch.y, 0)
  assert.equal(makeGrid({ id: 'g', rows: 3, cols: 4 }).length, 13)
  assert.equal(makeNode({ id: 'sum', symbol: 'plus' }).filter((e) => e.type === 'line').length, 2)
  const arrow = figureElement('arrow', {
    id: 'a',
    x: 0,
    y: 0,
    width: 100,
    height: 0,
    points: [
      [0, 0],
      [100, 0]
    ]
  })
  const slashes = makeStopGrad(arrow, { at: 0.5 })
  assert.equal(slashes.length, 2)
  assert.ok(slashes.every((slash) => Math.abs(slash.x - 50) < 8))
})

test('a recreation takes the reference shape and colours, and crops photos from it', async () => {
  await withProject(async (project) => {
    const file = path.join(project, 'paper/figures/repa.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene({ widthIn: 3.25, heightIn: 2 })))
    await mkdir(path.join(project, 'paper/figures/references'), { recursive: true })
    await writeFile(path.join(project, 'paper/figures/references/repa.png'), pngHeader(300, 480))
    const figure = await openFigure(file)
    const page = await figure.setPage({
      reference: 'paper/figures/references/repa.png',
      matchReference: true
    })
    assert.equal(page.heightIn, 5.2)
    assert.equal(page.height, Math.round(5.2 * 144))
    assert.equal((await figure.reference()).unitsPerPixel, 468 / 300)
    figure.box({
      id: 'mha',
      label: 'Multi-Head\nAttention',
      x: 40,
      y: 40,
      fill: '#c9e4b8',
      stroke: '#c9e4b8'
    })
    figure.trapezoid({ id: 'vae', label: 'VAE', x: 40, y: 160, w: 160, h: 40, color: '#bfe3f5' })
    figure.arrow({ id: 'down', from: 'mha', to: 'vae', color: '#e02020', dashed: true })
    await figure.photo({
      id: 'cat',
      x: 40,
      y: 300,
      w: 64,
      h: 64,
      crop: { x: 10, y: 20, width: 40, height: 40 }
    })
    const report = await figure.save()
    assert.deepEqual(report.errors, [])
    assert.deepEqual(
      report.warnings.filter((w) => ['color', 'image'].includes(w.code)),
      []
    )
    const saved = JSON.parse(await readFile(file, 'utf8'))
    assert.ok(saved.files['aster-reference'].dataURL.startsWith('data:image/png;base64,'))
    const cat = saved.elements.find((element) => element.id === 'cat')
    assert.deepEqual(cat.crop, {
      x: 10,
      y: 20,
      width: 40,
      height: 40,
      naturalWidth: 300,
      naturalHeight: 480
    })
    const down = saved.elements.find((element) => element.id === 'down')
    assert.equal(down.endBinding.elementId, 'vae', 'binds to the invisible box over the polygon')
    const shown = await showFigure(project, 'repa')
    const photo = shown.images.find((image) => image.id === 'cat')
    assert.deepEqual(photo.pixels, { width: 40, height: 40 }, 'the crop, not the whole reference')
    assert.equal(photo.unitsPerPixel, 1.6)
    const missing = await harness(project, ['figures', 'reference'])
    assert.equal(missing.result.regions, null)
    await writeFile(
      path.join(project, 'paper/figures/references/repa.regions.json'),
      JSON.stringify({
        regions: [{ color: '#bfe3f5', x: 10, y: 20, width: 100, height: 50, fill: 1 }]
      })
    )
    const measured = await harness(project, ['figures', 'reference'])
    const [region] = measured.result.regions
    const scale = 468 / 300
    assert.equal(measured.result.unitsPerPixel, scale)
    assert.deepEqual(
      [region.x, region.y, region.width, region.height],
      [
        Math.round((page.x + 10 * scale) * 10) / 10,
        Math.round((page.y + 20 * scale) * 10) / 10,
        Math.round(100 * scale * 10) / 10,
        Math.round(50 * scale * 10) / 10
      ]
    )
  })
})
