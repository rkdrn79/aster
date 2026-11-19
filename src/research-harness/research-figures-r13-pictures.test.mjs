// Round 13 pictures: project pictures placed without await, shown through view or a pixel crop,
// fitted by cover or contain, cut into patches, and linted when they print too small.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { encodePng } from './research-figures-png.mjs'
import { placeSource } from './research-figures-kit-source.mjs'

/** A plain PNG of `width` × `height` written into the project. */
async function picture(project, name, width, height) {
  const pixels = new Uint8Array(width * height * 4).fill(200)
  await mkdir(path.join(project, 'data'), { recursive: true })
  await writeFile(path.join(project, 'data', name), encodePng(width, height, pixels))
  return `data/${name}`
}

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2.5 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r13p-')))
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

const found = (report, code) =>
  [...report.errors, ...report.warnings, ...report.notes].filter((entry) => entry.code === code)

test('image({ src }) is placed without await and its view crops a sprite sheet', async () => {
  await withFigure(async (file, project) => {
    const sheet = await picture(project, 'sheet.png', 400, 200)
    const fig = await openFigure(file)
    fig.image({
      id: 'cell',
      src: sheet,
      x: 40,
      y: 40,
      w: 48,
      view: { x: 0.25, y: 0, w: 0.25, h: 0.5 }
    })
    const cell = fig.get('cell')
    assert.equal(cell.height, 48, 'a square view keeps a square slot')
    assert.deepEqual(
      [cell.crop.x, cell.crop.y, cell.crop.width, cell.crop.height],
      [100, 0, 100, 100]
    )
    fig.image({
      id: 'px',
      src: sheet,
      x: 120,
      y: 40,
      h: 40,
      crop: { x: 0, y: 100, width: 200, height: 100 }
    })
    assert.equal(fig.get('px').width, 80, 'a pixel crop sets the shape')
    await assert.rejects(
      fig.image({ id: 'bad', src: sheet, crop: { x: 300, y: 0, width: 200, height: 10 } }),
      /crop .* inside the 400 × 200 picture/
    )
    await fig.save()
  })
})

test('fit: cover trims to the slot and warns when much is cut; contain shrinks the slot', () => {
  const size = { width: 400, height: 200 }
  const cover = placeSource({ id: 'a', src: 'x.png', x: 0, y: 0, w: 100, h: 100 }, size)
  assert.equal(cover.crop.width, 200)
  assert.ok(cover.trimmed > 0.49)
  const contain = placeSource({ id: 'b', x: 0, y: 0, w: 100, h: 100, fit: 'contain' }, size)
  assert.deepEqual([contain.x, contain.y, contain.w, contain.h], [0, 25, 100, 50])
  assert.equal(contain.trimmed, 0)
  assert.throws(() => placeSource({ id: 'c', fit: 'stretch' }, size), /fit/)
})

test('patches({ src }) cuts the project picture, and image({ patch, of }) takes the same cell', async () => {
  await withFigure(async (file, project) => {
    const photo = await picture(project, 'cam.png', 300, 300)
    const fig = await openFigure(file)
    const spec = { id: 'grid', src: photo, x: 40, y: 40, w: 90, h: 90, rows: 3, cols: 3 }
    fig.patches(spec)
    const image = fig.get('grid-image')
    assert.equal(image.customData.asterSource, photo)
    assert.equal(image.crop.width, 300)
    const cell = await fig.image({
      id: 'cell',
      patch: [1, 2],
      of: spec,
      x: 200,
      y: 40,
      w: 30,
      h: 30
    })
    assert.deepEqual([cell.crop.x, cell.crop.y, cell.crop.width], [200, 100, 100])
  })
})

test('small-picture: the paper’s own pictures under a third of an inch warn, icons do not', async () => {
  await withFigure(
    async (file, project) => {
      const photo = await picture(project, 'chair.png', 256, 256)
      const sprite = await picture(project, 'items.png', 128, 32)
      const fig = await openFigure(file)
      for (const index of [0, 1, 2]) {
        fig.image({ id: `v${index}`, src: photo, x: 40 + index * 44, y: 40, w: 36, h: 36 })
      }
      fig.image({
        id: 'icon',
        src: sprite,
        x: 200,
        y: 40,
        w: 24,
        view: { x: 0, y: 0, w: 0.25, h: 1 }
      })
      const report = await fig.save()
      const small = found(report, 'small-picture')
      assert.equal(small.length, 1)
      assert.match(small[0].message, /v0 \(36 × 36\)/)
      assert.doesNotMatch(small[0].message, /icon \(/)
      assert.equal(found(report, 'small-thumbnail').length, 0, 'icons and wide pages pass')
      fig.allow('small-picture', ['v0', 'v1', 'v2'])
      assert.equal(found(await fig.save(), 'small-picture').length, 0)
    },
    { widthIn: 6.75, heightIn: 1.6 }
  )
})
