import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { lintFigureScene } from './research-figures-lint.mjs'
import { figureElement, newFigureScene } from './research-figures-model.mjs'
import { meaningfulRoles, thinnestStrokePt } from './research-figures-lint-illustration.mjs'
import { commands } from './research-figures-cli.mjs'

async function withFigure(run) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-illustration-')))
  try {
    await mkdir(path.join(project, '.aster'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    await mkdir(path.join(project, 'paper/figures'), { recursive: true })
    const file = path.join(project, 'paper/figures/fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene({ widthIn: 6.75, heightIn: 3 })))
    await run(file, project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const svgOf = (fig, element) => {
  const [, body] = fig.scene.files[element.fileId].dataURL.split(',', 2)
  return Buffer.from(body, 'base64').toString('utf8')
}
const codes = (report) => report.warnings.map((warning) => warning.code)

/** Captures kit warnings while `run` runs. */
async function warningsOf(run) {
  const seen = []
  const original = console.warn
  console.warn = (message) => seen.push(String(message))
  try {
    await run()
  } finally {
    console.warn = original
  }
  return seen
}

test('an illustration is one vector image with its record, fitted to w and h', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(pathToFileURL(file))
    const placed = fig.illustration({ id: 'arm', asset: 'robot-arm', x: 20, y: 20, w: 200, h: 200 })
    const element = fig.get('arm')
    assert.equal(element.type, 'image')
    assert.match(element.fileId, /^aster-ill-/)
    assert.equal(fig.scene.files[element.fileId].mimeType, 'image/svg+xml')
    assert.ok(element.width <= 200.01 && element.height <= 200.01)
    assert.ok(Math.abs(element.width - 200) < 0.02 || Math.abs(element.height - 200) < 0.02)
    const record = element.customData.asterIllustration
    assert.equal(record.source, 'object')
    assert.equal(record.look, 'flat')
    assert.equal(record.projection, 'iso')
    assert.ok(placed.anchors.gripper.every(Number.isFinite))
    assert.ok(placed.point([0, 0, 0]).every(Number.isFinite))
    assert.match(svgOf(fig, element), /data-aster-illustration="1"/)
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
    assert.ok(!codes(report).includes('image'))
  })
})

test('the first illustration records the look; another look warns and lints', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(pathToFileURL(file))
    fig.illustration({ id: 'a', asset: 'laptop', x: 20, y: 20, h: 100, style: 'line' })
    assert.equal(fig.page && fig.get('figure-page').customData.asterPage.illustration.look, 'line')
    const warnings = await warningsOf(() => {
      fig.illustration({ id: 'b', asset: 'phone', x: 200, y: 20, h: 100, style: 'flat' })
    })
    assert.ok(warnings.some((line) => /one look per figure/.test(line)))
    const report = await fig.save()
    assert.ok(codes(report).includes('illustration-style'))
    assert.equal(
      fig.illustration({ id: 'c', asset: 'chip', x: 400, y: 20, h: 80 }).element.customData
        .asterIllustration.look,
      'line'
    )
  })
})

test('the preset sets the default look, and illustrationStyle keeps one for the figure', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(pathToFileURL(file))
    fig.style('outline')
    assert.equal(fig.illustrationStyle().look, 'line')
    assert.deepEqual(
      fig.illustrationStyle({ style: 'tonal', view: 'dimetric', light: 'right', skin: 'medium' }),
      {
        look: 'tonal',
        view: 'dimetric',
        light: 'right',
        skin: 'medium'
      }
    )
    assert.throws(() => fig.illustrationStyle({ style: 'glossy' }), /style/)
  })
})

test('a scene places objects back to front with anchors and item boxes', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(pathToFileURL(file))
    const scene = fig.illustration({
      id: 'room',
      x: 20,
      y: 20,
      h: 300,
      ground: 'room',
      scene: [
        { id: 'robot', asset: 'mobile-robot', at: [60, 120, 0] },
        { id: 'apple', asset: 'fruit', at: [30, 20, 0], roles: { second: 'accent' } },
        {
          id: 'path',
          layer: 'floor',
          draw: (b) =>
            b.path([
              [0, 0, 0],
              [40, 0, 0]
            ])
        }
      ]
    })
    assert.deepEqual(
      scene.items.map((item) => item.id),
      ['path', 'apple', 'robot']
    )
    assert.ok(scene.anchors['robot.head'].every(Number.isFinite))
    assert.equal(fig.get('room').customData.asterIllustration.source, 'scene')
    assert.throws(
      () => fig.illustration({ id: 'bad', x: 0, y: 0, scene: [{ asset: 'unicorn' }] }),
      /No drawn object "unicorn"/
    )
  })
})

