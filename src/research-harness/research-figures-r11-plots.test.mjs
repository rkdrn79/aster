import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { checkFigures } from './research-figures.mjs'
import { refreshFigures, refreshText } from './research-figures-plot-refresh.mjs'
import {
  plotSvgInfo,
  refreshPlotEmbeds,
  sanitizePlotSvg,
  stalePlotFindings
} from './research-figures-plot-embed.mjs'
import { cellLabel, fitPlot } from './research-figures-kit-plots.mjs'

/** A plot SVG like aster_plot's .embed.svg: size in pt, glyphs drawn at scale(s -s). */
function plotSvg({
  widthPt = 216,
  heightPt = 144,
  glyph = 0.07,
  live = false,
  color = '#1263a6'
} = {}) {
  return [
    '<?xml version="1.0" encoding="utf-8" standalone="no"?>',
    `<svg xmlns:xlink="http://www.w3.org/1999/xlink" width="${widthPt}pt" height="${heightPt}pt" viewBox="0 0 ${widthPt} ${heightPt}" xmlns="http://www.w3.org/2000/svg" version="1.1">`,
    ' <metadata><dc:date>2026-11-17T05:00:00</dc:date></metadata>',
    ` <path d="M 30 120 L 200 20" style="stroke: ${color}; fill: none"/>`,
    ` <g transform="translate(20 140) scale(${glyph} -${glyph})"><use xlink:href="#DejaVuSans-30"/></g>`,
    live ? ' <text x="10" y="10" style="font-size: 8px; font-family: DejaVu Sans">loss</text>' : '',
    '</svg>'
  ].join('\n')
}

const sha = (text) => createHash('sha256').update(text).digest('hex')

