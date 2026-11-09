import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  figurePaperState,
  figureWorkFolder,
  mergeFigureListings,
  paperCopyPath
} from './research-figures-locations.mjs'
import { listFigureFolder, newFigureScene } from './research-figures-model.mjs'

const cli = path.join(import.meta.dirname, 'cli.mjs')

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

const exists = (file) =>
  access(file).then(
    () => true,
    () => false
  )

async function project(root = '.aster') {
  const dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figloc-')))
  await mkdir(path.join(dir, root), { recursive: true })
  const manuscript = root === '.aster' ? 'paper/main.tex' : 'research/manuscript/main.tex'
  await writeFile(
    path.join(dir, root, 'project.json'),
    JSON.stringify({
      schemaVersion: root === '.aster' ? 2 : 1,
      manuscript: { source: manuscript, pdf: null },
      experiments: []
    })
  )
  return { dir, manuscript }
}

/** What Aster writes when the figure is open: the PDF, then the sidecar `figures preview` waits on. */
async function rendered(
  dir,
  slug,
  { root = '.aster', folder = `${root}/figures`, pdf = '%PDF-1' } = {}
) {
  await writeFile(path.join(dir, `${folder}/${slug}.pdf`), pdf)
  const scene = await readFile(path.join(dir, `${folder}/${slug}.excalidraw`))
  const sidecar = {
    scene: `${folder}/${slug}.excalidraw`,
    sceneSha256: createHash('sha256').update(scene).digest('hex'),
    widthPx: 100,
    heightPx: 100,
    renderedAt: new Date().toISOString()
  }
  await mkdir(path.join(dir, `${root}/cache/figures`), { recursive: true })
  await writeFile(path.join(dir, `${root}/cache/figures/${slug}.json`), JSON.stringify(sidecar))
}

async function legacyFigure(dir, slug) {
  await mkdir(path.join(dir, 'paper/figures'), { recursive: true })
  const text = `${JSON.stringify(newFigureScene({ widthIn: 3.25, heightIn: 2 }), null, 2)}\n`
  await writeFile(path.join(dir, `paper/figures/${slug}.excalidraw`), text)
  await writeFile(path.join(dir, `paper/figures/${slug}.pdf`), '%PDF-legacy')
}

