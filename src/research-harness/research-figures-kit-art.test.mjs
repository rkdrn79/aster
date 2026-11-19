// Hybrid figures: fig.art places generated art at its shape with anchors (its corners found from
// its pixels), draws exact grids over it, embeds a print-size copy, and lets labels sit on its
// clear part; a plane placed twice is a drawn glyph, not a repeated picture.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { prepareArt } from './research-figures-art.mjs'
import { openFigure } from './research-figures-kit.mjs'
import { lintFigureScene } from './research-figures-lint.mjs'
import { decodePng, encodePng } from './research-figures-png.mjs'

const exec = promisify(execFile)
const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url))
const SLUG = 'method-overview'

/** 200 × 100 white, a red square (white inside it) at the left and a blue bar at the right. */
function sheet() {
  const rgb = new Uint8Array(200 * 100 * 3).fill(255)
  const paint = (x0, y0, x1, y1, color) => {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        rgb.set(color, (y * 200 + x) * 3)
      }
    }
  }
  paint(20, 20, 80, 80, [200, 30, 30])
  paint(35, 35, 65, 65, [255, 255, 255])
  paint(130, 40, 180, 60, [30, 60, 200])
  return encodePng(200, 100, rgb)
}

async function withFigure(work) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-kit-art-')))
  try {
    await mkdir(path.join(project, '.aster'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    await exec(
      process.execPath,
      [CLI, 'figures', 'new', '--name', 'Method overview', '--project', project],
      {
        cwd: project
      }
    )
    await work(project, { folder: path.join(project, '.aster/figures/art', SLUG) })
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

test('fig.art places the art at its shape, maps anchors, grids a plane, and lets labels sit on its clear part', async () => {
  await withFigure(async (project, { folder }) => {
    await mkdir(folder, { recursive: true })
    await writeFile(path.join(folder, 'plane.png'), prepareArt(sheet()).pieces[0].png)
    const scene = path.join(project, '.aster/figures', `${SLUG}.excalidraw`)
    const fig = await openFigure(scene)
    const plane = fig.art({
      id: 'plane',
      part: 'plane',
      x: 40,
      y: 40,
      w: 166,
      anchors: { tl: [0.1, 0.25], br: [0.4, 0.75] }
    })
    assert.equal(Math.round(plane.box.w), 166)
    assert.deepEqual(plane.at([0, 0]).map(Math.round), [40, 40])
    const [x, y] = plane.at('br')
    assert.ok(
      Math.abs(x - (40 + 0.4 * plane.box.w)) < 1e-9 &&
        Math.abs(y - (40 + 0.75 * plane.box.h)) < 1e-9
    )
    assert.throws(() => plane.at('lens'), /no anchor "lens"/)
    const grid = plane.grid({
      id: 'win',
      corners: ['tl', [0.4, 0.25], 'br', [0.1, 0.75]],
      rows: 2,
      cols: 2,
      color: '#c0392b'
    })
    assert.deepEqual(grid.cell(0, 0).map(Math.round), plane.at([0.175, 0.375]).map(Math.round))
    const art = fig.get('plane').customData.asterArt
    assert.equal(art.part, 'plane')
    assert.equal(art.mask.length, art.maskSize ** 2)
    // On the art's clear right half (between the square and the bar: transparent) and on the square.
    plane.label([0.65, 0.12], { id: 'clear', text: 'x', side: 'right', gap: 2 })
    plane.label([0.2, 0.5], { id: 'drawn', text: 'y', side: 'right', gap: 2 })
    await fig.save()
    const report = lintFigureScene(JSON.parse(await readFile(scene, 'utf8')))
    const over = [...report.errors, ...report.warnings].filter((f) => f.code === 'label-over-image')
    assert.deepEqual(
      over.map((f) => f.message.match(/label (\w+)/)?.[1]),
      ['drawn']
    )
    assert.ok(
      report.errors.every((f) => !String(f.id).startsWith('win-')),
      'grid lines lint clean'
    )
  })
})

test('fig.art finds a plane’s corners, centres on cx, cy, embeds a print-size copy and counts as a drawn glyph', async () => {
  await withFigure(async (project, { folder }) => {
    await mkdir(folder, { recursive: true })
    // A sheared plane, 1200 × 400: top edge from x 300 to 1180, bottom from 20 to 900.
    const rgb = new Uint8Array(1200 * 400 * 3).fill(255)
    for (let y = 20; y < 380; y += 1) {
      const shift = Math.round(300 - ((y - 20) / 360) * 280)
      for (let x = shift; x < shift + 880; x += 1) {
        rgb.set([90, 140, 90], (y * 1200 + x) * 3)
      }
    }
    await writeFile(
      path.join(folder, 'plane.png'),
      prepareArt(encodePng(1200, 400, rgb)).pieces[0].png
    )
    const scene = path.join(project, '.aster/figures', `${SLUG}.excalidraw`)
    const fig = await openFigure(scene)
    const a = fig.art({ id: 'a', part: 'plane', cx: 100, cy: 60, w: 120 })
    fig.art({ id: 'b', part: 'plane', x: 240, y: 40, w: 120, opacity: 60 })
    assert.ok(
      Math.abs(a.box.x + a.box.w / 2 - 100) < 1e-6 && Math.abs(a.box.y + a.box.h / 2 - 60) < 1e-6
    )
    const [tlx] = a.at('tl')
    const [blx] = a.at('bl')
    assert.ok(
      tlx - a.box.x > 0.2 * a.box.w,
      'the top-left corner is found right of the bottom-left one'
    )
    assert.ok(blx - a.box.x < 0.08 * a.box.w)
    a.grid({ id: 'g', rows: 2, cols: 4, veil: 40 })
    assert.equal(fig.get('b').opacity, 60)
    assert.match(fig.get('a').customData.asterSource ?? '', /\.print\//)
    await fig.save()
    const saved = JSON.parse(await readFile(scene, 'utf8'))
    const embedded = Object.values(saved.files)[0]
    const bytes = Buffer.from(embedded.dataURL.split(',')[1], 'base64')
    assert.ok(decodePng(bytes).width <= 300, 'about 300 dpi for a 120-unit slot, not 1200 px')
    const report = lintFigureScene(saved)
    const codes = [...report.errors, ...report.warnings].map((f) => f.code)
    assert.ok(
      !codes.includes('repeat-picture'),
      'one plane drawn twice is a glyph, not a repeated picture'
    )
    assert.ok(!codes.includes('small-picture'))
  })
})
