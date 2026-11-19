// Round 14, engine wired into the harness: mip-cone's Gaussians inside a translucent cone, the
// volume-boxes template, the shadow depth cue, a sun placed by `at` alone, perspective labels
// kept on the page, a legend that wraps and one the person asked for kept on a small page.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { dropCandidates } from './research-figures-lint-small.mjs'

async function withFigure(run, size = { widthIn: 3.25, heightIn: 1.6 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r14w-')))
  try {
    const folder = path.join(project, '.aster/figures')
    await mkdir(folder, { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const file = path.join(folder, 'fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene(size)))
    await run(await openFigure(file))
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

test("mip-cone 'cone+gaussians' puts a Gaussian in every frustum of a translucent cone", async () => {
  await withFigure((fig) => {
    fig.style('vision')
    const [a, b] = fig.perspectives({
      scenes: [
        { id: 'ray', template: 'mip-cone', options: { mode: 'ray' }, x: 12, y: 16, w: 210, h: 176 },
        {
          id: 'cone',
          template: 'mip-cone',
          options: { mode: 'cone+gaussians' },
          x: 246,
          y: 16,
          w: 210,
          h: 176
        }
      ]
    }).scenes
    assert.ok(b.anchors.g1 && b.anchors.g2 && b.anchors.g3)
    // One scale and one baseline: o to the pixel spans the same length at the same height.
    const span = (scene) => Math.hypot(...scene.anchors.pixel.map((v, k) => v - scene.anchors.o[k]))
    assert.ok(Math.abs(span(a) - span(b)) < 0.5, 'one scale for both panels')
    assert.ok(Math.abs(a.anchors.o[1] - b.anchors.o[1]) < 0.5, 'one baseline for both panels')
  })
})

test('volume-boxes: boxes, a sun and a camera, with their anchors', async () => {
  await withFigure(
    (fig) => {
      fig.style('generative')
      const v = fig.perspective({
        id: 'v',
        template: 'volume-boxes',
        x: 12,
        y: 12,
        w: 800,
        h: 236,
        options: { photos: [null, { kind: 'bird' }, { kind: 'bird' }], render: { kind: 'bird' } }
      })
      for (const name of ['box1', 'box2', 'box3', 'box1.bottom', 'sun', 'cam']) {
        assert.ok(v.anchors[name], name)
      }
    },
    { widthIn: 6.75, heightIn: 1.9 }
  )
})

test('a floor under a solid lit by a sun placed by at alone counts a shadow cue', async () => {
  await withFigure((fig) => {
    fig.style('robotics')
    fig.perspective({
      id: 's',
      x: 12,
      y: 12,
      w: 300,
      h: 200,
      draw: (b) => {
        b.floor({ id: 'floor', z: 0, size: [2, 2] })
        b.light({ id: 'sun', at: [-1.3, -0.9, 1.5] })
        b.ellipsoid({ id: 'ball', at: [0, 0, 0.3], r: 0.3, role: 'accent' })
      }
    })
    assert.ok(fig.get('s').customData.asterPerspective.cues.includes('shadow'))
  })
})

test("an 'outside' scene label stays 12 units inside the page", async () => {
  await withFigure((fig) => {
    fig.style('vision')
    fig.perspective({
      id: 'a',
      template: 'nerf-rays',
      x: 0,
      y: 8,
      w: 260,
      h: 200,
      labels: [{ at: 'ray1.start', text: 'ray 1', side: 'outside', gap: 40 }]
    })
    const label = fig.bounds('a-label-0')
    assert.ok(label.x >= 12 - 0.5, `x ${label.x}`)
  })
})

test('a legend row wraps at the page margin; one the person asked for is not offered for dropping', async () => {
  await withFigure((fig) => {
    const items = [
      { label: 'denoising step', role: 'main' },
      { label: 'cross-attention', color: 'a' },
      { label: 'switch', swatch: 'switch' },
      { label: 'skip connection', role: 'skip' },
      { label: 'concat', symbol: 'concat' }
    ]
    const asked = fig.legend({ id: 'lg', x: 12, y: 180, items, asked: true })
    assert.ok(asked.right <= 468 - 12 + 0.5, `right ${asked.right}`)
    assert.ok(asked.height > 30, 'two rows')
    fig.legend({ id: 'own', x: 12, y: 20, items: items.slice(0, 2) })
    const offered = dropCandidates(fig.elements).map((entry) => entry.what)
    assert.ok(offered.some((what) => what.includes('own: label the parts')))
    // Round 15: an asked legend is only ever compacted (one row), never offered for dropping.
    assert.ok(!offered.some((what) => /legend lg: label/.test(what)))
  })
})
