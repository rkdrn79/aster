// Round 15 perspective defaults: a ray-vs-cone story drawn as stages (a row of scenes joined by
// labelled arrows, a warning when the Gaussians sit inside the cone), a template camera turned to
// fill a wide box, `like` scenes centred in the shared box, soft plane shading and the 'line'
// look by default, and worked examples laid out for the agent's page.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { perspectiveScene } from './research-figures-perspective-scene.mjs'
import { PERSPECTIVE_TEMPLATES } from './research-figures-perspective-templates.mjs'
import { rowBoxes, turnToFit } from './research-figures-kit-perspective-row.mjs'
import { examplesText } from './research-figures-kit-examples.mjs'
import { examplesForPage } from './research-figures-kit-examples-page.mjs'
import { lintFigureScene } from './research-figures-lint.mjs'

async function withFigure(run, size = { widthIn: 3.25, heightIn: 1.1 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r15s-')))
  try {
    const folder = path.join(project, '.aster/figures')
    await mkdir(folder, { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const file = path.join(folder, 'fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene(size)))
    await run(file, project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

async function capturingWarnings(run) {
  const original = console.warn
  const lines = []
  console.warn = (message) => lines.push(String(message))
  try {
    await run()
  } finally {
    console.warn = original
  }
  return lines
}

test('mip-cone stages: a row of three scenes, an arrow between cone and Gaussians, clean on a 1.1 in page', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.style('vision')
    const { width: W, height: H } = fig.page
    const made = fig.perspectives({
      x: 12,
      y: 28,
      w: W - 24,
      h: H - 60,
      scenes: [
        { id: 'ray', template: 'mip-cone', options: { mode: 'ray', labels: true } },
        { id: 'cone', template: 'mip-cone', options: { mode: 'cone', labels: true } },
        { id: 'gauss', template: 'mip-cone', options: { mode: 'gaussians' } }
      ],
      arrows: [{ from: 'cone', to: 'gauss', label: '$\\mathcal{N}$' }]
    })
    const [ray, cone, gauss] = made.scenes
    assert.ok(ray.right <= cone.x && cone.right < gauss.x, 'left to right')
    assert.ok(gauss.x - cone.right >= 40, 'room for the arrow and its label')
    // One baseline: through one camera at one scale, o and the image plane print at one height.
    assert.ok(Math.abs(ray.anchors.o[1] - cone.anchors.o[1]) < 0.5, 'o on one baseline')
    assert.ok(Math.abs(cone.anchors.pixel[1] - gauss.anchors.pixel[1]) < 0.5, 'planes line up')
    assert.deepEqual(made.arrows, ['cone-gauss'])
    const arrow = fig.elements.find((element) => element.id === 'cone-gauss')
    assert.equal(arrow.points.at(-1)[1], 0, 'the stage arrow runs level')
    for (const name of ['t0', 't1', 'rdot', 'rdot.label']) {
      assert.ok(cone.anchors[name], `cone anchor ${name}`)
    }
    assert.ok(gauss.anchors.g2, 'a Gaussian anchor to start the encoding arrow at')
    assert.ok(
      fig.elements.some((element) => element.id.startsWith('cone-tlabel-')),
      'labels: true names the cone'
    )
    await fig.save()
    const report = lintFigureScene(JSON.parse(await readFile(file, 'utf8')))
    assert.deepEqual(
      report.errors.map((entry) => `${entry.code} ${entry.id}`),
      [],
      'no errors'
    )
  })
})

test('mip-cone: Gaussians inside the cone warn unless inside: true', async () => {
  const draw = (options) => {
    const b = perspectiveScene({ photos: null })
    PERSPECTIVE_TEMPLATES['mip-cone'].draw(b, options)
  }
  const warned = await capturingWarnings(() => draw({ mode: ['cone', 'gaussians'], quiet: false }))
  assert.match(warned.join('\n'), /two scenes joined by an arrow/)
  const kept = await capturingWarnings(() => draw({ mode: 'cone+gaussians', inside: true }))
  assert.deepEqual(kept, [])
})

test('rowBoxes: one scale, the spare width spread, an arrow gap where arrows join', () => {
  const scenes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const contents = [
    { width: 1, height: 1, pad: 6 },
    { width: 1, height: 1, pad: 6 },
    { width: 1, height: 1, pad: 6 }
  ]
  const { boxes, scale } = rowBoxes(
    { x: 12, y: 8, w: 600, h: 100, arrows: [{ from: 'b', to: 'c' }] },
    scenes,
    contents
  )
  assert.equal(scale, 88, 'height-limited: (100 - 12) / 1')
  assert.equal(boxes[0].x, 12)
  const lastRight = boxes[2].x + boxes[2].w
  assert.ok(Math.abs(lastRight - 612) < 0.01, 'the row is filled to its right edge')
  assert.ok(boxes[2].x - (boxes[1].x + boxes[1].w) >= 48, 'arrow gap')
  assert.throws(() => rowBoxes({ x: 0, y: 0 }, scenes, contents), /give the row its w and h/)
})

test('turnToFit: only an orbit camera, and only for a clear gain', () => {
  const b = perspectiveScene({ photos: null })
  PERSPECTIVE_TEMPLATES['mip-cone'].draw(b, { mode: 'cone' })
  const given = PERSPECTIVE_TEMPLATES['mip-cone'].camera
  assert.equal(turnToFit([b.units], 'oblique', { boxes: [{ w: 400, h: 100 }] }), 'oblique')
  const eye = { eye: [1, -5, 2] }
  assert.equal(turnToFit([b.units], eye, { boxes: [{ w: 400, h: 100 }] }), eye)
  const turned = turnToFit([b.units], given, { boxes: [{ w: 600, h: 90 }] })
  assert.equal(turned.elevation, given.elevation, 'the eye keeps its height')
  assert.ok(Math.abs(turned.azimuth - given.azimuth) <= 5, 'one tidy step at most')
})

test('like without w and h centres in the box of the scene it is like', async () => {
  await withFigure(
    async (file) => {
      const fig = await openFigure(file)
      const a = fig.perspective({ id: 'a', template: 'swin', x: 12, y: 12, w: 200, h: 200 })
      const b = fig.perspective({
        id: 'b',
        template: 'swin',
        options: { vit: true },
        like: 'a',
        x: 300,
        y: 12
      })
      assert.equal(b.y, a.y, 'same top')
      assert.ok(Math.abs(b.x - 300 - (a.x - 12)) < 1, 'same offset in its box')
    },
    { widthIn: 6.75, heightIn: 2 }
  )
})

test('3D defaults: planes shade softly, photos and floors stay even, scenes paint in the line look', async () => {
  const b = perspectiveScene({ photos: null })
  b.plane({ id: 'p', at: [0, 0, 0], axes: 'yz', size: 1 })
  b.floor({ size: 2 })
  const [plane, floor] = [
    b.units.find((u) => u.owner === 'p'),
    b.units.find((u) => u.owner === 'floor')
  ]
  assert.equal(plane.shade, true)
  assert.equal(plane.shading, 'soft')
  assert.equal(floor.shade, false)
  const off = perspectiveScene({ photos: null })
  off.look({ planes: false })
  off.plane({ id: 'q', at: [0, 0, 0], size: 1 })
  assert.equal(off.units[0].shade, false)
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.perspective({ id: 's', template: 'triplane', x: 12, y: 12, w: 200, h: 130 })
    fig.perspective({ id: 'f', template: 'triplane', x: 240, y: 12, w: 200, h: 130, look: 'flat' })
    const looks = Object.fromEntries(
      fig.elements
        .filter((element) => element.customData?.asterIllustration)
        .map((element) => [element.id, element.customData.asterIllustration.look])
    )
    assert.deepEqual(looks, { s: 'line', f: 'flat' })
  })
})

test('examples follow the page: the index says so, a page run reports how one fits', async () => {
  const index = examplesText(null, { page: { widthIn: 3.25, heightIn: 1.1 } })
  assert.match(index, /ray-cone .*adapts to your 3\.25x1\.1 in page/)
  assert.match(index, /--figure <slug>/)
  const text = await examplesForPage('ray-cone', { widthIn: 3.25, heightIn: 1.1, from: 'test' })
  assert.match(
    text,
    /^\/\/ ray-cone on your 3\.25 × 1\.1 in \(468 × 158 units, test\): 0 errors, 0 warnings/
  )
  assert.match(text, /Laid out for your 3\.25x1\.1 in page/)
  assert.match(text, /arrows: \[\{ from: 'cone', to: 'gauss'/)
})

test(
  'every example that reads fig.page runs without errors on a double-column page',
  { timeout: 300_000 },
  async () => {
    const { KIT_EXAMPLES } = await import('./research-figures-kit-examples.mjs')
    const relative = KIT_EXAMPLES.filter((example) => /fig\.page\b/.test(example.script))
    assert.ok(relative.length >= 10, `${relative.length} examples adapt to the page`)
    for (const example of relative) {
      const text = await examplesForPage(example.name, { widthIn: 6.75, heightIn: 2, from: 'test' })
      assert.match(text.split('\n')[0], /: 0 errors,/, text.split('\n')[0])
    }
  }
)