test('the agent draws its own object, or embeds any SVG', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(pathToFileURL(file))
    const drawn = fig.illustration({
      id: 'own',
      x: 20,
      y: 20,
      w: 120,
      draw: (b) => {
        b.shadow({ at: [0, 0], size: [20, 20] })
        b.box({ at: [0, 0, 0], size: [20, 20, 12], role: 'accent' })
      }
    })
    assert.equal(drawn.element.customData.asterIllustration.source, 'drawn')
    const warnings = await warningsOf(() => {
      fig.illustration({
        id: 'raw',
        x: 200,
        y: 20,
        w: 60,
        svg: '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#ff0000"/></svg>'
      })
    })
    assert.ok(warnings.some((line) => /no colour roles/.test(line)))
    assert.equal(Math.round(fig.get('raw').height), 60)
    assert.throws(() => fig.illustration({ id: 'x', x: 0, y: 0 }), /exactly one of/)
    assert.throws(() => fig.illustration({ x: 0, y: 0, asset: 'chip' }), /needs an id/)
    assert.throws(
      () => fig.illustration({ id: 'y', asset: 'robot armm', x: 0, y: 0 }),
      /close: robot-arm/
    )
  })
})

test('a leader joins a label to a point with a right angle and a dot', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(pathToFileURL(file))
    const arm = fig.illustration({ id: 'arm', asset: 'robot-arm', x: 200, y: 40, h: 200 })
    fig.leader({ id: 'l', to: arm.anchors.gripper, at: [20, 30], text: 'gripper' })
    const line = fig.get('l-line')
    assert.equal(line.points.length, 3)
    assert.ok(line.x > fig.get('l-text').x + fig.get('l-text').width)
    assert.equal(fig.get('l-dot').type, 'ellipse')
    assert.throws(() => fig.leader({ id: 'm', text: 'x' }), /needs an id, to and at/)
  })
})

test('lint flags thin strokes, too many hues, glow and clichés', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(pathToFileURL(file))
    fig.illustration({ id: 'tiny', asset: 'gpu-server', x: 20, y: 20, h: 100, style: 'line' })
    // Why shrink it by hand: the kit sizes strokes for where it places them, as a person
    // resizing the image on the canvas does not.
    const tiny = fig.get('tiny')
    tiny.width /= 5
    tiny.height /= 5
    fig.illustration({ id: 'a', asset: 'laptop', x: 100, y: 20, h: 80 })
    fig.illustration({ id: 'b', asset: 'phone', x: 200, y: 20, h: 80, roles: { accent: 'second' } })
    fig.illustration({ id: 'c', asset: 'chip', x: 300, y: 20, h: 80, roles: { accent: 'bad' } })
    fig.illustration({
      id: 'bot',
      asset: 'mobile-robot',
      x: 500,
      y: 20,
      h: 120,
      roles: { accent: 'neutral' }
    })
    fig.text({ id: 't', text: 'LLM assistant', x: 20, y: 200 })
    await warningsOf(() => {
      fig.illustration({
        id: 'g',
        x: 420,
        y: 20,
        w: 40,
        svg: '<svg viewBox="0 0 10 10"><filter id="f"><feGaussianBlur/></filter><rect width="10" height="10"/></svg>'
      })
    })
    const report = await fig.save()
    for (const code of [
      'illustration-thin-stroke',
      'illustration-hues',
      'illustration-glow',
      'illustration-cliche'
    ]) {
      assert.ok(codes(report).includes(code), code)
    }
  })
})

