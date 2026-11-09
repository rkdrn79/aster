import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  PAGE_FRAME_ID,
  checkFigureScene,
  elementsTouching,
  figureAreas,
  figureElement,
  figureFilePaths,
  figureLatexSnippet,
  figurePage,
  figureSlug,
  figuresFolderFor,
  listFigureFolder,
  newFigureScene
} from './research-figures-model.mjs'
import { buildFigurePart } from './research-figures-parts.mjs'

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

test('figures live next to the manuscript, with exports named after the scene', () => {
  assert.equal(figuresFolderFor('paper/main.tex'), 'paper/figures')
  assert.equal(figuresFolderFor('main.tex'), 'figures')
  assert.throws(() => figuresFolderFor('../outside/main.tex'))
  assert.deepEqual(figureFilePaths('paper/figures', 'method'), {
    scene: 'paper/figures/method.excalidraw',
    svg: 'paper/figures/method.svg',
    pdf: 'paper/figures/method.pdf',
    png: 'paper/figures/method.png',
    script: 'paper/figures/src/method.figure.mjs'
  })
  assert.equal(figureSlug('  Method Overview (v2)!'), 'method-overview-v2')
  assert.equal(figureSlug('그림'), 'figure')
})

test('a folder lists scenes with their exports and every other image as read-only', () => {
  const entries = [
    'method.excalidraw',
    'method.svg',
    'method.pdf',
    'loss-curve.pdf',
    'loss-curve.png',
    'plot.py',
    '.DS_Store'
  ].map((name) => ({ name, isDirectory: false }))
  const listing = listFigureFolder([...entries, { name: 'sketches', isDirectory: true }])
  assert.deepEqual(listing.figures, [{ slug: 'method', svg: true, pdf: true, png: false }])
  assert.deepEqual(listing.others, [
    { name: 'loss-curve.pdf', kind: 'pdf' },
    { name: 'loss-curve.png', kind: 'image' }
  ])
})

test('a new scene carries the locked page frame at the printed size', () => {
  const scene = newFigureScene({ widthIn: 3.25, heightIn: 2 })
  assert.deepEqual(checkFigureScene(scene), [])
  const page = figurePage(scene.elements)
  assert.equal(page.id, PAGE_FRAME_ID)
  assert.equal(page.width, 468)
  assert.equal(page.height, 288)
  assert.equal(scene.elements[0].locked, true)
})

test('areas report their bounds and the elements that touch them', () => {
  const area = figureElement('frame', {
    id: 'area-1',
    x: 100,
    y: 50,
    width: 200,
    height: 100,
    name: 'Encoder',
    customData: { asterArea: { prompt: 'an encoder block' } }
  })
  const [box, label] = buildFigurePart('encoder', { x: 120, y: 60, frameId: 'area-1' })
  const outside = figureElement('rectangle', { id: 'far', x: 900, y: 900, width: 10, height: 10 })
  const elements = [area, box, label, outside]
  assert.deepEqual(figureAreas(elements), [
    {
      id: 'area-1',
      name: 'Encoder',
      prompt: 'an encoder block',
      x: 100,
      y: 50,
      width: 200,
      height: 100,
      children: 2
    }
  ])
  const touching = elementsTouching(elements, area)
  assert.deepEqual(
    touching.map((entry) => [entry.type, entry.label]),
    [
      ['rectangle', 'Encoder'],
      ['text', 'Encoder']
    ]
  )
  assert.deepEqual(checkFigureScene({ type: 'excalidraw', elements }), [])
})

test('the checker names what would stop a scene from opening', () => {
  const arrow = figureElement('arrow', {
    id: 'a1',
    points: [[0, 0]],
    endBinding: { elementId: 'missing', focus: 0, gap: 4 }
  })
  const text = figureElement('text', { id: 'a1', fontSize: 'big', frameId: 'nope' })
  const issues = checkFigureScene({ type: 'excalidraw', elements: [arrow, text] })
  assert.ok(issues.includes('Duplicate element id a1'))
  assert.ok(issues.some((issue) => issue.includes('needs at least two [x, y] points')))
  assert.ok(issues.some((issue) => issue.includes('endBinding points at missing element missing')))
  assert.ok(issues.some((issue) => issue.includes('numeric fontSize')))
  assert.ok(issues.some((issue) => issue.includes('frameId nope is not a frame')))
  assert.deepEqual(checkFigureScene({ type: 'other' }), ['"type" must be "excalidraw"'])
})

test('the LaTeX snippet includes the PDF at its printed size', () => {
  const single = figureLatexSnippet({ slug: 'method', widthIn: 3.25 })
  assert.match(single, /\\begin\{figure\}\[t\]/)
  assert.match(single, /\\includegraphics\{figures\/method\.pdf\}/)
  assert.match(single, /\\label\{fig:method\}/)
  assert.match(figureLatexSnippet({ slug: 'wide', widthIn: 6.75 }), /\\begin\{figure\*\}/)
})

