import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { absolutePoints } from './research-figures-labels.mjs'
import { newFigureScene } from './research-figures-model.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 3 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-polish-')))
  try {
    await mkdir(path.join(project, '.aster'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    await mkdir(path.join(project, 'paper/figures'), { recursive: true })
    const file = path.join(project, 'paper/figures/fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene(size)))
    await run(file)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const codes = (report) => [...report.errors, ...report.warnings].map((entry) => entry.code)
const pathLength = (element) =>
  absolutePoints(element)
    .slice(1)
    .reduce((sum, point, index, rest) => {
      const before = index ? rest[index - 1] : absolutePoints(element)[0]
      return sum + Math.hypot(point[0] - before[0], point[1] - before[1])
    }, 0)

test('text under 7 pt is flagged on single- and double-column pages alike', async () => {
  for (const [widthIn, flagged] of [
    [3.25, true],
    [6.75, true]
  ]) {
    await withFigure(
      async (file) => {
        const fig = await openFigure(file)
        fig.text({ id: 'note', text: 'note', size: 13, x: 40, y: 40 })
        assert.equal(codes(await fig.save()).includes('small-text'), flagged, `${widthIn} in`)
      },
      { widthIn, heightIn: 2 }
    )
  }
})

test('🔥 alone is badge noise; beside ❄️ it says something', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'enc', label: 'encoder', x: 40, y: 40 })
    fig.box({ id: 'tgt', label: 'target', x: 240, y: 40 })
    fig.trainable('enc')
    assert.ok(codes(await fig.save()).includes('badge-noise'))
    fig.frozen('tgt')
    assert.ok(!codes(await fig.save()).includes('badge-noise'))
  })
})

test('junctions take exactly one of at, x or y; stop-grad says sg clear of labels and heads', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.box({ id: 'a', label: 'online', x: 40, y: 60 })
    fig.box({ id: 'b', label: 'target', x: 400, y: 60 })
    fig.arrow({ id: 'ab', from: 'a', to: 'b', label: 'z' })
    assert.throws(
      () => fig.arrow({ id: 'j', from: { on: 'ab', at: 0.5, x: 200 }, to: [200, 200] }),
      /exactly one of at, x or y/
    )
    assert.throws(() => fig.arrow({ id: 'j', from: { on: 'ab' }, to: [200, 200] }), /exactly one/)
    fig.stopGrad('ab')
    const label = fig.elements.find(
      (element) => element.id.startsWith('ab-stopgrad-label') && element.type === 'text'
    )
    assert.equal(label?.text, 'sg')
    assert.ok(!codes(await fig.save()).includes('mark-on-label'))
    fig.stopGrad('ab', { id: 'sg2', at: 0.98, label: false })
    assert.ok(!fig.elements.some((element) => element.id.startsWith('sg2-label')))
    assert.ok(codes(await fig.save()).includes('mark-on-label'), 'a mark on the head is named')
  })
})

test('predictions and targets are framed apart and meet at a loss placed beside them', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.features({ id: 'p1', x: 40, y: 30, rows: 3, cols: 3 })
    fig.features({ id: 'p2', x: 100, y: 30, rows: 3, cols: 3 })
    fig.features({ id: 't1', x: 40, y: 160, rows: 3, cols: 3 })
    fig.features({ id: 't2', x: 100, y: 160, rows: 3, cols: 3 })
    fig.loss({
      id: 'l',
      label: 'L',
      predictions: ['p1', 'p2'],
      targets: ['t1', 't2'],
      links: 'dashed',
      side: 'right'
    })
    assert.ok(fig.get('l-set1') && fig.get('l-set2'), 'one frame for each side')
    const sets = fig.bounds('t2')
    assert.ok(fig.get('l').x >= sets.right + 40, 'beside the sets')
    for (const id of ['l-in1', 'l-in2']) {
      assert.ok(pathLength(fig.get(id)) >= 40, `${id} is long enough to print dashed`)
    }
    fig.arrow({ id: 'short', from: [300, 260], to: [330, 260], role: 'loss', dashed: true })
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
    assert.deepEqual(
      report.warnings.filter((entry) => entry.code === 'short-dash').map((entry) => entry.id),
      ['short']
    )
  })
})

