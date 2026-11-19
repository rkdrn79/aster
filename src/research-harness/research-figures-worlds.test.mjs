import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { contrast, hexToOklch } from './research-figures-color-space.mjs'
import { makeBox } from './research-figures-draw.mjs'
import { lintFigureScene } from './research-figures-lint.mjs'
import { nearLibrary } from './research-figures-lint-color.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { PALETTE_PRESETS } from './research-figures-palette.mjs'
import {
  WORLD_PRESETS,
  worldChecks,
  worldMaps,
  worldSeries
} from './research-figures-palette-worlds.mjs'
import { asterPlotSource } from './research-figures-plot-lib.mjs'
import { plotStyleData } from './research-figures-plot-style.mjs'
import { FIGURE_STYLES, figureStyle, styleColor } from './research-figures-style.mjs'
import { createPythonFinder } from './research-python-finder.mjs'

const WORLDS = ['vision', 'generative', 'language', 'robotics', 'training', 'systems']
const codes = (report) => [...report.errors, ...report.warnings].map((entry) => entry.code)
const noteCodes = (report) => report.notes.map((entry) => entry.code)
const L = (hex) => hexToOklch(hex).L
const hue = (hex) => hexToOklch(hex).h

test('the worlds are presets for AI research figures, each drawn by one rule', () => {
  assert.deepEqual(Object.keys(WORLD_PRESETS), WORLDS)
  for (const id of WORLDS) {
    assert.ok(PALETTE_PRESETS[id] && FIGURE_STYLES[id], id)
    // Readable ink, outlines darker than fills, warm beside cool, tints never one pastel step.
    assert.deepEqual(worldChecks(WORLD_PRESETS[id]), [], id)
    for (const item of WORLD_PRESETS[id].accents.filter((entry) => entry.hue !== null)) {
      assert.ok(
        L(item.light) > L(item.tint) && L(item.dark) < L(item.tint),
        `${id} ${item.name} faces`
      )
      const turn = Math.abs(hue(item.dark) - hue(item.tint)) % 360
      assert.ok(Math.min(turn, 360 - turn) < 6, `${id} ${item.name} turns in one hue`)
    }
    const falling = worldMaps(WORLD_PRESETS[id]).world.map(L)
    assert.ok(
      falling.every((value, k) => k === 0 || value <= falling[k - 1]),
      `${id} world map`
    )
    const series = worldSeries(WORLD_PRESETS[id].accents)
    assert.equal(series[0], WORLD_PRESETS[id].accents[0].solid, 'ours first')
    assert.equal(series[1], WORLD_PRESETS[id].accents[3].solid, 'then the given (d)')
  }
})

test('no world colour, picked accents included, is a library default (Tailwind, draw.io)', () => {
  const parts = ['fill', 'light', 'dark', 'strong', 'stroke', 'ink', 'solid']
  for (const id of WORLDS) {
    for (const pick of [undefined, 'blue', 'teal', 'green', 'amber', 'clay', 'slate', 'violet']) {
      for (const item of figureStyle(id, pick).accents) {
        for (const part of parts) {
          assert.ok(!item[part] || !nearLibrary(item[part]), `${id}/${pick} ${item.name}-${part}`)
        }
      }
    }
  }
})

test('roles: a world gives each module type a hue; a quiet preset keeps its grays and accent', () => {
  const world = figureStyle('language')
  const roles = ['input', 'model', 'output', 'a'].map((name) => styleColor(world, name))
  assert.equal(new Set(roles.map((color) => color.fill)).size, 4)
  for (const color of roles) {
    assert.ok(L(color.stroke) < L(color.fill) - 0.25, 'outline darker than its fill')
    assert.ok(Math.abs(hue(color.stroke) - hue(color.fill)) < 20, 'in the fill’s hue')
    assert.ok(contrast(world.ink, color.fill) >= 7, 'text stays ink')
  }
  assert.equal(styleColor(world, 'data').fill, styleColor(world, 'input').fill)
  assert.ok(L(styleColor(world, 'model-light').fill) > L(styleColor(world, 'model').fill))
  assert.ok(L(styleColor(world, 'model-dark').fill) < L(styleColor(world, 'model').fill))
  assert.equal(styleColor(world, 'secondary').fill, styleColor(world, 'b').fill)
  assert.notEqual(styleColor(world, 'block').stroke, 'transparent', 'gray boxes are outlined too')
  const graphite = figureStyle('graphite')
  assert.equal(styleColor(graphite, 'model').fill, graphite.block)
  assert.equal(styleColor(graphite, 'input-ink').fill, graphite.ink)
  assert.equal(styleColor(graphite, 'a').fill, graphite.accents[0].fill)
  assert.equal(styleColor(figureStyle('blue-amber'), 'frozen').fill, '#fedfa6', 'given is amber')
})

test('a picked accent becomes ours in a world, and a component hue near it moves aside', () => {
  const own = figureStyle('training')
  const teal = figureStyle('training', 'teal')
  assert.equal(teal.accentName, 'teal')
  assert.ok(Math.abs(teal.accents[0].hue - 185) < 5)
  const model = teal.accents.find((item) => item.name === 'c')
  assert.ok(Math.abs(model.hue - own.accents[0].hue) < 1, 'the teal machinery takes the coral')
  assert.ok(L(teal.accents[0].stroke) < L(teal.accents[0].fill) - 0.25)
  assert.equal(figureStyle('training', '#7a7f85').accents[0].fill, own.accents[0].fill, 'gray pick')
  const data = plotStyleData().presets.training
  assert.equal(data.world.withAccents.teal[2].fill, model.fill)
  assert.deepEqual(data.world.series, worldSeries(own.accents))
})

