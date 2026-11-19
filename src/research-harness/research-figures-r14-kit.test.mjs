// Round 14 kit fixes: fig.measure takes a bare label and `figures measure` measures from the
// shell; a panel can keep its title off a row of its own; a sub-caption's y wins over under; the
// flow teaser fills a single column.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'

const exec = promisify(execFile)
const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url))

async function withProject(run, size = { widthIn: 3.25, heightIn: 1.6 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r14k-')))
  try {
    const folder = path.join(project, '.aster/figures')
    await mkdir(folder, { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const file = path.join(folder, 'fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene(size)))
    await run({ project, file })
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

test('fig.measure takes a bare label, and an unknown kind names the option shapes', async () => {
  await withProject(async ({ file }) => {
    const fig = await openFigure(file)
    const bare = fig.measure('Classification', { size: 16 })
    const kind = fig.measure('text', { text: 'Classification', size: 16 })
    assert.deepEqual(bare, kind)
    assert.ok(fig.measure('$x_t$', { size: 16 }).width > 0)
    assert.throws(() => fig.measure(42), /measure\('text', \{ text, size \}\)/)
  })
})

test('figures measure prints a label width, and the box around it', async () => {
  await withProject(async ({ project }) => {
    const { stdout } = await exec(
      process.execPath,
      [CLI, 'figures', 'measure', 'Encoder', '--size', '14', '--box', '--project', project],
      { cwd: project }
    )
    assert.match(stdout, /^"Encoder" at 14: [\d.]+ × [\d.]+ units of ink/)
    assert.match(stdout, /a box around it \(fig\.box with this label\): \d+ × \d+ units/)
    const failed = await exec(process.execPath, [CLI, 'figures', 'measure', '--project', project], {
      cwd: project
    }).catch((error) => error)
    assert.match(String(failed.stderr ?? failed.stdout), /figures measure "Encoder" --size 14/)
  })
})

test('panel titleRow false keeps the title in its padding, adding no row', async () => {
  await withProject(async ({ file }) => {
    const fig = await openFigure(file)
    fig.box({ id: 'a', label: 'A', x: 40, y: 80, w: 64, h: 32 })
    const row = fig.panel({ id: 'p', around: ['a'], title: 'GPU SRAM' })
    const top = row.y
    const flat = fig.panel({ id: 'q', around: ['a'], title: 'GPU SRAM', titleRow: false })
    assert.ok(flat.y > top, 'no title row above the item')
    const title = fig.bounds('q-title')
    assert.ok(title.y >= flat.y && title.bottom <= flat.y + flat.height)
  })
})

test('a sub-caption given y keeps it beside under', async () => {
  await withProject(async ({ file }) => {
    const fig = await openFigure(file)
    fig.box({ id: 'a', label: 'A', x: 40, y: 40, w: 64, h: 32 })
    fig.subcaption({ id: 's', under: 'a', label: '(a)', text: 'ours', y: 150 })
    assert.equal(Math.round(fig.bounds('s').y), 150)
  })
})

test('the 2D flow teaser fills a single-column panel with large blobs', async () => {
  await withProject(async ({ file }) => {
    const fig = await openFigure(file)
    fig.style('generative')
    fig.template('flow-teaser', { id: 'ft', x: 16, y: 12, w: 436, h: 200, kind: '2d' })
    const blob = fig.bounds('ft-a-noise')
    assert.ok(blob.width >= 80, `blob ${blob.width} wide`)
    const report = await fig.save({ dryRun: true })
    assert.deepEqual(
      report.warnings.filter((entry) => entry.code === 'uneven-spacing'),
      []
    )
  })
})

test('a small hourglass stacks its cards at 7 pt rather than overflow them', async () => {
  await withProject(async ({ file }) => {
    const fig = await openFigure(file)
    fig.style('generative')
    const h = fig.unet({
      id: 'h',
      shape: 'hourglass',
      x: 100,
      y: 40,
      w: 200,
      h: 110,
      levels: 2,
      label: '\\epsilon_\\theta',
      blocks: { enc: ['QKV', 'QKV'], dec: ['QKV', 'QKV'] }
    })
    const [a, b] = h.cards.enc.map((id) => fig.bounds(id))
    assert.ok(Math.abs(a.x - b.x) < 1 && b.y > a.bottom, 'stacked in one column')
    const report = await fig.save({ dryRun: true })
    assert.deepEqual(
      report.errors.filter((entry) => entry.code === 'text-overflow'),
      []
    )
  })
})

test('a leader takes math and drops straight from its text when the target is under it', async () => {
  await withProject(async ({ file }) => {
    const fig = await openFigure(file)
    const over = fig.leader({ id: 'l1', to: [100, 150], at: [60, 40], text: 'density $\\sigma$' })
    const line = fig.get('l1-line')
    assert.equal(line.points.length, 2)
    assert.equal(line.points[1][0], 0, 'a vertical drop')
    assert.ok(line.y >= over.y + over.height, 'from under the text')
    fig.leader({ id: 'l2', to: [300, 150], at: [60, 90], tex: '\\mathcal{N}(\\mu, \\Sigma)' })
    assert.ok(
      fig.elements.some(
        (element) => element.customData?.asterKit === 'l2' && element.type === 'image'
      )
    )
  })
})

test('nerf-rays takes a colour per ray and a radius per sample; like panels centre in w × h', async () => {
  await withProject(async ({ file }) => {
    const fig = await openFigure(file)
    fig.style('vision')
    const a = fig.perspective({
      id: 'a',
      template: 'nerf-rays',
      x: 8,
      y: 8,
      w: 200,
      h: 180,
      options: { rayRoles: ['accent', '#336699'], sampleSize: [[1, 2, 3, 4, 3, 2, 1], 2] }
    })
    const b = fig.perspective({
      id: 'b',
      template: 'nerf-rays',
      like: 'a',
      x: 240,
      y: 8,
      w: 200,
      h: 180
    })
    assert.ok(Math.abs(b.x - 240 - (a.x - 8)) < 1, 'centred like its twin')
  })
})

test('margin and a loose near-miss can be allowed; a joined near-miss stays an error', async () => {
  await withProject(async ({ file }) => {
    const fig = await openFigure(file)
    fig.box({ id: 'a', label: 'A', x: 4, y: 40, w: 64, h: 32 })
    fig.box({ id: 'b', label: 'B', x: 120, y: 46, w: 64, h: 32 })
    fig.arrow({ id: 'ab', from: 'a', to: 'b' })
    fig.allow('margin', ['a'])
    fig.allow('near-miss-align', ['a', 'b'])
    const report = await fig.save({ dryRun: true })
    const codes = [...report.errors, ...report.warnings].map((entry) => entry.code)
    assert.ok(!codes.includes('margin'))
    assert.ok(report.errors.some((entry) => entry.code === 'near-miss-align'))
  })
})

test("a world's own role tints are no generated pastel set", async () => {
  await withProject(
    async ({ file }) => {
      const fig = await openFigure(file)
      fig.style('systems')
      for (const [index, color] of ['a', 'c', 'input'].entries()) {
        fig.box({ id: `b${index}`, label: color, x: 24 + index * 152, y: 48, w: 112, h: 40, color })
      }
      const report = await fig.save({ dryRun: true })
      assert.ok(!report.errors.some((entry) => entry.code === 'uniform-tints'))
    },
    { widthIn: 6.75, heightIn: 1.2 }
  )
})
