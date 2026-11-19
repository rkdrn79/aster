// The paper look (round 16): figures drawn as published papers draw them. One LaTeX face for
// words (Computer Modern, or Times from the manuscript's preamble), panels apart in whitespace
// with the title above and "(a)" below, networks as bars, frozen and trainable in words, no icons
// unless asked, one thin stroke and square corners, and an academic-look count in the lint.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene, figurePage } from './research-figures-model.mjs'
import { figureStyle } from './research-figures-style.mjs'
import { PAPER_SERIF, paperSerif, serifForPreamble } from './research-figures-paper-fonts.mjs'
import { PAPER_STROKE, paperQuotes } from './research-figures-paper.mjs'
import { splitPanelTitle } from './research-figures-kit-paper-panel.mjs'
import { measureText, missingGlyphs, textBaseline } from './research-figures-text.mjs'
import { lintFigureScene } from './research-figures-lint.mjs'

async function withFigure(run, { preamble = '\\documentclass{article}\n', size } = {}) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-paper-')))
  try {
    const folder = path.join(project, '.aster/figures')
    await mkdir(folder, { recursive: true })
    await mkdir(path.join(project, 'paper'), { recursive: true })
    await writeFile(
      path.join(project, 'paper/main.tex'),
      `${preamble}\\begin{document}\n\\end{document}\n`
    )
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const file = path.join(folder, 'fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene(size ?? { widthIn: 6.75, heightIn: 2.4 })))
    await run(await openFigure(file), file)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const live = (fig) => fig.elements.filter((element) => !element.isDeleted)
const texts = (fig) => live(fig).filter((element) => element.type === 'text')
const codes = (report) =>
  [...report.errors, ...report.warnings, ...report.notes].map((entry) => entry.code)

async function quietly(run) {
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

test('the face follows the preamble: Times for times, newtx and venue styles, else Computer Modern', () => {
  assert.equal(serifForPreamble('\\documentclass{article}\n\\begin{document}'), 'cm')
  assert.equal(serifForPreamble('\\usepackage{times}\n'), 'times')
  assert.equal(serifForPreamble('\\usepackage[final]{neurips_2025}'), 'times')
  assert.equal(serifForPreamble('\\usepackage{iclr2026_conference,times}'), 'times')
  assert.equal(serifForPreamble('\\usepackage{cvpr}'), 'times')
  assert.equal(serifForPreamble('\\documentclass{llncs}'), 'cm')
  assert.equal(serifForPreamble('% \\usepackage{times}\n\\usepackage{amsmath}'), 'cm')
  assert.equal(serifForPreamble('\\begin{document}\\usepackage{times}'), 'cm')
  assert.equal(serifForPreamble(''), null)
  assert.equal(paperSerif('Times').key, 'times')
  assert.equal(paperSerif('TeX Gyre Termes').id, PAPER_SERIF.times.id)
  assert.equal(paperSerif('helvetica'), null)
})

test('the paper faces are measured from their own advances and sit on Excalidraw’s fallback baseline', () => {
  const sans = measureText('Volume Rendering', 16).width
  const cm = measureText('Volume Rendering', 16, PAPER_SERIF.cm.id).width
  const times = measureText('Volume Rendering', 16, PAPER_SERIF.times.id).width
  assert.ok(cm > 100 && cm !== sans && times < cm, `${sans} ${cm} ${times}`)
  assert.deepEqual(missingGlyphs('“g.t.” – 5D Input', PAPER_SERIF.cm.id), [])
  assert.equal(textBaseline(PAPER_SERIF.cm.id), 0.881)
  assert.ok(textBaseline(9) > 0.95)
})

test('the paper look keeps the preset’s colours and sets type, weights, heads and corners', () => {
  const base = figureStyle('vision')
  const paper = figureStyle('vision', undefined, { look: 'paper' })
  assert.equal(paper.look, 'paper')
  assert.equal(paper.fontFamily, PAPER_SERIF.cm.id)
  assert.equal(figureStyle('vision', undefined, { look: 'paper', font: 'times' }).fontFamily, 21)
  assert.equal(paper.block, base.block)
  assert.deepEqual(paper.accents, base.accents)
  assert.equal(paper.radius, 2)
  assert.equal(paper.outlineWidth, PAPER_STROKE)
  for (const [role, look] of Object.entries(paper.arrowRoles)) {
    assert.equal(look.strokeWidth, PAPER_STROKE, role)
    assert.ok(look.headSize <= 7, role)
  }
  assert.equal(paper.arrowRoles.cond.color, 'line')
  assert.equal(base.look, undefined)
})

test('the paper look is the default; fig.style keeps the colours, reads the face from the preamble and stays on the page', async () => {
  await withFigure(async (fig) => {
    fig.style('generative')
    const style = fig.style('paper')
    assert.equal(style.name, 'generative')
    assert.equal(style.paperFont, 'cm')
    assert.equal(fig.page.look, 'paper')
    assert.equal(fig.page.paperFont, 'cm')
    assert.throws(() => fig.style('paper', { font: 'helvetica' }), /'cm'.*'times'/)
    assert.equal(fig.style('generative', { look: 'preset' }).look, undefined)
    assert.equal(figurePage(fig.elements).look, 'preset')
    assert.equal(fig.style('generative', { accent: 'teal' }).look, undefined, 'preset stays asked')
    assert.equal(fig.style('vision', { look: 'paper' }).look, 'paper')
    assert.equal(fig.style('illustrative').look, undefined, 'a teaser takes its own look')
    assert.equal(fig.style('vision').look, 'paper', 'and a preset again the default')
  })
  await withFigure(
    async (fig) => {
      assert.equal(fig.style('paper').fontFamily, PAPER_SERIF.times.id)
      assert.equal(fig.style('paper', { font: 'cm' }).paperFont, 'cm')
    },
    { preamble: '\\documentclass{article}\n\\usepackage[final]{neurips_2025}\n' }
  )
})

test('a reopened paper-look figure draws in the paper look', async () => {
  await withFigure(async (fig, file) => {
    fig.style('vision')
    fig.style('paper')
    await fig.save()
    const again = await openFigure(file)
    again.text({ id: 't', text: 'Rendering', x: 20, y: 20 })
    assert.equal(again.get('t').fontFamily, PAPER_SERIF.cm.id)
  })
})

test('a lettered panel is a sub-figure in whitespace: title centred above, "(a)" centred below', async () => {
  assert.deepEqual(splitPanelTitle('(a) 5D Input:\nPosition + Direction'), {
    letter: '(a)',
    title: ['5D Input\nPosition + Direction']
  })
  assert.deepEqual(splitPanelTitle('Latent Space'), { letter: null, title: ['Latent Space'] })
  await withFigure(async (fig) => {
    fig.style('paper')
    const rect = fig.panel({
      id: 'pb',
      x: 100,
      y: 20,
      w: 200,
      h: 220,
      title: '(b) Output:\nColor',
      outline: true,
      color: 'panel'
    })
    assert.equal(rect.strokeColor, 'transparent')
    assert.equal(rect.backgroundColor, 'transparent')
    assert.equal(rect.roundness, null)
    const words = texts(fig)
    const title = words.filter((element) => element.id.startsWith('pb-title'))
    const caption = words.find((element) => element.id.startsWith('pb-caption'))
    assert.deepEqual(
      title.map((element) => element.text),
      ['Output', 'Color']
    )
    assert.equal(caption.text, '(a)'.replace('a', 'b'))
    for (const element of [...title, caption]) {
      assert.ok(Math.abs(element.x + element.width / 2 - 200) < 0.6, element.id)
      assert.equal(element.fontFamily, PAPER_SERIF.cm.id)
    }
    assert.ok(caption.y > title[1].y + 150)
    const group = fig.panel({
      id: 'lat',
      x: 320,
      y: 20,
      w: 200,
      h: 200,
      title: 'Latent Space',
      outline: true,
      color: 'panel-1'
    })
    assert.equal(group.strokeWidth, 1)
    assert.equal(group.backgroundColor, 'transparent')
    assert.equal(group.roundness, null)
    const named = texts(fig).find((element) => element.id === 'lat-title-0')
    assert.equal(named.fontSize, 16)
    assert.ok(Math.abs(named.x + named.width / 2 - 420) < 0.6)
  })
})

test('in the paper look a network is bars, frozen and trainable are words, icons wait to be asked', async () => {
  await withFigure(async (fig) => {
    fig.style('vision')
    fig.style('paper')
    fig.nn({
      id: 'mlp',
      x: 40,
      y: 40,
      w: 72,
      h: 50,
      layers: [3, 4, 3],
      label: '$F_\\Theta$',
      color: 'model'
    })
    const parts = live(fig).filter((element) => element.customData?.asterKit === 'mlp')
    assert.equal(parts.filter((element) => element.type === 'ellipse').length, 0)
    assert.equal(parts.filter((element) => /^mlp-b\d$/.test(element.id)).length, 3)
    assert.equal(fig.get('mlp').customData.asterPaper, 'bars')
    assert.ok(fig.get('mlp').height > 50, 'the bound box holds the name below')
    fig.box({ id: 'tf', label: 'Transformer', x: 200, y: 60, w: 104, h: 40 })
    assert.equal(fig.frozen('tf', { size: 18 }).id, 'tf-frozen')
    fig.trainable('mlp', { corner: 'top-left' })
    const notes = texts(fig).filter((element) => /frozen|trainable/.test(element.text))
    assert.deepEqual(notes.map((element) => element.text).sort(), ['frozen', 'trainable'])
    assert.ok(notes.find((element) => element.text === 'frozen').y < 60)
    assert.equal(live(fig).filter((element) => element.customData?.asterIcon).length, 0)
    const said = await quietly(async () => {
      assert.equal(fig.icon('robot', { id: 'bot', x: 300, y: 10 }), null)
    })
    // Why still drawn: a small picture (icon: true) is data shown small, not clip-art.
    assert.ok(await fig.image({ id: 'dog', kind: 'dog', x: 360, y: 10, w: 14, h: 14, icon: true }))
    assert.match(said.join('\n'), /paper look draws no icons/)
    fig.icon('robot', { id: 'bot', x: 300, y: 10, asked: true })
    assert.ok(live(fig).some((element) => element.customData?.asterIcon))
  })
})

test('save() finishes a paper-look scene: one thin weight, 2-unit corners, the face, typeset quotes', async () => {
  await withFigure(async (fig) => {
    fig.style('paper')
    fig.box({
      id: 'a',
      label: 'A',
      x: 20,
      y: 20,
      w: 60,
      h: 40,
      color: 'white',
      strokeWidth: 3,
      rounded: 8
    })
    fig.arrow({ id: 'ab', from: [90, 40], to: [160, 40], role: 'main' })
    fig.text({ id: 'q', text: '"a DSLR photo"', x: 200, y: 20, font: 9 })
    await fig.save()
    assert.equal(fig.get('a').strokeWidth, PAPER_STROKE)
    assert.deepEqual(fig.get('a').roundness, { type: 3, value: 2 })
    assert.equal(fig.get('ab').strokeWidth, PAPER_STROKE)
    assert.equal(fig.get('q').fontFamily, PAPER_SERIF.cm.id)
    assert.equal(fig.get('q').text, '\u201ca DSLR photo\u201d')
    assert.equal(paperQuotes("don't"), 'don\u2019t')
  })
})

test('the academic-look check counts cards, faces, clip-art, colours, fill and corners and names fixes', async () => {
  await withFigure(async (fig) => {
    fig.style('vision', { look: 'preset' })
    // Drawn in the preset's own look, then the page turned to the paper look: what the check sees.
    fig.panel({
      id: 'card',
      x: 20,
      y: 20,
      w: 300,
      h: 200,
      title: '(a) 5D Input:',
      color: 'panel',
      outline: true
    })
    for (const [index, color] of ['a', 'b', 'c', 'd', 'bad'].entries()) {
      fig.box({ id: `m${index}`, label: 'M', x: 40 + index * 56, y: 80, w: 48, h: 40, color })
    }
    fig.nn({ id: 'net', x: 400, y: 40, w: 100, h: 60, label: 'policy' })
    fig.box({ id: 'tf', label: 'T', x: 560, y: 60, w: 60, h: 40 })
    fig.frozen('tf')
    fig.style('paper')
    const page = fig.elements.find((element) => element.id === fig.page.id)
    const report = lintFigureScene(fig.scene)
    const found = new Set(codes(report))
    for (const code of [
      'paper-card',
      'paper-font',
      'paper-clipart',
      'paper-colors',
      'paper-rounded',
      'academic-look'
    ]) {
      assert.ok(found.has(code), `${code} in ${[...found].join(', ')}`)
    }
    const note = report.notes.find((entry) => entry.code === 'academic-look')
    assert.match(note.message, /1 cards, 1 text face.*clip-art, \d colours/)
    assert.ok(page.customData.asterPage.look === 'paper')
  })
})

test('a figure in the default look passes the academic-look check; the preset look is not checked', async () => {
  await withFigure(async (fig) => {
    fig.style('vision')
    fig.panel({ id: 'pa', x: 20, y: 20, w: 240, h: 220, title: '(a) Input' })
    fig.box({ id: 'e', label: 'Encoder', x: 60, y: 100, w: 96, h: 40, color: 'model' })
    fig.nn({ id: 'mlp', x: 300, y: 100, w: 60, h: 40, label: '$F$' })
    fig.arrow({ id: 'e-m', from: 'e', to: 'mlp' })
    const report = await fig.save()
    const paper = codes(report).filter((code) => code.startsWith('paper-'))
    assert.deepEqual(paper, [])
    assert.ok(codes(report).includes('academic-look'))
  })
  await withFigure(async (fig) => {
    fig.style('vision', { look: 'preset' })
    fig.panel({
      id: 'card',
      x: 20,
      y: 20,
      w: 300,
      h: 200,
      title: 'A',
      color: 'panel',
      outline: true
    })
    assert.ok(!codes(await fig.save()).includes('academic-look'))
  })
})
