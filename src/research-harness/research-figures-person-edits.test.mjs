import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  applyPersonEdits,
  emptyPersonEdits,
  prunePersonEdits,
  recordPersonEdits
} from './research-figures-person-edits.mjs'
import { personEditLines, personEditReport } from './research-figures-person-words.mjs'

const cli = path.join(import.meta.dirname, 'cli.mjs')
const SCENE = '.aster/figures/method.excalidraw'
const LEDGER = '.aster/figures/src/method.edits.json'

function harness(project, args) {
  const run = spawnSync(process.execPath, [cli, ...args, '--project', project], {
    encoding: 'utf8'
  })
  return { code: run.status, out: `${run.stdout}${run.stderr}` }
}

const SCRIPT = (decX, extra = '') => `import { openFigure } from './aster-figures-kit.mjs'
const fig = await openFigure(new URL('../method.excalidraw', import.meta.url))
fig.reset()
fig.box({ id: 'enc', label: 'Encoder', x: 40, y: 60, w: 120, h: 48 })
fig.box({ id: 'dec', label: 'Decoder', x: ${decX}, y: 60, w: 120, h: 48 })
fig.text({ id: 'lbl', text: 'z', x: 200, y: 30 })
fig.text({ id: 'note', text: 'draft', x: 40, y: 200 })
fig.arrow({ id: 'a1', from: 'enc', to: 'dec' })
${extra}
const lint = await fig.save()
console.log(JSON.stringify(lint.personEdits ?? null))
`

