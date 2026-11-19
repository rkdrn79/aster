// Round 14 lint: fig.allow warns instead of throwing, data swatches and icons are not flagged as
// library colours, legends or small pictures, fork trunks are not stubs, unrelated near-misses
// warn, arrow labels move off panel edges, and a small page says what to drop, not to shrink.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { KIT_REFERENCE } from './research-figures-kit-reference.mjs'
import { ALLOWABLE_CODES } from './research-figures-kit-allow.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { brokenLabel } from './research-figures-label-spot.mjs'
import { elementBounds, isInside, overlaps } from './research-figures-geometry.mjs'
import { dropCandidates, isSmallPage } from './research-figures-lint-small.mjs'
import { pageFitChecks } from './research-figures-lint-structure.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2.4 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r14l-')))
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

const all = (report) => [...report.errors, ...report.warnings, ...report.notes]
const of = (report, code) => all(report).filter((entry) => entry.code === code)
const codes = (report) => all(report).map((entry) => entry.code)

async function warnings(run) {
  const said = []
  const original = console.warn
  console.warn = (message) => said.push(String(message))
  try {
    await run()
  } finally {
    console.warn = original
  }
  return said
}

test('allow() of a rule that is fixed, not allowed, warns and the script runs on', async () => {
  await withFigure(async (fig) => {
    fig.box({ id: 'a', label: 'A', x: 40, y: 40 })
    const said = await warnings(() => {
      fig.allow('text-over-shape', ['a'])
      fig.allow('small-glyph')
    })
    assert.equal(said.length, 2)
    assert.match(said[0], /text-over-shape is fixed, never allowed.*labelPosition/)
    assert.match(said[1], /Allowable: empty-box/)
    fig.allow('legend', ['a'])
    assert.ok(Array.isArray((await fig.save()).warnings))
  })
  const entry = KIT_REFERENCE.find((item) => item.name === 'allow')
  for (const code of ALLOWABLE_CODES) {
    assert.ok(entry.does.includes(code), `the reference lists ${code}`)
  }
})

test('a colour that is data is neither a library colour nor a legend; a real key still is', async () => {
  await withFigure(async (fig) => {
    fig.style('vision')
    for (const [k, color] of ['#d7b454', '#3b82f6'].entries()) {
      fig.box({ id: `mlp${k}`, label: 'MLP', x: 400, y: 40 + k * 80, w: 64, h: 32 })
      fig.box({ id: `px${k}`, x: 520, y: 46 + k * 80, w: 20, h: 20, color, label: '', exact: true })
      fig.text({ id: `ray${k}`, text: `Ray ${k + 1}`, x: 546, y: 46 + k * 80, size: 14 })
      fig.arrow({ id: `to${k}`, from: `mlp${k}`, to: `px${k}` })
    }
    fig.box({ id: 'gt', x: 700, y: 40, w: 40, h: 22, fill: '#22c55e', label: '', swatch: true })
    const clean = await fig.save()
    assert.deepEqual(of(clean, 'library-color'), [], JSON.stringify(of(clean, 'library-color')))
    assert.deepEqual(of(clean, 'legend'), [])
    fig.box({ id: 'k1', x: 40, y: 200, w: 16, h: 10, color: '#3b82f6', label: '', exact: true })
    fig.text({ id: 'k1t', text: 'input-dependent', x: 60, y: 196, size: 14 })
    fig.box({ id: 'k2', x: 200, y: 200, w: 16, h: 10, color: '#22c55e', label: '', exact: true })
    fig.text({ id: 'k2t', text: 'fixed', x: 220, y: 196, size: 14 })
    fig.box({ id: 'mod', label: 'Encoder', x: 40, y: 40, w: 120, h: 48, fill: '#3b82f6' })
    const keyed = await fig.save()
    assert.equal(of(keyed, 'legend')[0]?.id, 'k1')
    assert.match(of(keyed, 'legend')[0].message, /fig\.legend/)
    assert.ok(of(keyed, 'library-color')[0].message.includes('mod'))
  })
})

test("a density in a world role is the kit's ramp, not a library colour", async () => {
  for (const style of ['generative', 'systems']) {
    await withFigure(async (fig) => {
      fig.style(style)
      for (const [i, color] of ['a', 'b', 'c', 'd', 'accent', 'output'].entries()) {
        fig.density2d({ id: `p${i}`, x: 24 + i * 100, y: 40, w: 90, h: 90, color })
      }
      assert.deepEqual(of(await fig.save(), 'library-color'), [], style)
    })
  }
})

