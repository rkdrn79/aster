// Careful drawing (`figures careful`): sketches, the choice, and rounds of review by the separate
// art director chat that Aster starts (it writes the critic file; the harness only reads it).
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { encodePng } from './research-figures-png.mjs'
import { FIGURE_ART_DIRECTOR_RULE } from './research-figures-style-rules.mjs'

const exec = promisify(execFile)
const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url))
const SLUG = 'method-overview'

async function cli(project, args) {
  try {
    const { stdout, stderr } = await exec(process.execPath, [CLI, ...args, '--project', project], {
      cwd: project,
      maxBuffer: 16 * 1024 * 1024
    })
    return { code: 0, stdout, stderr }
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr }
  }
}

const careful = (project, ...args) =>
  cli(project, ['figures', 'careful', '--figure', SLUG, ...args])
const carefulJson = async (project, ...args) => {
  const result = await careful(project, ...args, '--json')
  return { ...result, json: JSON.parse(result.stdout) }
}

async function withFigure(work) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-careful-')))
  try {
    await mkdir(path.join(project, '.aster'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const made = await cli(project, ['figures', 'new', '--name', 'Method overview'])
    assert.equal(made.code, 0, made.stderr)
    const folder = path.join(project, '.aster/figures')
    await work(project, {
      folder,
      careful: path.join(folder, '.careful'),
      scene: path.join(folder, `${SLUG}.excalidraw`),
      progress: async () =>
        JSON.parse(await readFile(path.join(folder, `.careful/${SLUG}.json`), 'utf8')),
      critic: (startedAt = new Date().toISOString()) =>
        writeFile(
          path.join(folder, `.careful/${SLUG}.critic.json`),
          JSON.stringify({ address: 'orca_session_id:critic-1', agent: 'claude', startedAt })
        )
    })
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

test('--start makes the folders, keeps them out of Git, names the sketch files and resets', async () => {
  await withFigure(async (project, paths) => {
    assert.equal((await careful(project)).stdout.includes('not started'), true)
    const started = await careful(project, '--start')
    assert.equal(started.code, 0, started.stderr)
    assert.equal(await readFile(path.join(paths.careful, '.gitignore'), 'utf8'), '*\n')
    assert.deepEqual(await readdir(path.join(paths.careful, SLUG)), [])
    const record = await paths.progress()
    assert.equal(record.version, 1)
    assert.equal(record.slug, SLUG)
    assert.equal(record.rounds, 3)
    assert.deepEqual(
      [record.sketches, record.chose, record.reviews, record.done, record.wantCritic],
      [[], null, [], null, null]
    )
    assert.match(record.startedAt, /^\d{4}-\d\d-\d\dT/)
    for (const name of ['s1', 's2', 's3', 's4']) {
      assert.ok(
        started.stdout.includes(path.join(paths.careful, SLUG, `${name}.excalidraw`)),
        `names ${name}`
      )
    }
    assert.match(started.stdout, /copy the figure file/i)
    assert.match(started.stdout, /openFigure\(/)
    assert.match(started.stdout, /--sketches/)
    // A second start resets what was recorded and takes the new number of rounds.
    await careful(project, '--sketches', 's1: a | s2: b')
    await careful(project, '--chose', 's1')
    await careful(project, '--round', '1', '--fixes', 'REVISE\nx')
    await careful(project, '--done', 'ok')
    await careful(project, '--start', '--rounds', '2')
    const again = await paths.progress()
    assert.equal(again.rounds, 2)
    assert.deepEqual([again.sketches, again.chose, again.reviews, again.done], [[], null, [], null])
  })
})

test('--rounds is 1 to 10, an unknown figure is not_found, and --review needs a start', async () => {
  await withFigure(async (project) => {
    for (const bad of ['0', '11', '2.5', 'many']) {
      const result = await careful(project, '--start', '--rounds', bad)
      assert.equal(result.code, 1, bad)
    }
    const unknown = await cli(project, ['figures', 'careful', '--figure', 'nope', '--json'])
    assert.equal(unknown.code, 1)
    assert.equal(JSON.parse(unknown.stdout).error.code, 'not_found')
    const review = await carefulJson(project, '--review')
    assert.equal(review.code, 1)
    assert.equal(review.json.error.code, 'invalid_argument')
    assert.equal(
      review.json.error.message,
      `Start careful drawing first: figures careful --figure ${SLUG} --start --rounds N`
    )
    const both = await careful(project, '--start', '--review')
    assert.equal(both.code, 1)
    assert.match(both.stderr, /one action at a time/)
    const stray = await careful(project, '--why', 'x')
    assert.match(stray.stderr, /--why goes with --chose/)
  })
})

test('--sketches records s1..s4 notes, needs two, and warns about a missing or broken file', async () => {
  await withFigure(async (project, paths) => {
    await careful(project, '--start', '--rounds', '3')
    for (const bad of ['s1: only one', 's1: a | s5: b', 's1: a | s1: b', 'first: a | s2: b']) {
      const result = await careful(project, '--sketches', bad)
      assert.equal(result.code, 1, bad)
    }
    const drawn = path.join(paths.careful, SLUG)
    await writeFile(path.join(drawn, 's1.excalidraw'), '{"elements":[]}')
    await writeFile(path.join(drawn, 's2.excalidraw'), 'not json')
    const result = await carefulJson(
      project,
      '--sketches',
      's1: left to right | S2 : two rows | s3: hub'
    )
    assert.equal(result.code, 0, result.stderr)
    assert.deepEqual(result.json.state.sketches, [
      { name: 's1', note: 'left to right' },
      { name: 's2', note: 'two rows' },
      { name: 's3', note: 'hub' }
    ])
    assert.equal(result.json.warnings.length, 2)
    assert.match(result.json.warnings.join('\n'), /s2: .*not valid JSON/)
    assert.match(result.json.warnings.join('\n'), /s3: .*missing/)
    assert.deepEqual(
      (await paths.progress()).sketches.map((sketch) => sketch.name),
      ['s1', 's2', 's3']
    )
    const text = await careful(project, '--sketches', 's1: a | s2: b')
    assert.match(text.stdout, /WARNING s2: .*not valid JSON/)
    assert.match(text.stdout, /--chose/)
  })
})

test('--chose takes a recorded sketch or an existing sketch file, by the agent or the person', async () => {
  await withFigure(async (project, paths) => {
    await careful(project, '--start')
    assert.match((await careful(project, '--chose', 's1')).stderr, /No sketch s1/)
    await careful(project, '--sketches', 's1: a | s2: b')
    assert.equal((await careful(project, '--chose', 's5')).code, 1)
    assert.equal((await careful(project, '--chose', 's3')).code, 1)
    const agent = await carefulJson(project, '--chose', 's2', '--why', 'one story axis')
    assert.equal(agent.code, 0, agent.stderr)
    assert.equal(agent.json.state.chose.name, 's2')
    assert.equal(agent.json.state.chose.why, 'one story axis')
    assert.equal(agent.json.state.chose.by, 'agent')
    assert.equal((await careful(project, '--chose', 's1', '--by', 'robot')).code, 1)
    await careful(project, '--chose', 's1', '--by', 'person')
    assert.equal((await paths.progress()).chose.by, 'person')
    // An unrecorded sketch counts when its file is there.
    await writeFile(path.join(paths.careful, SLUG, 's3.excalidraw'), '{}')
    assert.equal((await careful(project, '--chose', 's3')).code, 0)
  })
})

test('--review without an art director asks Aster for one and says to retry', async () => {
  await withFigure(async (project, paths) => {
    await careful(project, '--start', '--rounds', '3')
    const result = await careful(project, '--review')
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /Aster is starting this figure's art director/)
    assert.match(result.stdout, /--review` again in about 20 seconds/)
    assert.match((await paths.progress()).wantCritic, /^\d{4}-\d\d-\d\dT/)
    const json = JSON.parse((await careful(project, '--review', '--json')).stdout)
    assert.equal(json.status, 'waiting-for-critic')
    assert.deepEqual(
      (await readdir(paths.careful)).filter((name) => name.endsWith('.md')),
      []
    )
  })
})

test('--review with an art director writes the request file and prints the commands', async () => {
  await withFigure(async (project, paths) => {
    await careful(project, '--start', '--rounds', '3')
    await careful(project, '--sketches', 's1: row | s2: hub')
    await careful(project, '--chose', 's2', '--why', 'the hub shows the contribution')
    await paths.critic()
    // The design brief and a reference with an image of its own.
    const library = path.join(project, 'refs-library')
    await mkdir(path.join(library, 'img'), { recursive: true })
    await writeFile(path.join(library, 'img/var.png'), encodePng(1, 1, [255, 255, 255]))
    const scene = JSON.parse(await readFile(paths.scene, 'utf8'))
    const frame = scene.elements.find((element) => element.type === 'frame')
    frame.customData = {
      ...frame.customData,
      asterDesign: {
        focus: [],
        colourBy: null,
        data: [],
        brief: 'Following var: its staircase of maps, with our content'
      }
    }
    const sceneText = JSON.stringify(scene)
    await writeFile(paths.scene, sceneText)
    const result = await carefulJson(project, '--review', '--library', library)
    assert.equal(result.code, 0, result.stderr)
    const { json } = result
    assert.equal(json.status, 'ready')
    assert.equal(json.round, 1)
    assert.equal(json.rounds, 3)
    assert.equal(json.address, 'orca_session_id:critic-1')
    assert.equal(json.subject, `Figure ${SLUG}: round 1 of 3`)
    assert.equal(json.bodyFile, path.join(paths.careful, `${SLUG}.round1.md`))
    const printPng = path.join(project, '.aster/cache/figures', `${SLUG}.print.png`)
    const fullPng = path.join(project, '.aster/cache/figures', `${SLUG}.png`)
    let body = await readFile(json.bodyFile, 'utf8')
    assert.match(body, /^Art director review: figure method-overview, round 1 of 3\.$/m)
    assert.match(
      body,
      new RegExp(`^Print-size render: ${printPng}.*run figures preview first`, 'm')
    )
    assert.match(body, /^Page: \d+(\.\d+)? × \d+(\.\d+)? in$/m)
    assert.match(body, /^Design brief: Following var: its staircase of maps, with our content$/m)
    assert.match(
      body,
      new RegExp(`^Reference followed: var, image: ${path.join(library, 'img/var.png')}$`, 'm')
    )
    assert.match(body, /^Sketch chosen: s2 \(the hub shows the contribution\)$/m)
    assert.ok(!body.includes("Last round's fixes"))
    assert.ok(body.includes(FIGURE_ART_DIRECTOR_RULE), 'the rule, verbatim')
    assert.match(body, /aster orchestration reply --id <message_id> --body "<SHIP or REVISE/)
    assert.match(body, /Do not edit any file\.\n$/)
    // With the renders current, no note is added to their paths.
    await mkdir(path.dirname(printPng), { recursive: true })
    await writeFile(printPng, encodePng(1, 1, [0, 0, 0]))
    await writeFile(fullPng, encodePng(1, 1, [0, 0, 0]))
    await writeFile(
      path.join(project, '.aster/cache/figures', `${SLUG}.json`),
      JSON.stringify({
        sceneSha256: createHash('sha256').update(sceneText).digest('hex'),
        print: `.aster/cache/figures/${SLUG}.print.png`
      })
    )
    await careful(project, '--review', '--library', library)
    body = await readFile(json.bodyFile, 'utf8')
    assert.match(body, new RegExp(`^Print-size render: ${printPng}$`, 'm'))
    assert.match(body, new RegExp(`^Full render: ${fullPng}$`, 'm'))
    const text = (await careful(project, '--review')).stdout
    assert.match(
      text,
      /Round 1 of 3: send this request to the art director \(orca_session_id:critic-1\)/
    )
    assert.ok(
      text.includes(
        `aster orchestration send --to orca_session_id:critic-1 --type question --subject "Figure ${SLUG}: round 1 of 3" --body "$(cat '${json.bodyFile}')" --json`
      )
    )
    assert.match(text, /aster orchestration check --wait --timeout-ms 600000 --json/)
    assert.match(text, /figures careful --figure method-overview --round 1 --fixes "<its reply>"/)
    assert.match(text, /--want-critic, then --review again/)
    // No reference named: a line that says so.
    frame.customData.asterDesign.brief = 'a hub with four spokes'
    await writeFile(paths.scene, JSON.stringify(scene))
    await careful(project, '--review')
    assert.match(
      await readFile(json.bodyFile, 'utf8'),
      /^No reference named in the design brief\.$/m
    )
  })
})

test("rounds go on: the last round's fixes come back, and the end is told", async () => {
  await withFigure(async (project, paths) => {
    await careful(project, '--start', '--rounds', '2')
    await paths.critic()
    const first = await careful(
      project,
      '--round',
      '1',
      '--fixes',
      'REVISE\n1. Move the legend 37 units left\n- Text at 7 pt'
    )
    assert.match(
      first.stdout,
      /^Round 1 of 2 recorded: 2 fixes\. Make every fix, preview, then --review for round 2/
    )
    const review = await carefulJson(project, '--review')
    assert.equal(review.json.round, 2)
    const body = await readFile(review.json.bodyFile, 'utf8')
    assert.match(body, /round 2 of 2\./)
    assert.match(
      body,
      /^Last round's fixes \(check they were made\):\n- Move the legend 37 units left\n- Text at 7 pt$/m
    )
    assert.match(body, /^No reference named in the design brief\.$/m)
    const last = await careful(project, '--round', '2', '--fixes', 'REVISE\nOne more fix')
    assert.match(last.stdout, /finish with .*--done "<what changed>"/)
    const over = await carefulJson(project, '--review')
    assert.equal(over.json.status, 'rounds-done')
    assert.match(
      (await careful(project, '--review')).stdout,
      /All 2 rounds are done\. Finish with .*--done/
    )
  })
})

test('a SHIP answer ends the rounds, and an art director whose chat ended is replaced', async () => {
  await withFigure(async (project, paths) => {
    await careful(project, '--start', '--rounds', '4')
    const old = new Date(Date.now() - 60_000).toISOString()
    await paths.critic(old)
    await careful(project, '--round', '1', '--fixes', 'SHIP — nothing left to fix')
    assert.equal((await carefulJson(project, '--review')).json.status, 'shipped')
    // Its chat has ended: --want-critic stamps a time after the critic file, so we wait for Aster.
    const asked = await careful(project, '--want-critic')
    assert.match(asked.stdout, /Asked Aster for a new art director.*about 20 seconds/)
    await careful(project, '--round', '1', '--fixes', 'REVISE\nx')
    const waiting = await carefulJson(project, '--review')
    assert.equal(waiting.json.status, 'waiting-for-critic')
    assert.match((await careful(project, '--review')).stdout, /chat has ended/)
    await paths.critic()
    const ready = await carefulJson(project, '--review')
    assert.equal(ready.json.status, 'ready')
    assert.equal(ready.json.round, 2)
  })
})

test('--round takes the verdict from the first line and the fixes from the rest', async () => {
  await withFigure(async (project, paths) => {
    await careful(project, '--start', '--rounds', '3')
    const record = async (round, text, ...extra) =>
      (await carefulJson(project, '--round', String(round), '--fixes', text, ...extra)).json
    let json = await record(
      1,
      'revise, then\n\n1. Align the rows\n2) Cut the extra label\n- Widen the gap to 16\n* Text at 7 pt\n• Fix the arrow\nPlain line\n1.5 pt stroke'
    )
    assert.equal(json.review.verdict, 'revise')
    assert.deepEqual(json.review.fixes, [
      'Align the rows',
      'Cut the extra label',
      'Widen the gap to 16',
      'Text at 7 pt',
      'Fix the arrow',
      'Plain line',
      '1.5 pt stroke'
    ])
    json = await record(1, 'Ship it\nOne last thing')
    assert.equal(json.review.verdict, 'ship')
    assert.deepEqual(
      (await paths.progress()).reviews.map((entry) => [entry.round, entry.verdict]),
      [[1, 'ship']]
    )
    json = await record(2, 'Move the title up\nand left')
    assert.equal(json.review.verdict, 'revise')
    assert.equal(json.review.fixes.length, 2)
    assert.equal(json.verdictGiven, false)
    json = await record(3, 'REVISE\nSomething', '--ship')
    assert.equal(json.review.verdict, 'ship')
    // At most 12 fixes.
    const many = Array.from({ length: 15 }, (_, index) => `Fix number ${String(index + 1)}`).join(
      '\n'
    )
    json = await record(2, `REVISE\n${many}`)
    assert.equal(json.review.fixes.length, 12)
    assert.equal(json.cut, 3)
    // Rounds are in order and within the number asked for.
    await careful(project, '--start', '--rounds', '2')
    assert.match(
      (await careful(project, '--round', '2', '--fixes', 'REVISE')).stderr,
      /Record round 1 before round 2/
    )
    assert.match((await careful(project, '--round', '3', '--fixes', 'REVISE')).stderr, /1 to 2/)
    assert.match((await careful(project, '--round', '1')).stderr, /needs --fixes/)
    const text = await careful(project, '--round', '1', '--fixes', 'SHIP')
    assert.match(text.stdout, /Round 1 of 2 recorded: 0 fixes \(SHIP\)/)
    assert.match(text.stdout, /finish with .*--done/)
  })
})

test('--done and the state summary tell where careful drawing stands', async () => {
  await withFigure(async (project, paths) => {
    await careful(project, '--start', '--rounds', '3')
    await careful(project, '--sketches', 's1: left to right | s2: hub and spokes')
    await careful(project, '--chose', 's2', '--why', 'the hub reads fastest')
    await paths.critic()
    await careful(project, '--round', '1', '--fixes', 'REVISE\nMove the legend\nCut a label')
    const before = (await careful(project)).stdout
    assert.match(before, /3 art director rounds/)
    assert.match(before, /s1: left to right \(file missing: /)
    assert.match(before, /Chosen: s2 by agent, the hub reads fastest/)
    assert.match(before, /Art director: orca_session_id:critic-1 \(claude\)/)
    assert.match(before, /Round 1: REVISE\n {4}- Move the legend\n {4}- Cut a label/)
    assert.match(before, /Done: not yet/)
    const done = await carefulJson(project, '--done', 'Moved the legend, cut a label')
    assert.equal(done.json.state.done.note, 'Moved the legend, cut a label')
    assert.match(done.json.state.done.at, /^\d{4}-\d\d-\d\dT/)
    assert.match((await careful(project)).stdout, /Done: Moved the legend, cut a label \(/)
    const state = (await carefulJson(project)).json
    assert.equal(state.started, true)
    assert.equal(state.critic.address, 'orca_session_id:critic-1')
    assert.match((await paths.progress()).updatedAt, /^\d{4}-\d\d-\d\dT/)
    // The progress file is written whole: no temp file stays behind.
    assert.deepEqual(
      (await readdir(paths.careful)).filter((name) => name.endsWith('.tmp')),
      []
    )
  })
})