test('lint flags a robot that stands for a language model, not a robot in a robotics figure', () => {
  const scene = (words, icon = 'robot') => {
    const page = newFigureScene({ widthIn: 3.25, heightIn: 2 })
    page.elements.push(
      figureElement('image', {
        id: 'bot',
        x: 20,
        y: 20,
        width: 24,
        height: 24,
        fileId: 'f',
        customData: { asterIcon: icon }
      }),
      figureElement('text', {
        id: 'w',
        x: 80,
        y: 20,
        width: 100,
        height: 20,
        text: words,
        fontSize: 16,
        fontFamily: 9
      })
    )
    return codes(lintFigureScene(page))
  }
  assert.ok(scene('LLM agent').includes('illustration-cliche'))
  assert.ok(!scene('robot arm policy').includes('illustration-cliche'))
  assert.ok(scene('reasoning', 'brain').includes('illustration-cliche'))
  assert.ok(scene('better answers ✨', 'check').includes('illustration-cliche'))
})

test('stroke widths and meaningful roles are read from the SVG', () => {
  const svg =
    '<svg viewBox="0 0 100 100"><path d="M0 0" fill="#fff" stroke="#000" stroke-width="0.5"/><path d="M0 0" data-r="accent" fill="#abc" stroke="#abc" stroke-width="0.1" data-seam="1"/><path data-r="second" d="M0 0"/></svg>'
  // 0.5 viewBox units at 100 → 100 units wide is 0.5 units, 0.25 pt.
  assert.equal(thinnestStrokePt(svg, 100), 0.25)
  assert.equal(thinnestStrokePt('<svg viewBox="0 0 10 10"></svg>', 100), null)
  assert.deepEqual([...meaningfulRoles(svg)], ['accent', 'second'])
  assert.deepEqual([...meaningfulRoles(svg, { accent: 'neutral' })], ['second'])
})

test('figures kit illustrations lists and searches', async () => {
  const run = commands['figures kit'].run
  const all = await run({ project: os.tmpdir(), positionals: ['illustrations'], options: {} })
  assert.match(all.text, /gpu-server/)
  const hits = await run({
    project: os.tmpdir(),
    positionals: ['illustrations', 'robot', 'arm'],
    options: {}
  })
  assert.match(hits.text, /matching "robot arm"/)
  const searched = await run({
    project: os.tmpdir(),
    positionals: ['illustrations'],
    options: { '--search': 'microscope' }
  })
  assert.match(searched.text, /microscope/)
  await assert.rejects(
    run({ project: os.tmpdir(), positionals: ['box', 'extra'], options: {} }),
    /one topic/
  )
})

test('plots and illustrations share one embedding path: safe, stored once, pruned by one rule', async () => {
  const { GENERATED_FILE, pruneGeneratedFiles, sanitizeSvg, storeSvgFile, svgFileId } =
    await import('./research-figures-svg-embed.mjs')
  const { plotFileId, sanitizePlotSvg } = await import('./research-figures-plot-embed.mjs')
  const dirty =
    '<?xml version="1.0"?><svg viewBox="0 0 4 4"><script>alert(1)</script><rect onclick="x()" width="4" height="4"/><image href="https://example.com/a.png"/></svg>'
  const clean = sanitizeSvg(dirty)
  assert.doesNotMatch(clean, /script|onclick|example\.com|<\?xml/)
  assert.match(clean, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
  assert.equal(sanitizeSvg(clean), clean)
  assert.equal(sanitizePlotSvg, sanitizeSvg)
  assert.equal(plotFileId(clean), svgFileId('aster-plot-', clean))
  const scene = { files: {}, elements: [] }
  const id = storeSvgFile(scene, 'aster-ill-', clean)
  assert.equal(storeSvgFile(scene, 'aster-ill-', clean), id)
  assert.equal(scene.files[id].mimeType, 'image/svg+xml')
  assert.ok(GENERATED_FILE.test(id) && GENERATED_FILE.test(plotFileId(clean)))
  scene.files.mine = { id: 'mine' }
  assert.equal(pruneGeneratedFiles(scene.files, scene.elements), 1)
  assert.deepEqual(Object.keys(scene.files), ['mine'])
  assert.throws(() => sanitizeSvg('<html></html>'), /not an SVG/)
  await withFigure(async (file) => {
    const fig = await openFigure(pathToFileURL(file))
    fig.illustration({ id: 'raw', x: 20, y: 20, w: 40, svg: dirty })
    assert.doesNotMatch(svgOf(fig, fig.get('raw')), /script|onclick/)
  })
})
