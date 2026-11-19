// Round 18 drawn glyphs: tensors, planes, token maps, voxels, filmstrips, pyramids, tiled matrices,
// skip arcs and pills draw native shapes in one oblique view that keep their meaning under the
// design layer.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { decodePng, encodePng } from './research-figures-png.mjs'
import { hexToOklch } from './research-figures-color-space.mjs'
import { pixelateKind } from './research-figures-drawn.mjs'

async function withProject(work) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r18-')))
  try {
    await mkdir(path.join(project, '.aster/figures'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    await work(project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

async function withFigure(work, size = { widthIn: 6.75, heightIn: 2.4 }) {
  await withProject(async (project) => {
    const file = path.join(project, '.aster/figures/fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene(size)))
    await work(await openFigure(file), project, file)
  })
}

const chroma = (hex) => hexToOklch(hex)?.C ?? 0

test('a tensor is native faces, grid and size labels, its x, y the top-left of what it draws', async () => {
  await withFigure(async (fig) => {
    const t = fig.tensor({
      id: 'z',
      x: 40,
      y: 30,
      w: 64,
      h: 48,
      d: 32,
      grid: 4,
      labels: true,
      label: '$z$'
    })
    assert.ok(Math.abs(t.y - 30) < 0.01 && Math.abs(t.x - 40) < 0.01)
    const ids = fig.elements
      .filter((element) => element.customData?.asterKit === 'z')
      .map((element) => element.id)
    for (const part of ['z', 'z-front', 'z-top', 'z-side', 'z-grid-front-u', 'z-grid-front-v']) {
      assert.ok(ids.includes(part), part)
    }
    assert.ok(
      fig.get('z-side').customData.asterShade < 0 && fig.get('z-top').customData.asterShade > 0
    )
    fig.box({ id: 'next', label: 'Decoder', x: 260, y: 40, w: 96, h: 40 })
    fig.arrow({ id: 'link', from: 'z', to: 'next' })
    assert.equal(fig.get('link').startBinding?.elementId, 'z')
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
  })
})

test('under fig.focus elsewhere, faces stay shaded and value colours stay as drawn', async () => {
  await withFigure(async (fig) => {
    fig.style('systems')
    fig.tensor({ id: 'z', x: 24, y: 24, w: 56, h: 56, d: 32, role: 'c' })
    fig.pyramid({
      id: 'mem',
      x: 220,
      y: 20,
      w: 140,
      h: 110,
      tiers: [{ label: 'SRAM' }, { label: 'HBM' }]
    })
    fig.box({ id: 'ours', label: 'Ours', x: 520, y: 40, w: 120, h: 48 })
    fig.focus(['ours'])
    await fig.save()
    const front = fig.get('z-front').backgroundColor
    const side = fig.get('z-side').backgroundColor
    assert.equal(front, '#ffffff', 'a plain cuboid turns white')
    assert.ok(hexToOklch(side).L < hexToOklch(front).L - 0.05, 'its side stays a step darker')
    assert.ok(chroma(fig.get('mem-t0').backgroundColor) > 0.05, 'a tier keeps its colour')
    await fig.save()
    assert.equal(fig.get('z-side').backgroundColor, side, 'saving again does not darken it further')
  })
})

test('token maps pixelate a project picture per scale, and a stock photo from its mosaic', async () => {
  await withFigure(async (fig, project) => {
    // A 4 × 4 picture: red left half, blue right half.
    const rgb = []
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        rgb.push(...(x < 2 ? [220, 20, 20] : [20, 20, 220]))
      }
    }
    await mkdir(path.join(project, 'data'), { recursive: true })
    await writeFile(path.join(project, 'data/pic.png'), encodePng(4, 4, rgb))
    assert.deepEqual(decodePng(encodePng(4, 4, rgb)).at(3, 0), [20, 20, 220, 255])
    const maps = fig.tokenMaps({
      id: 'tm',
      x: 16,
      y: 16,
      w: 600,
      h: 200,
      scales: [1, 2, 4],
      photo: 'data/pic.png',
      pedestal: { label: 'one model' }
    })
    assert.equal(maps.maps.length, 3)
    assert.equal(fig.get('tm-r2-r0c0').backgroundColor, '#dc1414')
    assert.equal(fig.get('tm-r2-r0c1').backgroundColor, '#1414dc')
    assert.ok(
      fig.elements.some((element) => element.id === 'tm-r3-photo' && element.type === 'image')
    )
    const box = fig.bounds('tm')
    assert.ok(box.bottom <= 16 + 200 + 1 && box.right <= 16 + 600 + 1, 'it stays in its w × h')
    const mosaic = pixelateKind('bird', 2, 2)
    assert.equal(mosaic.length, 2)
    assert.match(mosaic[0][0], /^#[0-9a-f]{6}$/)
    const report = await fig.save()
    assert.deepEqual(report.errors, [])
  })
})

test('planes, filmstrip, voxel grid, tiled matrix, pills and skip arcs draw clean and bind', async () => {
  await withFigure(
    async (fig) => {
      fig.style('vision')
      const stacks = fig.planes({
        id: 'dense',
        x: 16,
        y: 16,
        facing: 'side',
        levels: [
          { count: 3, w: 36, h: 60, role: 'a', label: '$x_0$' },
          { count: 3, w: 36, h: 60, role: 'd', label: '$x_1$' },
          { count: 3, w: 36, h: 60, role: 'c', label: '$x_2$' }
        ],
        spacing: 40,
        labelSide: 'above'
      })
      assert.ok(stacks.y >= 16 - 0.01)
      const arcs = fig.skipArcs({
        id: 'arcs',
        points: stacks.levels.map((level) => level.anchors.center)
      })
      assert.equal(arcs.arcs.length, 3)
      assert.ok(fig.get('arcs-0to2').customData.asterLink.skipArcs)
      const strip = fig.filmstrip({
        id: 'video',
        x: 340,
        y: 20,
        count: 4,
        kind: 'landscape',
        noise: 'first',
        role: 'c',
        label: 'video',
        labelSide: 'above'
      })
      assert.equal(strip.frames.length, 4)
      assert.ok(strip.y >= 20 - 0.01)
      fig.voxelGrid({ id: 'vox', x: 340, y: 120, n: [2, 2, 2], highlight: [[0, 0, 0]] })
      fig.tiledMatrix({
        id: 'q',
        x: 560,
        y: 120,
        rows: 6,
        cols: 1,
        cell: 12,
        highlight: [{ row: 2 }],
        label: '$Q$',
        loops: [{ side: 'right', label: 'inner' }]
      })
      const tokens = fig.pills({
        id: 'tok',
        x: 640,
        y: 120,
        groups: [
          { n: 3, role: 'c' },
          { n: 2, role: 'accent' }
        ],
        arrows: 'down',
        brace: { group: 1, label: 'actions' }
      })
      assert.equal(tokens.cells.length, 5)
      assert.equal(fig.get('tok-4').type, 'ellipse')
      const report = await fig.save()
      assert.deepEqual(report.errors, [])
      const codes = report.warnings.map((warning) => warning.code)
      for (const code of [
        'arrow-chain',
        'same-hue-outline',
        'stub-arrow',
        'arrowhead',
        'text-contrast'
      ]) {
        assert.ok(
          !codes.includes(code),
          `${code}: ${JSON.stringify(report.warnings.filter((w) => w.code === code))}`
        )
      }
    },
    { widthIn: 6.75, heightIn: 2.6 }
  )
})

test('a voxel grid draws one line per run of edges, and as the focus keeps them hairline', async () => {
  await withFigure(async (fig) => {
    fig.style('vision')
    fig.voxelGrid({ id: 'field', x: 40, y: 20, n: [2, 2, 2], lattice: 'dotted' })
    const lattice = fig.elements.filter((element) => /^field-e\d+$/.test(element.id))
    // A full 2 × 2 × 2 grid: 3 × 3 lines along each of the three axes.
    assert.equal(lattice.length, 27)
    assert.ok(lattice.every((element) => element.strokeStyle === 'dotted'))
    fig.focus(['field'])
    await fig.save()
    const edge = fig.get('field-e0')
    assert.ok(chroma(edge.strokeColor) > 0.05, 'the focus colours its lattice')
    assert.equal(edge.strokeWidth, 1, 'but keeps it a hairline')
  })
})