test('new figures start in the record tree, exports ignored by Git, with an empty paper folder', async () => {
  const { dir } = await project()
  try {
    const created = await harness(dir, ['figures', 'new', '--name', 'Method'])
    assert.equal(created.code, 0)
    assert.equal(created.result.scene, '.aster/figures/method.excalidraw')
    assert.equal(created.result.script, '.aster/figures/src/method.figure.mjs')
    assert.equal(created.result.shim, '.aster/figures/src/aster-figures-kit.mjs')
    assert.ok(await exists(path.join(dir, created.result.shim)))
    assert.match(await readFile(path.join(dir, '.aster/figures/.gitignore'), 'utf8'), /\*\.pdf/)
    assert.equal(await exists(path.join(dir, 'paper/figures')), false)
    const listed = await harness(dir, ['figures', 'list'])
    assert.equal(listed.result.figures[0].paper, 'none')
    assert.equal(listed.result.paperFolder, 'paper/figures')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a project on the research/ record root works in research/figures', async () => {
  const { dir, manuscript } = await project('research')
  try {
    assert.equal(figureWorkFolder('research'), 'research/figures')
    const created = await harness(dir, ['figures', 'new', '--name', 'Method'])
    assert.equal(created.result.scene, 'research/figures/method.excalidraw')
    await rendered(dir, 'method', { root: 'research' })
    const published = await harness(dir, ['figures', 'publish', '--figure', 'method'])
    assert.equal(published.code, 0)
    assert.equal(published.result.pdf, paperCopyPath(manuscript, 'method'))
    assert.equal(published.result.pdf, 'research/manuscript/figures/method.pdf')
    assert.ok(await exists(path.join(dir, 'research/manuscript/figures/method.pdf')))
    assert.ok(await exists(path.join(dir, 'research/figures/published/method.json')))
    assert.ok(!(await exists(path.join(dir, '.aster'))))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a figure already beside the manuscript still opens and stays there', async () => {
  const { dir } = await project()
  try {
    await legacyFigure(dir, 'overview')
    const listed = await harness(dir, ['figures', 'list'])
    const [figure] = listed.result.figures
    assert.equal(figure.slug, 'overview')
    assert.equal(figure.scene, 'paper/figures/overview.excalidraw')
    assert.equal(figure.script, 'paper/figures/src/overview.figure.mjs')
    assert.equal(figure.location, 'paper')
    assert.equal(figure.paper, 'beside')
    assert.deepEqual(listed.result.others, [])
    assert.equal((await harness(dir, ['figures', 'show', '--figure', 'overview'])).code, 0)
    // Publishing one is a no-op: it is already where the paper reads it.
    const published = await harness(dir, ['figures', 'publish', '--figure', 'overview'])
    assert.equal(published.code, 0)
    assert.equal(published.result.beside, true)
    assert.equal(
      await readFile(path.join(dir, 'paper/figures/overview.pdf'), 'utf8'),
      '%PDF-legacy'
    )
    // A new name that an older figure uses is refused, not shadowed.
    assert.equal((await harness(dir, ['figures', 'new', '--name', 'Overview'])).code, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('with the same slug in both folders the working figure is used and neither is lost', async () => {
  const { dir } = await project()
  try {
    await legacyFigure(dir, 'clash')
    await mkdir(path.join(dir, '.aster/figures'), { recursive: true })
    await writeFile(
      path.join(dir, '.aster/figures/clash.excalidraw'),
      `${JSON.stringify(newFigureScene({ widthIn: 3.25, heightIn: 2 }), null, 2)}\n`
    )
    const listed = await harness(dir, ['figures', 'list'])
    assert.deepEqual(
      listed.result.figures.map((figure) => [figure.slug, figure.location, figure.scene]),
      [['clash', 'work', '.aster/figures/clash.excalidraw']]
    )
    assert.deepEqual(
      listed.result.shadowed.map((entry) => entry.scene),
      ['paper/figures/clash.excalidraw']
    )
    assert.equal(
      (await readFile(path.join(dir, 'paper/figures/clash.excalidraw'))).length > 0,
      true
    )
    // Its PDF is not a stray read-only figure.
    assert.deepEqual(listed.result.others, [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('publish copies only the PDF, and later edits leave the paper alone until published again', async () => {
  const { dir } = await project()
  try {
    await harness(dir, ['figures', 'new', '--name', 'Method'])
    await rendered(dir, 'method', { pdf: '%PDF-one' })
    const published = await harness(dir, ['figures', 'publish', '--figure', 'method'])
    assert.equal(published.code, 0)
    assert.equal(published.result.pdf, 'paper/figures/method.pdf')
    const { readdir } = await import('node:fs/promises')
    assert.deepEqual(await readdir(path.join(dir, 'paper/figures')), ['method.pdf'])
    assert.equal(await readFile(path.join(dir, 'paper/figures/method.pdf'), 'utf8'), '%PDF-one')
    let figure = (await harness(dir, ['figures', 'list'])).result.figures[0]
    assert.equal(figure.paper, 'current')
    assert.equal(figure.published.sceneSha256.length, 64)

    // An edit: the working files change, the paper's copy does not.
    const scene = JSON.parse(
      await readFile(path.join(dir, '.aster/figures/method.excalidraw'), 'utf8')
    )
    scene.elements[0].customData.asterPage.title = 'Changed'
    await writeFile(path.join(dir, '.aster/figures/method.excalidraw'), JSON.stringify(scene))
    await rendered(dir, 'method', { pdf: '%PDF-two' })
    assert.equal(await readFile(path.join(dir, 'paper/figures/method.pdf'), 'utf8'), '%PDF-one')
    figure = (await harness(dir, ['figures', 'list'])).result.figures[0]
    assert.equal(figure.paper, 'outdated')

    // Publishing again replaces its own copy without asking.
    assert.equal((await harness(dir, ['figures', 'publish', '--figure', 'method'])).code, 0)
    assert.equal(await readFile(path.join(dir, 'paper/figures/method.pdf'), 'utf8'), '%PDF-two')
    assert.equal((await harness(dir, ['figures', 'list'])).result.figures[0].paper, 'current')

    // A copy deleted by hand reads as missing.
    await rm(path.join(dir, 'paper/figures/method.pdf'))
    assert.equal((await harness(dir, ['figures', 'list'])).result.figures[0].paper, 'missing')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('publish waits for a render of the current scene, and refuses a PDF it did not write', async () => {
  const { dir } = await project()
  try {
    await harness(dir, ['figures', 'new', '--name', 'Method'])
    const waited = await harness(dir, ['figures', 'publish', '--figure', 'method', '--wait', '0'])
    assert.equal(waited.code, 1)
    assert.equal(await exists(path.join(dir, 'paper/figures/method.pdf')), false)

    await rendered(dir, 'method', { pdf: '%PDF-mine' })
    await mkdir(path.join(dir, 'paper/figures'), { recursive: true })
    await writeFile(path.join(dir, 'paper/figures/method.pdf'), '%PDF-theirs')
    const refused = await harness(dir, ['figures', 'publish', '--figure', 'method'])
    assert.equal(refused.code, 1)
    assert.match(refused.result.error.message, /--replace/)
    assert.equal(await readFile(path.join(dir, 'paper/figures/method.pdf'), 'utf8'), '%PDF-theirs')

    const replaced = await harness(dir, ['figures', 'publish', '--figure', 'method', '--replace'])
    assert.equal(replaced.code, 0)
    assert.equal(await readFile(path.join(dir, 'paper/figures/method.pdf'), 'utf8'), '%PDF-mine')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a working plot publishes as itself; the paper copy of a working figure is not listed twice', async () => {
  const { dir } = await project()
  try {
    await mkdir(path.join(dir, '.aster/figures'), { recursive: true })
    await writeFile(path.join(dir, '.aster/figures/loss-curve.pdf'), '%PDF-plot')
    await writeFile(path.join(dir, '.aster/figures/loss-curve.py'), '# plot')
    assert.equal((await harness(dir, ['figures', 'publish', '--figure', 'loss-curve'])).code, 0)
    assert.equal(
      await readFile(path.join(dir, 'paper/figures/loss-curve.pdf'), 'utf8'),
      '%PDF-plot'
    )
    const listed = await harness(dir, ['figures', 'list'])
    assert.deepEqual(
      listed.result.others.map((entry) => entry.path),
      ['.aster/figures/loss-curve.pdf']
    )
    assert.equal(
      JSON.parse(await readFile(path.join(dir, '.aster/figures/published/loss-curve.json'), 'utf8'))
        .sceneSha256,
      null
    )
    assert.equal((await harness(dir, ['figures', 'publish', '--figure', 'nothing-here'])).code, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('merging the folders: published copies disappear, clashes resolve to the working folder', () => {
  const list = (names) => listFigureFolder(names.map((name) => ({ name, isDirectory: false })))
  const merged = mergeFigureListings({
    workFolder: '.aster/figures',
    work: list(['a.excalidraw', 'a.pdf', 'b.excalidraw', 'loss.pdf']),
    paperFolder: 'paper/figures',
    paper: list(['b.excalidraw', 'b.pdf', 'c.excalidraw', 'c.pdf', 'a.pdf', 'loss.pdf', 'hand.png'])
  })
  assert.deepEqual(
    merged.figures.map((figure) => [figure.slug, figure.location]),
    [
      ['a', 'work'],
      ['b', 'work'],
      ['c', 'paper']
    ]
  )
  assert.deepEqual(
    merged.others.map((entry) => `${entry.folder}/${entry.name}`),
    ['paper/figures/hand.png', '.aster/figures/loss.pdf']
  )
  assert.deepEqual(merged.shadowed, [{ slug: 'b', folder: 'paper/figures' }])
})

test('the paper state follows the record, the copy on disk and the scene', () => {
  const record = {
    slug: 'x',
    pdf: 'paper/figures/x.pdf',
    pdfSha256: 'p',
    sceneSha256: 's1',
    publishedAt: ''
  }
  const expectedPdf = 'paper/figures/x.pdf'
  const state = (input) =>
    figurePaperState({
      location: 'work',
      record,
      paperCopy: true,
      expectedPdf,
      sceneSha256: 's1',
      ...input
    })
  assert.equal(state({ location: 'paper' }), 'beside')
  assert.equal(state({ record: null }), 'none')
  assert.equal(state({}), 'current')
  assert.equal(state({ sceneSha256: 's2' }), 'outdated')
  assert.equal(state({ sceneSha256: null }), 'current')
  assert.equal(state({ paperCopy: false }), 'missing')
  // Published to another manuscript's folder: nothing to report for this one.
  assert.equal(state({ paperCopy: false, expectedPdf: 'other/figures/x.pdf' }), 'none')
  // Moved with the manuscript: still its copy.
  assert.equal(state({ expectedPdf: 'manuscript/figures/x.pdf' }), 'current')
})
