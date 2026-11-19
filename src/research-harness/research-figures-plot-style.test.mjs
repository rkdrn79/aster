import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { PAGE_VENUES, PAGE_WIDTHS } from './research-figures-pages.mjs'
import {
  PLOT_LIB_FILE,
  PLOT_LIB_MARK,
  asterPlotSource,
  ensurePlotLib,
  plotLibVersion
} from './research-figures-plot-lib.mjs'
import { PLOT_FONTS, PLOT_PREVIEW_DPI, plotStyleData } from './research-figures-plot-style.mjs'
import { FIGURE_ACCENTS, FIGURE_STYLES, figureStyle } from './research-figures-style.mjs'

test('plots take every preset and accent exactly as the canvas derives them', () => {
  const data = plotStyleData()
  assert.deepEqual(Object.keys(data.presets), Object.keys(FIGURE_STYLES))
  assert.equal(data.defaultPreset, 'graphite')
  for (const [id, preset] of Object.entries(data.presets)) {
    const style = figureStyle(id)
    assert.equal(preset.ink, style.ink)
    assert.equal(preset.mid, style.mid)
    assert.equal(preset.mutedText, style.mutedText)
    assert.equal(preset.accents[0].solid, style.accents[0].solid)
    for (const name of Object.keys(FIGURE_ACCENTS)) {
      const accent = figureStyle(id, name).accents[0]
      assert.deepEqual(preset.withAccent[name], {
        fill: accent.fill,
        strong: accent.strong,
        ink: accent.ink,
        solid: accent.solid
      })
    }
  }
  assert.equal(data.presets['print-mono'].mono, true)
  assert.equal(data.swatches.teal.ink, FIGURE_ACCENTS.teal.stroke)
  assert.deepEqual(Object.keys(data.swatches).toSorted(), [...data.swatchOrder].toSorted())
  assert.equal(data.accentRule.tintL.length > 5, true)
})

test('plots share the canvas page widths, venues, text sizes and preview dpi', () => {
  const data = plotStyleData()
  assert.deepEqual(
    Object.fromEntries(Object.entries(data.sizes).map(([id, size]) => [id, size.widthIn])),
    Object.fromEntries(PAGE_WIDTHS.map((entry) => [entry.id, entry.widthIn]))
  )
  assert.equal(data.sizes.single.heightIn, 2)
  assert.equal(data.sizes.onehalf.heightIn, 2.2)
  assert.deepEqual(
    Object.keys(data.venues),
    PAGE_VENUES.map((venue) => venue.id)
  )
  assert.equal(data.venues.neurips.single, null)
  assert.deepEqual(data.fonts, PLOT_FONTS)
  assert.equal(data.previewDpi, PLOT_PREVIEW_DPI)
  assert.equal(data.doubleMaxHeightIn, 2.8)
})

test('aster_plot.py is one file with the style JSON in it and a version from its contents', () => {
  const source = asterPlotSource()
  assert.ok(source.startsWith(`${PLOT_LIB_MARK}\n"""aster_plot`))
  assert.ok(!source.includes('__ASTER_STYLE_JSON__'))
  const json = /STYLE_DATA = json\.loads\(r"""(.*?)"""\)/s.exec(source)[1]
  const data = JSON.parse(json)
  assert.equal(data.lib, plotLibVersion())
  assert.deepEqual(data.presets, plotStyleData().presets)
  assert.match(plotLibVersion(), /^[0-9a-f]{12}$/)
  assert.equal(plotLibVersion(), plotLibVersion())
  for (const name of ['def panels(', 'def save(', 'def check(', 'class toy', 'def surface(']) {
    assert.ok(source.includes(name), name)
  }
})

test('the helper is written beside the scripts, refreshed when Aster changes it, and a replaced one stays', async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'aster-plot-lib-'))
  try {
    const first = await ensurePlotLib(project, '.aster/figures')
    assert.deepEqual(first, { path: `.aster/figures/src/${PLOT_LIB_FILE}`, written: true })
    const file = path.join(project, first.path)
    assert.equal(await readFile(file, 'utf8'), asterPlotSource())
    assert.equal((await ensurePlotLib(project, '.aster/figures')).written, false)
    await writeFile(file, `${PLOT_LIB_MARK}\nold = True\n`)
    assert.equal((await ensurePlotLib(project, '.aster/figures')).written, true)
    await writeFile(file, 'mine = True\n')
    assert.equal((await ensurePlotLib(project, '.aster/figures')).written, false)
    assert.equal(await readFile(file, 'utf8'), 'mine = True\n')
  } finally {
    await rm(project, { recursive: true, force: true })
  }
})
