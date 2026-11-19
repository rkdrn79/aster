import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { templateListText, templateText } from './research-figures-templates.mjs'
import { kitIndexText, kitReferenceText } from './research-figures-kit-index.mjs'

const standIn = (color) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="151.2pt" height="108pt" viewBox="0 0 151.2 108"><path d="M10 100 L140 10" stroke="${color}" fill="none"/><g transform="translate(5 105) scale(0.07 -0.07)"><path d="M0 0 L100 0"/></g></svg>`

async function withFigure(run, size = { widthIn: 6.75, heightIn: 2.2 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r11t-')))
  try {
    await mkdir(path.join(project, '.aster/figures'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const file = path.join(project, '.aster/figures/fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene(size)))
    await run(file)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

test('flow-teaser: ODE beside SDE in 1D, two transports in 2D, rerun in place', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const drawn = fig.template('flow-teaser', { id: 'ft', x: 16, y: 14, w: 940, h: 244 })
    assert.deepEqual(Object.keys(drawn.ids).toSorted(), ['a', 'aTitle', 'b', 'bTitle'])
    assert.equal(fig.get('ft-a').customData.asterScience.style, 'ode')
    assert.equal(fig.get('ft-b').customData.asterScience.style, 'sde')
    const count = fig.elements.length
    assert.deepEqual((await fig.save()).errors, [])
    const rerun = await openFigure(file)
    rerun.template('flow-teaser', { id: 'ft', x: 16, y: 14, w: 940, h: 244 })
    assert.equal(rerun.elements.length, count, 'a rerun replaces the template')
  })
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    fig.template('flow-teaser', {
      id: 'ft',
      x: 16,
      y: 14,
      w: 940,
      h: 214,
      kind: '2d',
      data: 'moons',
      titles: ['Flow matching', 'Ours']
    })
    assert.ok(fig.get('ft-a-noise') && fig.get('ft-b-data'))
    assert.equal(fig.get('ft-b').customData.asterScience.style, 'straight')
    assert.throws(
      () => fig.template('flow-teaser', { id: 'x', kind: '3d' }),
      /kind must be '1d' or '2d'/
    )
    assert.throws(
      () => fig.template('flow-teaser', { id: 'y', pair: ['ode', 'curved'] }),
      /takes two of ode, sde, straight/
    )
    assert.deepEqual((await fig.save()).errors, [])
  })
})

test('loss-landscape: the surface beside its map, runs named at their ends', async () => {
  await withFigure(
    async (file) => {
      const fig = await openFigure(file)
      const drawn = fig.template('loss-landscape', { id: 'll', x: 16, y: 14, w: 652, h: 246 })
      assert.ok(drawn.ids.surface && drawn.ids.map && drawn.ids.label0 && drawn.ids.label1)
      const report = await fig.save()
      assert.deepEqual(report.errors, [])
      assert.ok(
        !report.warnings.some((finding) => finding.code === 'text-outside-shape'),
        'labels over the map are meant'
      )
      fig.template('loss-landscape', {
        id: 'top',
        view: 'top',
        x: 700,
        y: 14,
        w: 240,
        h: 240,
        paths: [{ from: [0.9, -0.9] }]
      })
      assert.ok(!fig.elements.some((element) => element.id.startsWith('top-surface')))
      assert.throws(
        () => fig.template('loss-landscape', { id: 'bad', view: 'side' }),
        /view must be both, 3d or top/
      )
    },
    { widthIn: 6.75, heightIn: 2 }
  )
})

test('teaser: a schematic beside two plots at one height, captioned (a)–(c)', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const drawn = await fig.template('teaser', {
      id: 'tz',
      x: 16,
      y: 14,
      w: 940,
      plots: [{ svg: standIn('#1263a6') }, { svg: standIn('#585858') }]
    })
    assert.deepEqual(Object.keys(drawn.ids).toSorted(), [
      'b',
      'c',
      'data',
      'model',
      'noise',
      'paths'
    ])
    assert.equal(fig.get('tz-b').type, 'image')
    assert.ok(fig.bounds('tz-a-caption').width > 0 && fig.bounds('tz-b-label').width > 0)
    assert.equal(
      Math.round(fig.bounds('tz-a-caption').y),
      Math.round(fig.bounds('tz-b-label').y),
      'captions on one line'
    )
    await assert.rejects(
      fig.template('teaser', { id: 'one', plots: [{ svg: standIn('#000') }] }),
      /teaser takes plots/
    )
    assert.deepEqual((await fig.save()).errors, [])
  })
})

test('the new templates and kit topics are listed', () => {
  for (const name of ['flow-teaser', 'loss-landscape', 'teaser']) {
    assert.match(templateListText(), new RegExp(name))
    assert.match(templateText(name), /fig.template/)
  }
  assert.match(kitIndexText(), /science: .*\n {2}density /)
  assert.match(kitIndexText(), /plots: .*\n {2}plot /)
  assert.match(kitReferenceText('plots'), /plotPoint/)
  assert.match(kitReferenceText('flowPaths,surface3d'), /momentum/)
})

test('teaser without plots places stand-ins, says so, and the lint asks for the real ones', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const warned = []
    const warn = console.warn
    console.warn = (message) => warned.push(String(message))
    try {
      await fig.template('teaser', { id: 'tz', x: 16, y: 14 })
    } finally {
      console.warn = warn
    }
    assert.match(warned.join('\n'), /are stand-ins/)
    assert.equal(fig.get('tz-b').customData.asterPlot.standIn, true)
    const report = await fig.save()
    assert.ok(
      report.warnings.some((finding) => finding.code === 'plot-stand-in' && finding.id === 'tz-b')
    )
  })
})