async function withFigure(run) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-person-edits-')))
  try {
    await mkdir(path.join(project, '.aster'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    assert.equal(harness(project, ['figures', 'new', '--name', 'Method']).code, 0)
    const runScript = async (decX, extra) => {
      await writeFile(
        path.join(project, '.aster/figures/src/method.figure.mjs'),
        SCRIPT(decX, extra)
      )
      return harness(project, ['figures', 'run', '--figure', 'method'])
    }
    await runScript(260)
    await run(project, runScript)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const readScene = async (project) => JSON.parse(await readFile(path.join(project, SCENE), 'utf8'))
const byId = (scene, id) => scene.elements.find((element) => element.id === id)

/** What Aster records when the person edits on its canvas: their changes since the file. */
let labelOffset = 0
async function personEdits(project, edit, touched) {
  const before = await readScene(project)
  labelOffset = byId(before, 'enc-label').x - byId(before, 'enc').x
  const after = structuredClone(before)
  edit(after)
  const ledger = recordPersonEdits(emptyPersonEdits(), {
    before: before.elements,
    after: after.elements,
    files: after.files,
    touched
  })
  await writeFile(path.join(project, LEDGER), JSON.stringify(ledger))
  await writeFile(path.join(project, SCENE), JSON.stringify(after))
  return ledger
}

test('a script run keeps what the person moved, relabelled, recoloured, deleted and added', async () => {
  await withFigure(async (project, runScript) => {
    await personEdits(
      project,
      (scene) => {
        for (const id of ['enc', 'enc-label']) {
          byId(scene, id).x += 12
          byId(scene, id).y += 4
        }
        Object.assign(byId(scene, 'lbl'), { text: 'z_t', originalText: 'z_t', width: 27 })
        byId(scene, 'dec').backgroundColor = '#ffc9c9'
        byId(scene, 'dec').locked = true
        scene.elements = scene.elements.filter((element) => element.id !== 'note')
        scene.elements.push({
          ...byId(scene, 'lbl'),
          id: 'mine',
          text: 'TODO',
          originalText: 'TODO',
          y: 250
        })
        // Why untouched: Excalidraw rewrote it on load; it is not the person's edit.
        byId(scene, 'dec').roughness = 1
      },
      ['enc', 'enc-label', 'lbl', 'dec', 'note', 'mine']
    )
    const run = await runScript(260)
    assert.equal(run.code, 0, run.out)
    assert.match(run.out, /The person edited this figure by hand/)
    assert.match(run.out, /'Encoder' \(enc\): moved 12 right and 4 down/)
    assert.match(run.out, /label 'z' → 'z_t'/)
    const scene = await readScene(project)
    assert.deepEqual([byId(scene, 'enc').x, byId(scene, 'enc').y], [52, 64])
    const before = JSON.parse(await readFile(path.join(project, LEDGER), 'utf8'))
    assert.ok(before.edits.some((entry) => entry.id === 'enc'))
    assert.equal(
      byId(scene, 'enc-label').x - byId(scene, 'enc').x,
      labelOffset,
      'the label moves with its box'
    )
    assert.equal(byId(scene, 'lbl').text, 'z_t')
    assert.equal(byId(scene, 'dec').backgroundColor, '#ffc9c9')
    assert.equal(byId(scene, 'dec').locked, true)
    assert.equal(byId(scene, 'note'), undefined, 'what the person deleted stays deleted')
    assert.equal(byId(scene, 'mine').text, 'TODO', 'what the person added comes back after reset')
    const check = harness(project, ['figures', 'check', '--figure', 'method'])
    assert.match(
      check.out,
      /note person-edit: kept over the script: 'Encoder' \(enc\): moved 12 right/
    )
    // Why a note: the agent cannot clear a finding about what the person placed by hand.
    assert.doesNotMatch(check.out, /ERROR near-miss-align/)
    assert.match(
      harness(project, ['figures', 'edits', '--figure', 'method']).out,
      /'TODO' \(mine\): added text/
    )
  })
})

test('the person wins a conflict, the agent is told, and a gone element is reported', async () => {
  await withFigure(async (project, runScript) => {
    await personEdits(project, (scene) => (byId(scene, 'dec').x += 20), ['dec'])
    const moved = await runScript(300)
    assert.match(moved.out, /'Decoder' \(dec\) x: your run set 300, the person's 280 is kept/)
    assert.equal(byId(await readScene(project), 'dec').x, 280)
    const check = harness(project, ['figures', 'check', '--figure', 'method'])
    assert.match(check.out, /person-edit-overrode: 'Decoder' \(dec\) x: your run set 300/)
    const gone = await runScript(260, "fig.remove('dec')")
    assert.match(gone.out, /These edits no longer apply because the element is gone/)
    assert.match(
      harness(project, ['figures', 'check', '--figure', 'method']).out,
      /person-edit-gone: the element is gone, so this no longer applies: 'Decoder' \(dec\)/
    )
    const released = harness(project, [
      'figures',
      'edits',
      '--figure',
      'method',
      '--release',
      'dec'
    ])
    assert.match(released.out, /Released dec/)
    assert.equal(JSON.parse(await readFile(path.join(project, LEDGER), 'utf8')).edits.length, 0)
  })
})

test('arrows follow a box the person moved when the script re-routed them, labels follow too', () => {
  const box = (id, x) => ({
    id,
    type: 'rectangle',
    x,
    y: 0,
    width: 100,
    height: 40,
    boundElements: [
      { id: `${id}-t`, type: 'text' },
      { id: 'a', type: 'arrow' }
    ]
  })
  const label = (id, x) => ({
    id: `${id}-t`,
    type: 'text',
    containerId: id,
    x: x + 20,
    y: 10,
    width: 60,
    height: 20,
    text: id,
    textAlign: 'center',
    verticalAlign: 'middle'
  })
  const arrow = {
    id: 'a',
    type: 'arrow',
    x: 104,
    y: 20,
    points: [
      [0, 0],
      [92, 0]
    ],
    width: 92,
    height: 0,
    startBinding: { elementId: 'p' },
    endBinding: { elementId: 'q' }
  }
  const scene = { elements: [box('p', 0), label('p', 0), box('q', 200), label('q', 200), arrow] }
  const ledger = recordPersonEdits(emptyPersonEdits(), {
    before: scene.elements,
    after: scene.elements.map((element) => (element.id === 'q' ? { ...element, y: 30 } : element)),
    touched: ['q']
  })
  const { changed, report } = applyPersonEdits(scene, ledger)
  assert.equal(changed, true)
  assert.deepEqual(
    report.kept.map((item) => item.id),
    ['q']
  )
  const [p, , q, qLabel, moved] = scene.elements
  assert.equal(p.y, 0)
  assert.equal(q.y, 30)
  assert.equal(qLabel.y, 40, 'the bound label moves with its box')
  assert.deepEqual(
    moved.points.map(([x, y]) => [moved.x + x, moved.y + y]),
    [
      [104, 20],
      [150, 20],
      [150, 50],
      [196, 50]
    ],
    'the arrow end follows the box as one clean elbow'
  )
  assert.equal(applyPersonEdits(scene, ledger).changed, false, 'applying again changes nothing')
})

test('a restored version drops the edits it undid, and a restyle is not taken for edits', () => {
  const element = {
    id: 'b',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    strokeColor: '#000'
  }
  const page = (style) => ({
    id: 'figure-page',
    type: 'frame',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    customData: { asterPage: { style } }
  })
  let ledger = recordPersonEdits(emptyPersonEdits(), {
    before: [page('graphite'), element],
    after: [page('slate'), { ...element, x: 5, strokeColor: '#123' }],
    touched: ['b', 'figure-page']
  })
  assert.deepEqual(Object.keys(ledger.edits[0].set), ['x'], 'the colour came from the new preset')
  ledger = recordPersonEdits(ledger, {
    before: [{ ...element, x: 5 }],
    after: [{ ...element, x: 0 }],
    touched: ['b']
  })
  assert.equal(ledger.edits.length, 0, 'moving it back drops the edit')
  ledger = recordPersonEdits(emptyPersonEdits(), {
    before: [element],
    after: [{ ...element, x: 5 }],
    touched: ['b']
  })
  assert.equal(prunePersonEdits(ledger, [{ ...element, x: 5 }]).edits.length, 1)
  assert.equal(prunePersonEdits(ledger, [element]).edits.length, 0)
  const lines = personEditLines(personEditReport(ledger), 'method')
  assert.match(
    lines.join('\n'),
    /'b' \(b\): moved 5 right\n.*figures edits --figure method --release <id>/
  )
})

test('figures edit changes a few things directly, never what the person set', async () => {
  await withFigure(async (project) => {
    await personEdits(project, (scene) => (byId(scene, 'enc').backgroundColor = '#fff3bf'), ['enc'])
    const refused = harness(project, [
      'figures',
      'edit',
      '--figure',
      'method',
      '--set',
      'enc.backgroundColor=#000000'
    ])
    assert.equal(refused.code, 1)
    assert.match(refused.out, /the person set this by hand\. Ask them first/)
    const before = await readScene(project)
    const done = harness(project, [
      'figures',
      'edit',
      '--figure',
      'method',
      '--set',
      'dec.dy=24',
      '--set',
      'lbl.text=z_{t+1}'
    ])
    assert.equal(done.code, 0, done.out)
    assert.match(done.out, /Changed dec, lbl, a1, dec-label/)
    assert.match(done.out, /make the same change in .*method\.figure\.mjs too/)
    const after = await readScene(project)
    assert.equal(byId(after, 'dec').y, byId(before, 'dec').y + 24)
    assert.equal(byId(after, 'dec-label').y, byId(before, 'dec-label').y + 24)
    assert.ok(byId(after, 'lbl').width > byId(before, 'lbl').width, 'the new label is measured')
    const end = byId(after, 'a1')
    assert.equal(
      end.y + end.points.at(-1)[1],
      byId(before, 'a1').y + byId(before, 'a1').points.at(-1)[1] + 24
    )
    assert.match(
      harness(project, ['figures', 'edit', '--figure', 'method', '--set', 'enc.x=abc']).out,
      /needs a number/
    )
  })
})