test('the CLI creates, lists, checks, and prints parts', async () => {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-')))
  try {
    await mkdir(path.join(project, '.aster'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({
        schemaVersion: 2,
        manuscript: { source: 'docs/paper/main.tex', pdf: null },
        references: { bibliography: 'docs/paper/refs.bib', papers: '.aster/library/papers' }
      })
    )
    const created = await harness(project, [
      'figures',
      'new',
      '--name',
      'Method',
      '--size',
      'double'
    ])
    assert.equal(created.code, 0)
    assert.equal(created.result.scene, '.aster/figures/method.excalidraw')
    const scene = JSON.parse(await readFile(path.join(project, created.result.scene), 'utf8'))
    assert.equal(figurePage(scene.elements).widthIn, 6.75)
    assert.equal((await harness(project, ['figures', 'new', '--name', 'Method'])).code, 1)

    const listed = await harness(project, ['figures', 'list'])
    assert.deepEqual(
      listed.result.figures.map((figure) => figure.slug),
      ['method']
    )
    assert.equal((await harness(project, ['figures', 'check'])).code, 0)

    scene.elements.push({ id: 'x', type: 'rectangle', x: 0, y: 0 })
    await writeFile(path.join(project, created.result.scene), JSON.stringify(scene))
    const checked = await harness(project, ['figures', 'check'])
    assert.equal(checked.code, 1)
    assert.ok(checked.result.figures[0].errors.some((issue) => issue.message.includes('width')))

    const part = await harness(project, ['figures', 'part', 'encoder', '--x', '40', '--frame', 'f'])
    assert.equal(part.result.elements[0].x, 40)
    assert.equal(part.result.elements[0].frameId, 'f')
    assert.equal((await harness(project, ['figures', 'part', 'nope'])).code, 1)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
})

test('a figure script imports the kit through a portable shim, and figures run runs it', async () => {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-shim-')))
  try {
    await mkdir(path.join(project, '.aster'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const created = await harness(project, ['figures', 'new', '--name', 'Method'])
    assert.equal(created.result.shim, '.aster/figures/src/aster-figures-kit.mjs')
    const shimFile = path.join(project, created.result.shim)
    assert.ok(
      !(await readFile(shimFile, 'utf8')).includes(import.meta.dirname),
      'no path of this computer'
    )
    const script = path.join(project, created.result.script)
    await writeFile(
      script,
      [
        "import kit, { harness, openFigure } from './aster-figures-kit.mjs'",
        "const fig = await openFigure(new URL('../method.excalidraw', import.meta.url))",
        "fig.box({ id: 'enc', label: 'encoder', x: 40, y: 40 })",
        'await fig.save()',
        'console.log(JSON.stringify({ harness, marker: kit.marker ?? null }))'
      ].join('\n')
    )
    // figures run points the shim at this harness, wherever the project sits.
    const ran = await harness(project, ['figures', 'run'])
    assert.equal(ran.code, 0, ran.result.stderr)
    assert.deepEqual(JSON.parse(ran.result.stdout), { harness: import.meta.dirname, marker: null })
    const scene = JSON.parse(await readFile(path.join(project, created.result.scene), 'utf8'))
    assert.ok(scene.elements.some((element) => element.id === 'enc'))
    // Run with node alone, the shim takes $ASTER_HARNESS (a folder or its cli.mjs).
    const other = path.join(project, 'other-harness')
    await mkdir(other)
    await writeFile(
      path.join(other, 'research-figures-kit.mjs'),
      "export const marker = 'other'\nexport async function openFigure() { return { box() {}, save() {} } }\n"
    )
    const alone = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      env: { PATH: path.dirname(process.execPath), ASTER_HARNESS: path.join(other, 'cli.mjs') }
    })
    assert.deepEqual(JSON.parse(alone.stdout), { harness: other, marker: 'other' })
    // Without it and without an aster CLI, the shim says how to run the script.
    const lost = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      env: { PATH: path.dirname(process.execPath) }
    })
    assert.match(lost.stderr, /figures run --figure/)
    assert.equal((await harness(project, ['figures', 'show'])).result.shim.exists, true)
    // A person's own shim stays; a broken script fails the command.
    await writeFile(shimFile, "export * from './elsewhere.mjs'\n")
    await writeFile(script, "throw new Error('broken')\n")
    const failed = await harness(project, ['figures', 'run', '--figure', 'method'])
    assert.equal(failed.code, 1)
    assert.match(failed.result.stderr, /broken/)
    assert.equal(await readFile(shimFile, 'utf8'), "export * from './elsewhere.mjs'\n")
  } finally {
    await rm(project, { recursive: true, force: true })
  }
})
