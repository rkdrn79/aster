import assert from 'node:assert/strict'
import test from 'node:test'
import { FIGURE_WORK_GITIGNORE, mergeFigureListings } from './research-figures-locations.mjs'
import { listFigureFolder } from './research-figures-model.mjs'
import { parsePlotManifest, plotFilePaths, plotGitignore } from './research-figures-plot-files.mjs'

const files = (...names) => names.map((name) => ({ name, isDirectory: false }))

test('a plot keeps its script and helper in src/ and its exports beside the diagrams', () => {
  assert.deepEqual(plotFilePaths('.aster/figures', 'flow'), {
    script: '.aster/figures/src/flow.plot.py',
    lib: '.aster/figures/src/aster_plot.py',
    manifest: '.aster/figures/flow.plot.json',
    pdf: '.aster/figures/flow.pdf',
    svg: '.aster/figures/flow.svg',
    embed: '.aster/figures/flow.embed.svg',
    png: '.aster/figures/flow.png'
  })
  assert.throws(() => plotFilePaths('../out', 'flow'), /project-relative/)
})

test('a folder lists plots from their scripts or manifests, and hides their exports', () => {
  const listing = listFigureFolder(
    files(
      'method.excalidraw',
      'method.pdf',
      'flow.pdf',
      'flow.svg',
      'flow.embed.svg',
      'flow.png',
      'flow.plot.json',
      'orphan.plot.json',
      'loss.pdf',
      '.gitignore'
    ),
    [
      ...files(
        'flow.plot.py',
        'bars.plot.py',
        'method.plot.py',
        'aster_plot.py',
        'Bad Name.plot.py'
      ),
      { name: 'x.plot.py', isDirectory: true }
    ]
  )
  assert.deepEqual(
    listing.figures.map((figure) => figure.slug),
    ['method']
  )
  assert.deepEqual(listing.plots, [
    { slug: 'bars', script: true, manifest: false, svg: false, pdf: false, png: false },
    { slug: 'flow', script: true, manifest: true, svg: true, pdf: true, png: true },
    { slug: 'orphan', script: false, manifest: true, svg: false, pdf: false, png: false }
  ])
  assert.deepEqual(listing.others, [{ name: 'loss.pdf', kind: 'pdf' }])
  assert.deepEqual(listFigureFolder(files('a.pdf')).plots, [])
})

test('plots come from the working folder, and their paper copies are not figures of their own', () => {
  const work = listFigureFolder(files('flow.pdf', 'flow.plot.json'), files('flow.plot.py'))
  const paper = listFigureFolder(files('flow.pdf', 'other.pdf'), files('stray.plot.py'))
  const merged = mergeFigureListings({
    workFolder: '.aster/figures',
    work,
    paperFolder: 'paper/figures',
    paper
  })
  assert.deepEqual(
    merged.plots.map((plot) => [plot.slug, plot.folder]),
    [['flow', '.aster/figures']]
  )
  assert.deepEqual(
    merged.others.map((entry) => entry.name),
    ['other.pdf']
  )
  const same = mergeFigureListings({
    workFolder: 'figures',
    work,
    paperFolder: 'figures',
    paper: work
  })
  assert.equal(same.plots.length, 1)
})

test('a manifest is read defensively', () => {
  const manifest = parsePlotManifest(
    JSON.stringify({
      kind: 'aster-plot',
      slug: 'flow',
      sourceSha256: 'abc',
      lib: 'v1',
      size: { widthIn: 3.25, heightIn: 2 },
      style: { preset: 'graphite', accent: 'blue' },
      panels: [{ id: 'a' }],
      files: { pdf: 'flow.pdf' },
      sha256: { pdf: 'x' },
      previews: { print: 'p.png' },
      renderedAt: 'now',
      findings: {
        errors: [{ code: 'tiny-text', id: 'a', message: 'small' }, { code: 1 }],
        warnings: [{ code: 'w', message: 'm', id: 3 }]
      }
    })
  )
  assert.equal(manifest.slug, 'flow')
  assert.equal(manifest.panel, false)
  assert.equal(parsePlotManifest('{"kind":"aster-plot","slug":"x","panel":true}').panel, true)
  assert.deepEqual(manifest.size, { widthIn: 3.25, heightIn: 2 })
  assert.deepEqual(manifest.findings, {
    errors: [{ code: 'tiny-text', id: 'a', message: 'small' }],
    warnings: [{ code: 'w', id: null, message: 'm' }],
    notes: []
  })
  assert.equal(parsePlotManifest('{"kind":"other","slug":"x"}'), null)
  assert.equal(parsePlotManifest('not json'), null)
  const bare = parsePlotManifest('{"kind":"aster-plot","slug":"x"}')
  assert.deepEqual(bare.size, { widthIn: null, heightIn: null })
  assert.equal(bare.script, null)
  assert.deepEqual(bare.panels, [])
})

test('the working folder ignores plot manifests, and an older .gitignore gains the line', () => {
  assert.match(FIGURE_WORK_GITIGNORE, /^\*\.plot\.json$/m)
  assert.equal(plotGitignore('*.pdf\n*.svg\n*.png\n'), '*.pdf\n*.svg\n*.png\n*.plot.json\n')
  assert.equal(plotGitignore('*.pdf\nmine'), '*.pdf\nmine\n*.plot.json\n')
  assert.equal(plotGitignore(FIGURE_WORK_GITIGNORE), null)
  assert.equal(plotGitignore(null), null)
})