test('an icon picture stays small; a small photo gets one finding with one size to aim for', async () => {
  await withFigure(async (fig) => {
    await fig.image({ id: 'ic', kind: 'cat', x: 300, y: 40, w: 30, h: 30, icon: true })
    await fig.image({ id: 'ph', kind: 'dog', x: 360, y: 40, w: 22, h: 22 })
    const report = await fig.save()
    const sizes = [...of(report, 'small-thumbnail'), ...of(report, 'small-glyph')]
    assert.deepEqual(
      sizes.map((entry) => [entry.code, entry.id]),
      [['small-thumbnail', 'ph']]
    )
    assert.match(sizes[0].message, /make each one \d+ units or more/)
  })
})

test('a fork trunk only has to show; an arrow with a head still needs its shaft', async () => {
  await withFigure(async (fig) => {
    fig.box({ id: 'src', label: 'P', x: 24, y: 120, w: 48, h: 32 })
    fig.box({ id: 't1', label: 'B', x: 94, y: 88, w: 48, h: 24 })
    fig.box({ id: 't2', label: 'C', x: 94, y: 160, w: 48, h: 24 })
    fig.fork({ id: 'fk', from: 'src', to: ['t1', 't2'] })
    fig.box({ id: 'a', label: 'A', x: 300, y: 40, w: 48, h: 32 })
    fig.box({ id: 'b', label: 'B', x: 356, y: 40, w: 48, h: 32 })
    fig.arrow({ id: 'ab', from: 'a', to: 'b' })
    const stubs = of(await fig.save(), 'stub-arrow').map((entry) => entry.id)
    assert.ok(!stubs.includes('fk-trunk'), stubs.join(', '))
    assert.ok(stubs.includes('ab'))
  })
})

test('items that only happen to stack warn; a pair an arrow joins is an error', async () => {
  await withFigure(async (fig) => {
    fig.box({ id: 'a16', label: 'A', x: 24, y: 24, w: 48, h: 32 })
    fig.box({ id: 'b16', label: 'B', x: 88, y: 24, w: 48, h: 32 })
    fig.arrow({ id: 'ab', from: 'a16', to: 'b16' })
    fig.box({ id: 't1', label: 'C', x: 94, y: 96, w: 48, h: 24 })
    fig.box({ id: 't2', label: 'D', x: 94, y: 152, w: 48, h: 24 })
    fig.box({ id: 'p', label: 'E', x: 300, y: 40, w: 48, h: 32 })
    fig.box({ id: 'q', label: 'F', x: 380, y: 44, w: 48, h: 32 })
    fig.arrow({ id: 'pq', from: 'p', to: 'q' })
    const report = await fig.save()
    const level = (id) =>
      report.errors.some((entry) => entry.code === 'near-miss-align' && entry.id === id)
        ? 'error'
        : report.warnings.some((entry) => entry.code === 'near-miss-align' && entry.id === id)
          ? 'warning'
          : null
    assert.equal(level('q'), 'error')
    assert.equal(level('t1') ?? level('b16'), 'warning')
  })
})

test('an arrow label wider than the gap between panels moves or breaks instead of crossing', async () => {
  assert.equal(brokenLabel('Co-Fine-Tune', 2), 'Co-Fine-\nTune')
  assert.equal(brokenLabel('Env Feedback Execution Errors', 2), 'Env Feedback\nExecution Errors')
  assert.equal(brokenLabel('tok', 2), null)
  await withFigure(async (fig) => {
    fig.style('robotics', { look: 'preset' })
    fig.box({ id: 'a1', label: 'web data', x: 40, y: 60, w: 96, h: 40 })
    fig.box({ id: 'b1', label: 'VLA model', x: 216, y: 60, w: 96, h: 40 })
    fig.panel({ id: 'pa', around: ['a1'], title: 'Data', pad: 16 })
    fig.panel({ id: 'pb', around: ['b1'], title: 'Model', pad: 16 })
    fig.arrow({ id: 'ar', from: 'a1', to: 'b1', label: 'Co-Fine-Tune' })
    fig.box({ id: 'h1', label: 'x', x: 600, y: 60, w: 48, h: 32 })
    fig.box({ id: 'h2', label: 'y', x: 760, y: 60, w: 48, h: 32 })
    fig.arrow({ id: 'ah', from: 'h1', to: 'h2', label: 'tok', labelPosition: 'head' })
    fig.arrow({
      id: 'at',
      from: 'h1',
      to: 'h2',
      label: 'tok',
      labelPosition: 'tail',
      fromAt: 0.8,
      toAt: 0.8
    })
    const report = await fig.save()
    assert.deepEqual(
      of(report, 'text-over-shape'),
      [],
      JSON.stringify(of(report, 'text-over-shape'))
    )
    const parts = fig.elements.filter(
      (element) => element.customData?.asterKit === 'ar' && element.type === 'text'
    )
    assert.ok(parts.length >= 2, 'the label broke onto lines')
    for (const panel of ['pa', 'pb']) {
      const box = elementBounds(fig.get(panel))
      for (const part of parts) {
        const ink = elementBounds(part)
        assert.ok(!overlaps(ink, box) || isInside(ink, box), `${part.id} crosses ${panel}`)
      }
    }
    const head = elementBounds(fig.elements.find((element) => element.id.startsWith('ah-label')))
    const tail = elementBounds(fig.elements.find((element) => element.id.startsWith('at-label')))
    assert.ok(head.x > 690, `the head label sits by the head (${head.x})`)
    assert.ok(tail.x < 670, `the tail label sits by the tail (${tail.x})`)
  })
})