async function withProject(run, size = { widthIn: 6.75, heightIn: 5 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r11p-')))
  try {
    const folder = path.join(project, '.aster/figures')
    await mkdir(path.join(folder, 'src'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const file = path.join(folder, 'diagram.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene(size)))
    /** Writes plot `slug` the way aster_plot does: its embed SVG and manifest. */
    const writePlot = async (slug, options = {}, manifest = {}) => {
      const svg = plotSvg(options)
      await writeFile(path.join(folder, `${slug}.embed.svg`), svg)
      await writeFile(path.join(folder, `src/${slug}.plot.py`), manifest.scriptText ?? 'print(1)\n')
      await writeFile(
        path.join(folder, `${slug}.plot.json`),
        JSON.stringify({
          kind: 'aster-plot',
          version: 1,
          slug,
          script: `src/${slug}.plot.py`,
          sourceSha256: sha(manifest.scriptText ?? 'print(1)\n'),
          size: {
            widthIn: (options.widthPt ?? 216) / 72,
            heightIn: (options.heightPt ?? 144) / 72
          },
          style: manifest.style ?? { preset: 'graphite', accent: 'blue' },
          panels: manifest.panels ?? [
            {
              id: 'a',
              label: null,
              title: null,
              kind: '2d',
              box: { x: 0.5, y: 0.2, w: 2, h: 1.4 },
              xlim: [0, 10],
              ylim: [0, 100],
              xscale: 'linear',
              yscale: 'linear'
            }
          ],
          files: {
            embed: `${slug}.embed.svg`,
            svg: `${slug}.svg`,
            pdf: `${slug}.pdf`,
            png: `${slug}.png`
          },
          sha256: { embed: sha(svg) }
        })
      )
      return svg
    }
    await run({ project, folder, file, writePlot })
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const quiet = async (run) => {
  const warned = []
  const warn = console.warn
  console.warn = (message) => warned.push(String(message))
  try {
    return { value: await run(), warned }
  } finally {
    console.warn = warn
  }
}
const codes = (report) => [...report.errors, ...report.warnings].map((finding) => finding.code)

test('a plot SVG is made safe and stable, and measured', () => {
  const svg = sanitizePlotSvg(
    '<?xml version="1.0"?><!DOCTYPE svg><svg width="100" height="50"><metadata>today</metadata><!-- note --><script>alert(1)</script><rect onload="x()" width="1" height="1"/><image href="https://example.com/a.png"/><image href="data:image/png;base64,AAA"/></svg>trailing'
  )
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/)
  for (const gone of ['metadata', 'script', 'onload', 'example.com', 'note', 'trailing']) {
    assert.ok(!svg.includes(gone), gone)
  }
  assert.throws(() => sanitizePlotSvg('<html></html>'), /not an SVG/)
  const info = plotSvgInfo(svg)
  assert.deepEqual([info.widthPt, info.heightPt, info.rasters], [75, 37.5, 1])
  const plot = plotSvgInfo(sanitizePlotSvg(plotSvg({ live: true })))
  assert.equal(plot.minFontPt, 7)
  assert.equal(plot.liveText, 1)
  assert.equal(plotSvgInfo('<svg viewBox="0 0 200 100"></svg>').widthPt, 150)
  assert.throws(() => plotSvgInfo('<svg></svg>'), /has no size/)
  assert.equal(
    sanitizePlotSvg(plotSvg()),
    sanitizePlotSvg(plotSvg().replace('2026-11-17', '2027-01-01')),
    'the date does not change the file'
  )
})

test('fitting keeps a plot’s shape; labels count a, b, c', () => {
  const natural = { width: 400, height: 200 }
  assert.deepEqual(fitPlot(natural, {}), { width: 400, height: 200, scale: 1 })
  assert.deepEqual(fitPlot(natural, { w: 200 }), { width: 200, height: 100, scale: 0.5 })
  assert.deepEqual(fitPlot(natural, { w: 300, h: 300 }), { width: 300, height: 150, scale: 0.75 })
  assert.throws(() => fitPlot(natural, { id: 'p', w: -1 }), /w must be a positive number/)
  assert.deepEqual(
    [cellLabel('(a)', 1), cellLabel('A', 2), cellLabel('a)', 0), cellLabel(['x'], 0)],
    ['(b)', 'C', 'a)', 'x']
  )
})

test('fig.plot embeds a plot figure as a vector SVG image with its panels', async () => {
  await withProject(async ({ file, writePlot }) => {
    await writePlot('loss')
    const fig = await openFigure(file)
    const placed = await fig.plot({ id: 'p', figure: 'loss', x: 20, y: 20 })
    assert.deepEqual([placed.width, placed.height, placed.scale], [432, 288, 1])
    const image = fig.get('p')
    assert.equal(image.type, 'image')
    assert.match(image.fileId, /^aster-plot-[0-9a-f]{16}$/)
    assert.equal(fig.scene.files[image.fileId].mimeType, 'image/svg+xml')
    assert.equal(image.customData.asterPlot.figure, 'loss')
    assert.equal(placed.panels[0].x, 20 + 0.5 * 144)
    const fitted = await fig.plot({ id: 'q', figure: 'loss', x: 500, y: 20, w: 300, h: 300 })
    assert.equal(fitted.width, 300)
    assert.equal(fitted.y, 20 + (300 - 200) / 2, 'centred in the box')
    const { warned } = await quiet(() =>
      fig.plot({ id: 'tiny', figure: 'loss', x: 20, y: 320, w: 150 })
    )
    assert.match(warned.join('\n'), /prints at 2\.4 pt/)
    await assert.rejects(fig.plot({ id: 'none', figure: 'nope' }), /No rendered plot nope/)
    await assert.rejects(
      fig.plot({ id: 'both', figure: 'loss', svg: 'x.svg' }),
      /exactly one of figure/
    )
    await assert.rejects(fig.plot({ id: 'slug', figure: '../x' }), /must be a plot slug/)
    const report = await fig.save()
    assert.ok(!codes(report).includes('image'), 'a plot is not a stray image')
    assert.ok(codes(report).includes('plot-small-text'))
    const saved = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(
      Object.keys(saved.files).filter((id) => id.startsWith('aster-plot-')).length,
      1,
      'one plot, one file'
    )
  })
})

test('fig.plot takes SVG paths and markup too, and warns on live text', async () => {
  await withProject(async ({ project, file }) => {
    await writeFile(path.join(project, 'standin.svg'), plotSvg({ widthPt: 100, heightPt: 100 }))
    const fig = await openFigure(file)
    const fromPath = await fig.plot({ id: 'a', svg: 'standin.svg', x: 20, y: 20 })
    assert.equal(fromPath.width, 200)
    assert.equal(fig.get('a').customData.asterPlot.source, 'standin.svg')
    const { warned } = await quiet(() =>
      fig.plot({ id: 'b', svg: plotSvg({ live: true }), x: 240, y: 20, w: 200 })
    )
    assert.match(warned.join('\n'), /text elements live/)
    await assert.rejects(fig.plot({ id: 'c', svg: 'missing.svg' }), /No SVG at missing.svg/)
    assert.ok(codes(await fig.save()).includes('plot-live-text'))
  })
})

test('fig.plots lays several plots out at one scale with (a), (b) labels or captions', async () => {
  await withProject(
    async ({ file, writePlot }) => {
      await writePlot('one')
      await writePlot('two', { widthPt: 180, heightPt: 144 })
      await writePlot(
        'own',
        {},
        { panels: [{ id: 'a', label: '(a)', kind: '2d', box: { x: 0.4, y: 0.2, w: 2, h: 1.4 } }] }
      )
      const fig = await openFigure(file)
      const grid = await fig.plots({
        id: 'g',
        x: 12,
        y: 12,
        w: 700,
        grid: [1, 3],
        items: [{ figure: 'one' }, { figure: 'two' }, { figure: 'own' }]
      })
      assert.deepEqual(grid.ids, ['g-0', 'g-1', 'g-2'])
      const scales = grid.cells.map(
        (cell) => fig.get(cell.id).width / (fig.get(cell.id).customData.asterPlot.widthPt * 2)
      )
      assert.ok(
        scales.every((scale) => Math.abs(scale - grid.scale) < 1e-3),
        'one scale for all'
      )
      assert.ok(grid.scale <= 1)
      assert.ok(fig.bounds('g-0-label').width > 0 && fig.bounds('g-1-label').width > 0)
      assert.ok(
        !fig.elements.some((element) => element.id.startsWith('g-2-label')),
        'a plot with its own label keeps it'
      )
      const captioned = await fig.plots({
        id: 'c',
        x: 12,
        y: 260,
        w: 700,
        items: [
          { figure: 'one', id: 'left' },
          { figure: 'two', id: 'right' }
        ],
        captions: ['FID', 'recall']
      })
      assert.deepEqual(captioned.ids, ['left', 'right'])
      assert.ok(
        fig.bounds('left-label').y > fig.get('left').y + fig.get('left').height,
        'a caption sits under its plot'
      )
      await assert.rejects(
        fig.plots({ id: 'x', grid: [1, 1], items: [{ figure: 'one' }, { figure: 'two' }] }),
        /no room for 2 items/
      )
      const report = await fig.save()
      assert.ok(!codes(report).includes('plot-scale-mismatch'))
    },
    { heightIn: 4 }
  )
})

test('plotPoint aims inside a plot: shares, a panel’s shares, data points', async () => {
  await withProject(async ({ file, writePlot }) => {
    await writePlot('loss')
    await writePlot(
      'logs',
      {},
      {
        panels: [
          {
            id: 'a',
            kind: '2d',
            box: { x: 0, y: 0, w: 3, h: 2 },
            xlim: [1, 100],
            ylim: [0, 1],
            xscale: 'log',
            yscale: 'linear'
          }
        ]
      }
    )
    const fig = await openFigure(file)
    await fig.plot({ id: 'p', figure: 'loss', x: 0, y: 0, scale: 0.5 })
    assert.deepEqual(fig.plotPoint('p', [0, 0]), [0, 144])
    assert.deepEqual(fig.plotPoint('p', { panel: 'a', at: [0, 1] }), [36, 14.4])
    const [x, y] = fig.plotPoint('p', { panel: 'a', data: [5, 50] })
    assert.ok(Math.abs(x - (36 + 72)) < 1e-9 && Math.abs(y - (14.4 + 50.4)) < 1e-9)
    await fig.plot({ id: 'l', figure: 'logs', x: 0, y: 200 })
    assert.ok(
      Math.abs(fig.plotPoint('l', { panel: 'a', data: [10, 0] })[0] - 216) < 1e-9,
      'a log axis puts 10 halfway from 1 to 100'
    )
    assert.throws(() => fig.plotPoint('p', { panel: 'z', at: [0, 0] }), /has no panel "z"/)
    assert.throws(() => fig.plotPoint('p', { panel: 'a', at: [0] }), /takes \[u, v\]/)
    fig.box({ id: 'b', x: 600, y: 10, w: 40, h: 24 })
    assert.throws(() => fig.plotPoint('b', [0, 0]), /is not a plot/)
    fig.text({ id: 'note', text: 'best', x: 300, y: 20 })
    fig.arrow({
      id: 'to-plot',
      from: 'note',
      to: fig.plotPoint('p', { panel: 'a', data: [8, 80] }),
      allowDiagonal: true
    })
    assert.deepEqual((await fig.save()).errors, [])
  })
})

test('a plot rendered again: check reports it, refresh swaps it in where it sits', async () => {
  await withProject(async ({ project, folder, file, writePlot }) => {
    await writePlot('loss')
    const fig = await openFigure(file)
    await fig.plot({ id: 'p', figure: 'loss', x: 40, y: 30, w: 300 })
    await fig.save()
    const before = JSON.parse(await readFile(file, 'utf8'))
    assert.deepEqual(await stalePlotFindings(project, folder, before), [])
    await writePlot(
      'loss',
      { widthPt: 216, heightPt: 108, color: '#a04037' },
      { scriptText: 'print(2)\n' }
    )
    const check = await checkFigures(project, 'diagram')
    assert.ok(codes(check.figures[0]).includes('plot-stale'))
    await writeFile(path.join(folder, 'src/loss.plot.py'), 'print(3)\n')
    assert.ok(
      (await stalePlotFindings(project, folder, before)).some(
        (finding) => finding.code === 'plot-script-changed'
      )
    )
    const result = await refreshFigures(project, { plot: 'loss' })
    assert.deepEqual(result.figures.find((entry) => entry.slug === 'diagram').changed, ['p'])
    assert.match(refreshText(result), /new render of p/)
    const after = JSON.parse(await readFile(file, 'utf8'))
    const image = after.elements.find((element) => element.id === 'p')
    assert.deepEqual([image.x, image.y, image.width, image.height], [40, 30, 300, 150])
    assert.ok(after.files[image.fileId])
    assert.equal(
      Object.keys(after.files).filter((id) => id.startsWith('aster-plot-')).length,
      1,
      'the old render is dropped'
    )
    assert.deepEqual(
      await refreshPlotEmbeds(project, folder, 'loss'),
      [],
      'nothing left to refresh'
    )
    assert.match(refreshText(await refreshFigures(project)), /latest render/)
    await assert.rejects(refreshFigures(project, { figure: 'nope' }), /No figure nope/)
  })
})

test('refreshPlots in a script and the hook for figures plot run', async () => {
  await withProject(async ({ project, folder, file, writePlot }) => {
    await writePlot('loss')
    const fig = await openFigure(file)
    await fig.plot({ id: 'p', figure: 'loss', x: 40, y: 30 })
    await fig.save()
    await writePlot('loss', { color: '#207029' })
    assert.deepEqual(await fig.refreshPlots(), ['p'])
    await fig.save()
    await writePlot('loss', { color: '#000000' })
    assert.deepEqual(await refreshPlotEmbeds(project, folder, 'loss'), [
      '.aster/figures/diagram.excalidraw'
    ])
  })
})

test('lint: a stretched, shrunk, mixed or off-style plot is named', async () => {
  await withProject(async ({ file, writePlot }) => {
    await writePlot('loss')
    await writePlot('teal', {}, { style: { preset: 'graphite', accent: 'teal' } })
    const fig = await openFigure(file)
    fig.style('graphite', { accent: 'blue' })
    await fig.plot({ id: 'a', figure: 'loss', x: 20, y: 20, w: 300 })
    await fig.plot({ id: 'b', figure: 'teal', x: 340, y: 20, w: 300 })
    fig.get('a').height += 40
    const report = await fig.save({ dryRun: true })
    assert.ok(
      report.errors.some((finding) => finding.code === 'plot-distorted' && finding.id === 'a')
    )
    assert.ok(
      report.warnings.some((finding) => finding.code === 'plot-style' && finding.id === 'b')
    )
    const grid = await fig.plots({
      id: 'g',
      x: 20,
      y: 280,
      w: 600,
      items: [{ figure: 'loss' }, { figure: 'loss' }]
    })
    fig.get(grid.ids[1]).width /= 2
    fig.get(grid.ids[1]).height /= 2
    assert.ok(codes(await fig.save({ dryRun: true })).includes('plot-scale-mismatch'))
  })
})