function sceneOf(style, boxes, by = 'agent') {
  const scene = newFigureScene({ widthIn: 6.75, heightIn: 1.6 })
  boxes.forEach(([id, label, color], k) => {
    scene.elements.push(
      ...makeBox({ id, label, color, x: 20 + k * 150, y: 60, w: 120, h: 48, style })
    )
  })
  const page = scene.elements.find((element) => element.id === 'figure-page').customData.asterPage
  page.style = style.name
  page.agentStyle = by === 'agent' ? style.name : null
  return scene
}

test('the colour lint passes a world figure and suggests hues for a monotone one', () => {
  const world = figureStyle('systems')
  const coloured = lintFigureScene(
    sceneOf(world, [
      ['x', 'requests', 'input'],
      ['e', 'scheduler', 'model'],
      ['o', 'ours', 'a'],
      ['y', 'tokens', 'output'],
      ['f', 'language model', 'frozen']
    ])
  )
  for (const code of ['outline-hue', 'hue-count', 'every-box-coloured', 'generated-palette']) {
    assert.ok(!codes(coloured).includes(code), `${code} in ${codes(coloured).join(', ')}`)
  }
  assert.ok(!noteCodes(coloured).includes('monotone-figure'))
  const graphite = figureStyle('graphite')
  const gray = lintFigureScene(
    sceneOf(graphite, [
      ['x', 'tokenizer', 'block'],
      ['e', 'encoder', 'block'],
      ['n', 'norm', 'block'],
      ['d', 'decoder', 'block'],
      ['o', 'ours', 'accent']
    ])
  )
  assert.ok(noteCodes(gray).includes('monotone-figure'), noteCodes(gray).join(', '))
  const blue = lintFigureScene(
    sceneOf(graphite, [
      ['x', 'tokenizer', 'accent'],
      ['e', 'encoder', 'accent'],
      ['n', 'norm', 'accent'],
      ['d', 'decoder', 'accent']
    ])
  )
  assert.ok(noteCodes(blue).includes('monotone-figure'), noteCodes(blue).join(', '))
  const chosen = sceneOf(
    graphite,
    ['tokenizer', 'encoder', 'norm', 'decoder'].map((label) => [label, label, 'accent']),
    'person'
  )
  assert.ok(!noteCodes(lintFigureScene(chosen)).includes('monotone-figure'), 'the person’s pick')
  const blocks = lintFigureScene(
    sceneOf(graphite, [
      ['x', 'Block A', 'block'],
      ['e', 'Block B', 'block'],
      ['n', 'Block C 8×8', 'block'],
      ['d', 'Block D', 'block']
    ])
  )
  assert.ok(!noteCodes(blocks).includes('monotone-figure'), 'one type repeated is not monotone')
  const tonal = sceneOf(figureStyle('tonal'), [
    ['x', 'tokenizer', 'accent'],
    ['e', 'encoder', 'accent'],
    ['n', 'norm', 'accent'],
    ['d', 'decoder', 'accent']
  ])
  assert.ok(!noteCodes(lintFigureScene(tonal)).includes('monotone-figure'), 'tonal by design')
})

const python = await createPythonFinder({ modules: ['numpy', 'matplotlib'] })()

const TESTS = String.raw`
import json, sys
import numpy as np
import aster_plot as ap
E = json.load(open(sys.argv[1]))
ap.use("training")
assert ap.color("input") == E["input"], ap.color("input")
assert ap.color("model-fill") == E["modelFill"]
assert ap.color("ours") == E["ours"]
four = ap.series(4, ours=None, hues=True)
assert four == E["series"], four
assert ap.series(2, ours=None, hues=True) == E["series"][:2]
six = ap.series(6, ours=None, hues=True)
assert len(set(six)) == 6, six
for kind in ("seq", "div", "world", "surface"):
    assert len(ap.cmap(kind)(np.linspace(0, 1, 3))) == 3
ap.use("training", accent="teal")
assert ap.color("model-fill") == E["tealModelFill"]
ap.use("graphite")
assert ap.color("model") == ap.style().mid and ap.color("a") == ap.color("ours")
print("ok")
`

test(
  'aster_plot.py colours by role and series in a world',
  { skip: !python, timeout: 120_000 },
  async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), 'aster-plot-worlds-'))
    try {
      await writeFile(path.join(folder, 'aster_plot.py'), asterPlotSource())
      await writeFile(path.join(folder, 'test_worlds.py'), TESTS)
      const training = figureStyle('training')
      const accent = (style, name) => style.accents.find((item) => item.name === name)
      await writeFile(
        path.join(folder, 'expected.json'),
        JSON.stringify({
          input: accent(training, 'd').solid,
          modelFill: accent(training, 'c').fill,
          ours: training.accents[0].solid,
          series: worldSeries(WORLD_PRESETS.training.accents),
          tealModelFill: accent(figureStyle('training', 'teal'), 'c').fill
        })
      )
      const result = spawnSync(
        python,
        [path.join(folder, 'test_worlds.py'), path.join(folder, 'expected.json')],
        {
          cwd: folder,
          encoding: 'utf8',
          env: { ...process.env, MPLBACKEND: 'Agg', PYTHONDONTWRITEBYTECODE: '1' }
        }
      )
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  }
)
