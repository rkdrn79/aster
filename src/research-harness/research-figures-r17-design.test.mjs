// Round 17 design layer: the focus is declared and alone takes the accent; one declared dimension
// may take a pale colour; everything else is ink on white whatever the world painted; each fact
// appears once (the say-it-once lint); the craft counts; `figures critique` reports it all.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { hexToOklch } from './research-figures-color-space.mjs'
import { FOCUS_STROKE, normalizeDesign } from './research-figures-design.mjs'
import { factValues, normalFact } from './research-figures-lint-repeat.mjs'
import { critiqueScene, critiqueText } from './research-figures-design-report.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2.4 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r17d-')))
  try {
    await mkdir(path.join(project, '.aster/figures'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const file = path.join(project, '.aster/figures/fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene(size)))
    await run(await openFigure(file))
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const codes = (report) => [...report.errors, ...report.warnings, ...report.notes].map((e) => e.code)
const chroma = (hex) => hexToOklch(hex)?.C ?? 0

/** Three boxes in a world palette, coloured by component type, the agentic way. */
function typed(fig) {
  fig.style('generative')
  fig.box({ id: 'enc', label: 'Encoder', x: 24, y: 40, w: 96, h: 40, color: 'model' })
  fig.box({ id: 'ours', label: 'Ours', x: 152, y: 32, w: 160, h: 56, color: 'a' })
  fig.box({ id: 'dec', label: 'Decoder', x: 344, y: 40, w: 96, h: 40, color: 'input' })
  fig.arrow({ id: 'e1', from: 'enc', to: 'ours' })
  fig.arrow({ id: 'e2', from: 'ours', to: 'dec', role: 'grad' })
}

test('the focus alone takes the accent; every other colour turns ink on white', async () => {
  await withFigure(async (fig) => {
    typed(fig)
    fig.focus(['ours'])
    const report = await fig.save()
    const ours = fig.get('ours')
    assert.equal(ours.backgroundColor, fig.palette().accents[0].fill)
    assert.ok(chroma(ours.strokeColor) < 0.03, 'an ink outline, never a darker shade of the fill')
    assert.equal(ours.strokeWidth, FOCUS_STROKE)
    for (const id of ['enc', 'dec']) {
      assert.equal(fig.get(id).backgroundColor, '#ffffff', `${id} turns white`)
      assert.ok(chroma(fig.get(id).strokeColor) < 0.03, `${id} keeps a neutral outline`)
    }
    assert.ok(chroma(fig.get('e2').strokeColor) < 0.03, 'a gradient arrow off the focus is ink')
    assert.ok(!codes(report).includes('paper-stroke'), 'the focus may be 1 pt')
    assert.ok(!codes(report).includes('monotone-figure'), 'ink with one accent is the choice')
    assert.equal(fig.page.id, 'figure-page')
  })
})

test('without a declaration nothing changes (the layer is opt-in)', async () => {
  await withFigure(async (fig) => {
    typed(fig)
    const report = await fig.save()
    assert.notEqual(fig.get('enc').backgroundColor, '#ffffff')
    assert.ok(!codes(report).some((code) => code.startsWith('focus-') || code === 'colour-meaning'))
  })
})

test('one dimension: a pale hue for its values, white for neutral ones, gray for frozen', async () => {
  await withFigure(async (fig) => {
    typed(fig)
    fig.box({ id: 'clip', label: 'CLIP', x: 24, y: 120, w: 96, h: 40, color: 'frozen' })
    fig.focus(['ours'])
    fig.colourBy('modality', { image: ['enc'], text: ['dec'] }, { neutral: ['text'] })
    await fig.save()
    const image = hexToOklch(fig.get('enc').backgroundColor)
    assert.ok(image.C >= 0.03 && image.L >= 0.88, 'a pale hue')
    assert.equal(fig.get('dec').backgroundColor, '#ffffff')
    assert.equal(fig.get('clip').backgroundColor, '#ffffff', 'an undeclared role turns white')
  })
  await withFigure(async (fig) => {
    typed(fig)
    fig.focus(['ours'])
    fig.colourBy('trainable', { frozen: ['enc'] })
    await fig.save()
    const frozen = hexToOklch(fig.get('enc').backgroundColor)
    assert.ok(frozen.C < 0.01 && frozen.L < 0.97, 'frozen is a light gray')
  })
  assert.throws(
    () => normalizeDesign({ colourBy: { dimension: 'stage', a: ['x'], b: ['y'], c: ['z'] } }),
    /one or two colours/
  )
})

test('fig.reset clears the design brief with the allowances', async () => {
  await withFigure(async (fig) => {
    typed(fig)
    fig.design({ focus: ['ours'], brief: 'ours is the point' })
    assert.deepEqual(fig.get('figure-page').customData.asterDesign.focus, ['ours'])
    fig.reset()
    assert.equal(fig.get('figure-page').customData.asterDesign, undefined)
  })
})

test('the design lint: a weak focus, competing parts, repeats and crude craft', async () => {
  await withFigure(async (fig) => {
    fig.style('generative')
    fig.box({ id: 'f', label: 'Ours', x: 24, y: 40, w: 48, h: 24 })
    for (const [index, x] of [120, 232, 344].entries()) {
      fig.box({ id: `p${index}`, label: 'Linear', x, y: 32, w: 96, h: 40 })
    }
    fig.box({ id: 'big', label: 'Backbone', x: 480, y: 24, w: 200, h: 80 })
    fig.box({ id: 'opt', label: 'Opt.', x: 720, y: 32, w: 96, h: 40, dashed: true })
    fig.text({ id: 's1', text: '$77\\times4096$', x: 24, y: 140 })
    fig.text({ id: 's2', text: '$77 \\times 4096$', x: 200, y: 140 })
    fig.text({ id: 'n1', text: 'A: 132 114 128 5 25 156', x: 24, y: 200 })
    fig.tokens({ id: 'tok', x: 400, y: 180, items: ['132', '114', '128', '5', '25', '156'] })
    fig.tokens({ id: 'col', x: 860, y: 140, direction: 'column', items: ['a', 'photo', 'of'] })
    fig.focus(['f'])
    const report = await fig.save()
    const found = codes(report)
    for (const code of [
      'focus-weak',
      'competing-emphasis',
      'repeat-text',
      'repeat-value',
      'stacked-tokens',
      'dashed-box'
    ]) {
      assert.ok(found.includes(code), `${code} in ${found.join(', ')}`)
    }
    const repeats = report.warnings.filter((entry) => entry.code === 'repeat-text')
    assert.ok(
      !repeats.some((entry) => /Linear/.test(entry.message)),
      'module names (Linear ×3) pass'
    )
  })
})

test('photos of mixed sizes and a caption without its picture', async () => {
  await withFigure(async (fig) => {
    fig.image({ id: 'a', kind: 'cat', x: 24, y: 24, w: 96, h: 72 })
    fig.text({ id: 'ca', text: 'Put the cup on the tray', size: 14, x: 128, y: 40 })
    fig.image({ id: 'b', kind: 'dog', x: 24, y: 112, w: 64, h: 48 })
    fig.text({ id: 'cb', text: 'Pick the falling bag', size: 14, x: 128, y: 120 })
    fig.text({ id: 'cc', text: 'Pick object that is different', size: 14, x: 128, y: 200 })
    fig.box({ id: 'm', label: 'Model', x: 400, y: 40, w: 120, h: 48 })
    fig.focus(['m'])
    const found = codes(await fig.save())
    assert.ok(found.includes('photo-sizes'), found.join(', '))
    assert.ok(found.includes('orphan-caption'), found.join(', '))
  })
})

test('facts are compared with TeX and spacing normalised', () => {
  assert.equal(normalFact('$77 \\times 4096$'), normalFact('77×4096'))
  assert.equal(normalFact('\\Delta T = [0.1, -0.2, 0]'), normalFact('ΔT = [0.1, −0.2, 0]'))
  assert.deepEqual(factValues('ΔTranslation = [0.1, −0.2, 0]').slice(0, 1), ['[0.1,-0.2,0]'])
  assert.ok(factValues('A: 132 114 128 5 25 156').includes('132 114 128 5 25 156'))
  assert.deepEqual(factValues('t ∼ U(0, 1)'), [])
})

test('figures critique: the focus, the colours, the repeats, the counts and the cuts', async () => {
  await withFigure(async (fig) => {
    typed(fig)
    for (const [index, x] of [24, 152, 280, 408].entries()) {
      fig.box({ id: `m${index}`, label: 'MLP', x, y: 200, w: 96, h: 40, color: 'model' })
    }
    fig.text({ id: 'f1', text: 'frozen', x: 24, y: 120 })
    fig.text({ id: 'f2', text: 'frozen', x: 344, y: 120 })
    await fig.save()
    const undeclared = critiqueScene(fig.scene)
    const text = critiqueText('fig', undeclared)
    assert.match(text, /Focus: none declared/)
    assert.match(text, /undeclared|c \(machinery\)/)
    assert.match(text, /"frozen" is written twice/)
    assert.match(text, /Cut before polishing/)
    fig.focus(['ours'])
    await fig.save()
    const declared = critiqueScene(fig.scene)
    assert.equal(declared.focus.items[0], 'ours')
    assert.equal(declared.hues.length, 1)
    assert.match(critiqueText('fig', declared), /Focus: ours: leads/)
  })
})