test('a small page names what to compact instead of asking to shrink, and page-overfull stays quiet', async () => {
  assert.ok(isSmallPage({ widthIn: 3.25, heightIn: 1.6 }))
  assert.ok(isSmallPage({ widthIn: 6.75, heightIn: 1.6 }))
  assert.ok(!isSmallPage({ widthIn: 6.75, heightIn: 2.4 }))
  await withFigure(
    async (fig) => {
      fig.style('generative')
      for (const [k, kind] of ['cat', 'dog', 'cat', 'dog'].entries()) {
        await fig.image({ id: `v${k}`, kind, x: 16 + k * 40, y: 16, w: 32, h: 32 })
      }
      fig.legend({
        id: 'lg',
        x: 16,
        y: 160,
        items: [
          { label: 'trained', color: 'a' },
          { label: 'frozen', color: 'frozen' }
        ]
      })
      fig.math({
        id: 'eq',
        tex: 'L = \\mathbb{E}\\,\\|\\epsilon - \\epsilon_\\theta(z_t, t)\\|^2',
        x: 200,
        y: 100
      })
      const report = await fig.save()
      const small = of(report, 'small-page')[0]
      assert.ok(small, codes(report).join(', '))
      // Round 15: compact, never drop; the top three of the list are named.
      assert.match(small.message, /Compact rather than shrink/)
      assert.match(small.message, /keep everything the request names/)
      assert.match(small.message, /4 similar pictures \(v0, v1, v2, …\): stack them closer/)
      assert.doesNotMatch(small.message, /keep two|put it in the caption|drop or move first/)
      assert.deepEqual(of(report, 'page-overfull'), [])
    },
    { widthIn: 3.25, heightIn: 1.6 }
  )
})

test('drop candidates rank by what they free, and three of a kind is not a repeat', () => {
  const box = (id, x, y, w, h, extra = {}) => ({
    id,
    type: 'rectangle',
    x,
    y,
    width: w,
    height: h,
    ...extra
  })
  const four = [0, 1, 2, 3].map((k) => box(`c${k}`, 20 + k * 60, 20, 48, 40))
  const three = [0, 1, 2].map((k) => box(`p${k}`, 300 + k * 60, 120, 48, 40))
  const found = dropCandidates([...four, ...three]).map((entry) => entry.what)
  assert.equal(found.length, 1)
  assert.match(found[0], /4 similar items \(c0, c1, c2, …\): stack them closer/)
})

test('page-overfull on a page with blank space says to spread out, without tall-figure', () => {
  const page = { widthIn: 6.75, heightIn: 3.4, sizeBy: 'person' }
  const crowd = (code, id) => ({ code, id, message: '' })
  const report = {
    errors: [],
    warnings: [
      crowd('stub-arrow', 'a1'),
      crowd('stub-arrow', 'a2'),
      crowd('text-over-shape', 'b1'),
      crowd('label-on-head', 'b2'),
      crowd('page-fill', null)
    ],
    notes: [crowd('tall-figure', null)]
  }
  const found = []
  pageFitChecks(page, report, (level, code, _element, message) => found.push({ code, message }))
  assert.equal(found[0].code, 'page-overfull')
  assert.match(
    found[0].message,
    /around a1, a2, b1, b2.*spread the crowded items into the free space first/
  )
  assert.deepEqual(
    report.notes.map((entry) => entry.code),
    [],
    'the page-size suggestion that would contradict it is dropped'
  )
})

test('an empty stretch is named by its panel or its nearest item', async () => {
  await withFigure(async (fig) => {
    fig.box({ id: 'a', label: 'A', x: 24, y: 24, w: 64, h: 40 })
    fig.box({ id: 'b', label: 'B', x: 880, y: 280, w: 64, h: 40 })
    const report = await fig.save()
    const empty = [...of(report, 'empty-region'), ...of(report, 'empty-space')]
    assert.ok(
      empty.some((entry) => /beside [ab]\b/.test(entry.message)),
      JSON.stringify(empty)
    )
  })
})

test('a label a hair wider than its exact box is an overflow, with the width to use', async () => {
  await withFigure(async (fig) => {
    fig.style(undefined, { look: 'preset' })
    fig.box({ id: 'seg', label: 'Segmentation', size: 14, x: 40, y: 40, w: 96, h: 32, exact: true })
    const overflow = of(await fig.save(), 'text-overflow')[0]
    assert.ok(overflow)
    assert.match(overflow.message, /make the box w: 98 or more/)
  })
})
