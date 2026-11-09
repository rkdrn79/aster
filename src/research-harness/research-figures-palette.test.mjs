import assert from 'node:assert/strict'
import test from 'node:test'
import { lintFigureScene } from './research-figures-lint.mjs'
import { figureElement, newFigureScene } from './research-figures-model.mjs'
import { colorClass, contrast, deriveAccent, presetColors } from './research-figures-palette.mjs'
import { figureStyle, styleColor } from './research-figures-style.mjs'
import { makeBox } from './research-figures-draw.mjs'

const all = (report) => [...report.errors, ...report.warnings].map((entry) => entry.code)

test('any picked colour becomes the colour study’s tint, strong, shade and solid', () => {
  // The study's worked examples (palettes.json derived_examples).
  const expected = {
    '#2563eb': ['#cadaf8', '#8caae2', '#375da9', '#4f7cd9'],
    '#16a34a': ['#c4e6c9', '#79be86', '#0c7131', '#29984b'],
    '#ea580c': ['#f8d3c6', '#df997f', '#9e441f', '#c85b30']
  }
  for (const [pick, colors] of Object.entries(expected)) {
    const accent = deriveAccent(pick)
    assert.deepEqual([accent.tint, accent.strong, accent.shade, accent.solid], colors, pick)
    assert.ok(
      contrast(accent.shade, '#ffffff') >= 4.5 && contrast(accent.shade, accent.tint) >= 4.5
    )
  }
  assert.equal(deriveAccent('#ea580c').lossClash, true, 'orange sits too near a red loss')
  assert.equal(deriveAccent('#64748b').neutral, false)
  assert.equal(deriveAccent('#7a7f85').neutral, true, 'a nearly gray pick has no hue')
  const clashing = presetColors('graphite', '#dc2626')
  assert.equal(clashing.loss.text, clashing.text, 'the loss is ink')
  assert.equal(clashing.loss.clash, true, 'and a red loss would stay ink beside a red accent')
  assert.equal(presetColors('graphite').loss.tone, 'ink', 'ink by default, colour opt-in')
  assert.equal(colorClass('#d5e6f5').kind, 'hue', 'a pastel is a hue in OKLCH, not a gray')
  assert.equal(colorClass('#384a5a').kind, 'neutral', 'slate ink counts as a neutral')
  assert.equal(colorClass('#e9e9e9').kind, 'neutral')
})

test('presets: old names map, accents by swatch or hex, roles for every accent', () => {
  const graphite = figureStyle('neutral', 'blue')
  assert.equal(graphite.name, 'graphite')
  assert.deepEqual([graphite.line, graphite.accentColor.fill], ['#333333', '#c5def8'])
  assert.equal(figureStyle('slate').accentName, 'amber', 'slate takes a warm accent')
  const teal = figureStyle('graphite', '#0d9488')
  assert.equal(styleColor(teal, 'accent').fill, '#bae3dd')
  assert.equal(styleColor(teal, 'accent-ink').ink, deriveAccent('#0d9488').shade)
  const pair = figureStyle('blue-amber')
  assert.equal(styleColor(pair, 'secondary').fill, '#fedfa6')
  assert.equal(styleColor(pair, 'accent2').fill, '#fedfa6')
  const tonal = figureStyle('tonal', 'teal')
  assert.notEqual(tonal.block, figureStyle('tonal').block, 'tonal blocks follow the picked hue')
  const [hero] = makeBox({ id: 'h', label: 'ours', color: 'highlight', style: tonal })
  assert.equal(hero.backgroundColor, tonal.accents[0].highlight)
  assert.equal(
    figureStyle('print-mono', 'teal').accentColor.fill,
    '#d1d1d1',
    'mono keeps its grays'
  )
  assert.throws(() => styleColor(graphite, 'rainbow'), /figures kit colors/)
})

test('the colour lint scores the generated look and leaves a preset figure alone', () => {
  const scene = newFigureScene({ widthIn: 6.75, heightIn: 2 })
  const box = (id, x, fill, stroke = 'transparent') =>
    figureElement('rectangle', {
      id,
      x,
      y: 40,
      width: 100,
      height: 50,
      backgroundColor: fill,
      strokeColor: stroke
    })
  // One pastel step for four hues, each outlined in its own darker hue.
  scene.elements.push(
    box('a', 20, '#cfe3f8', '#2563eb'),
    box('b', 140, '#cdeed5', '#16a34a'),
    box('c', 260, '#f9e4c8', '#d97706'),
    box('d', 380, '#e8dcf8', '#7c3aed')
  )
  const generated = all(lintFigureScene(scene))
  for (const code of [
    'outline-hue',
    'uniform-tints',
    'hue-count',
    'library-color',
    'generated-palette'
  ]) {
    assert.ok(generated.includes(code), `${code} in ${generated.join(', ')}`)
  }
  const clean = newFigureScene({ widthIn: 6.75, heightIn: 2 })
  const style = figureStyle('graphite')
  clean.elements.push(
    ...makeBox({ id: 'e', label: 'encoder', x: 20, y: 40, style }),
    ...makeBox({ id: 'p', label: 'predictor', x: 200, y: 40, color: 'accent', style }),
    ...makeBox({ id: 'l', label: 'L', x: 380, y: 40, color: 'loss', style })
  )
  const found = all(lintFigureScene(clean))
  for (const code of [
    'outline-hue',
    'uniform-tints',
    'hue-count',
    'generated-palette',
    'text-contrast'
  ]) {
    assert.ok(!found.includes(code), `${code} in ${found.join(', ')}`)
  }
  const pale = newFigureScene({ widthIn: 6.75, heightIn: 2 })
  pale.elements.push(
    figureElement('rectangle', {
      id: 'bg',
      x: 20,
      y: 20,
      width: 200,
      height: 60,
      backgroundColor: '#1263a6'
    }),
    figureElement('text', {
      id: 't',
      x: 40,
      y: 40,
      width: 60,
      height: 20,
      text: 'dim',
      strokeColor: '#333333'
    })
  )
  assert.ok(all(lintFigureScene(pale)).includes('text-contrast'))
})