test('noise tokens draw noise, tinted noise differs, and the DiT template draws cleanly', async () => {
  await withFigure(
    async (file) => {
      const fig = await openFigure(file)
      fig.tokens({ id: 'seq', x: 20, y: 300, items: [{ noise: 0.8 }, 'a'] })
      assert.equal(fig.get('seq-0').type, 'image')
      const plain = await fig.image({
        id: 'n1',
        kind: 'noise',
        seed: 2,
        x: 600,
        y: 20,
        w: 40,
        h: 40
      })
      const tinted = await fig.image({
        id: 'n2',
        kind: 'noise',
        seed: 2,
        tint: 'accent',
        x: 660,
        y: 20,
        w: 40,
        h: 40
      })
      assert.notEqual(fig.scene.files[plain.fileId].dataURL, fig.scene.files[tinted.fileId].dataURL)
      const dit = fig.template('dit', { id: 'dit', x: 40, y: 20 })
      assert.ok(dit.ids && dit.in && dit.out)
      const report = await fig.save()
      assert.deepEqual(report.errors, [])
    },
    { widthIn: 6.75, heightIn: 4.6 }
  )
  const shown = spawnSync(
    process.execPath,
    [path.join(import.meta.dirname, 'cli.mjs'), 'figures', 'kit', 'dit'],
    { encoding: 'utf8' }
  )
  assert.match(shown.stdout, /^fig\.template\('dit', \{ id, x, y, w: 200/)
})

test('figures context lists the manuscript sections, following \\input', async () => {
  await withFigure(async (file) => {
    const project = path.dirname(path.dirname(path.dirname(file)))
    await mkdir(path.join(project, 'paper/sections'), { recursive: true })
    await writeFile(
      path.join(project, 'paper/main.tex'),
      '\\section{Introduction}\n% \\section{Hidden}\n\\input{sections/method}\n\\section{Experiments}\n'
    )
    await writeFile(
      path.join(project, 'paper/sections/method.tex'),
      '\\section{Method}\n\\subsection{Alignment}\n'
    )
    const shown = spawnSync(
      process.execPath,
      [path.join(import.meta.dirname, 'cli.mjs'), 'figures', 'context', '--project', project],
      { encoding: 'utf8' }
    )
    assert.match(
      shown.stdout,
      /Introduction {2}\(main\.tex:1\)\n {2}Method {2}\(sections\/method\.tex:1\)\n {4}Alignment {2}\(sections\/method\.tex:2\)\n {2}Experiments {2}\(main\.tex:4\)/
    )
    assert.doesNotMatch(shown.stdout, /Hidden/)
  })
})

test('figures context reads the manuscript named, lists run-in headings, and finds the figure', async () => {
  await withFigure(async (file) => {
    const project = path.dirname(path.dirname(path.dirname(file)))
    await writeFile(path.join(project, 'paper/main.tex'), '\\section{Introduction}\n')
    await writeFile(
      path.join(project, 'paper/mae.tex'),
      [
        '\\documentclass{article}',
        '\\section{The $\\mathcal{L}$ approach}',
        'Our autoencoder reconstructs the signal.',
        '',
        'Masking.',
        '',
        'We sample random patches. This sentence is a paragraph and no heading at all.',
        '',
        '\\paragraph{MAE encoder.} A ViT on visible patches.',
        '',
        '\\noindent\\textbf{Reconstruction target.} Pixels of masked patches.',
        '',
        '\\subsection{Details}',
        '\\begin{figure}\\includegraphics[width=\\linewidth]{figures/fig}\\end{figure}',
        ''
      ].join('\n')
    )
    const context = (...args) =>
      spawnSync(
        process.execPath,
        [
          path.join(import.meta.dirname, 'cli.mjs'),
          'figures',
          'context',
          '--project',
          project,
          ...args
        ],
        { encoding: 'utf8' }
      ).stdout
    const named = context('--manuscript', path.join(project, 'paper/mae.tex'))
    assert.match(
      named,
      /^paper\/mae\.tex · figures in paper\/figures\n {2}The \$\\mathcal\{L\}\$ approach {2}\(mae\.tex:2\)\n {4}¶ Masking\. {2}\(mae\.tex:5\)\n {4}¶ MAE encoder\. {2}\(mae\.tex:9\)\n {4}¶ Reconstruction target\. {2}\(mae\.tex:11\)\n {4}Details {2}\(mae\.tex:13\)\n/
    )
    assert.doesNotMatch(named, /We sample|Other manuscripts/)
    assert.match(context('--manuscript', 'paper/mae.tex'), /^paper\/mae\.tex/)
    // Without --manuscript: the .tex that includes the figure, else the catalog's with the others.
    assert.match(context('--figure', 'fig'), /^paper\/mae\.tex \(it includes this figure\)/)
    const fallback = context()
    assert.match(fallback, /^paper\/main\.tex · /)
    assert.match(fallback, /Other manuscripts beside it: mae\.tex\b/)
  })
})

test('figures context lists bare numbered and plain headings of text pulled from a PDF', async () => {
  await withFigure(async (file) => {
    const project = path.dirname(path.dirname(path.dirname(file)))
    await writeFile(
      path.join(project, 'paper/main.tex'),
      [
        '\\section{Method}',
        '',
        '3.1 Overview',
        '',
        'We align the hidden states with a pretrained encoder.',
        '',
        'Data Representation',
        '',
        'Table 2',
        '',
        'This line has far too many words to be a heading here',
        '',
        '3.2 Training objective.',
        '',
        'Stage 1: Pre-training.',
        ''
      ].join('\n')
    )
    const shown = spawnSync(
      process.execPath,
      [path.join(import.meta.dirname, 'cli.mjs'), 'figures', 'context', '--project', project],
      { encoding: 'utf8' }
    ).stdout
    assert.match(
      shown,
      /\n {2}Method {2}\(main\.tex:1\)\n {4}3\.1 Overview {2}\(main\.tex:3\)\n {6}¶ Data Representation {2}\(main\.tex:7\)\n {4}3\.2 Training objective {2}\(main\.tex:13\)\n {6}¶ Stage 1: Pre-training\. {2}\(main\.tex:15\)\n/
    )
    assert.doesNotMatch(shown, /Table 2|too many words/)
  })
})
