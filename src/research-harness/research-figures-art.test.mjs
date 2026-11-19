// Hybrid figures: generated, textless art keyed and trimmed (research-figures-art) and made through
// `figures art` with a stub in place of Codex (never the real one).
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { ART_CAP, prepareArt } from './research-figures-art.mjs'
import { artPrompt, artSize } from './research-figures-art-gen.mjs'
import { decodePng, encodePng } from './research-figures-png.mjs'

const exec = promisify(execFile)
const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url))
const SLUG = 'method-overview'

/** 200 × 100 white, a red square (white inside it) at the left and a blue bar at the right. */
function sheet() {
  const rgb = new Uint8Array(200 * 100 * 3).fill(255)
  const paint = (x0, y0, x1, y1, color) => {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        rgb.set(color, (y * 200 + x) * 3)
      }
    }
  }
  paint(20, 20, 80, 80, [200, 30, 30])
  paint(35, 35, 65, 65, [255, 255, 255])
  paint(130, 40, 180, 60, [30, 60, 200])
  return encodePng(200, 100, rgb)
}

test('art is keyed off white joined to the border, keeps white inside the drawing, and splits', () => {
  const one = prepareArt(sheet())
  assert.equal(one.keyed, 'background')
  assert.equal(one.pieces.length, 1)
  const whole = decodePng(one.pieces[0].png)
  assert.equal(whole.channels, 4)
  // Trimmed to the drawing (x 20–180, y 20–80) with a small margin.
  assert.ok(whole.width >= 160 && whole.width <= 172, String(whole.width))
  assert.ok(whole.height >= 60 && whole.height <= 72, String(whole.height))
  assert.equal(whole.at(0, 0)[3], 0, 'the corner is transparent')
  const inside = whole.at(Math.round(whole.width * 0.19), Math.round(whole.height / 2))
  assert.deepEqual(inside, [255, 255, 255, 255], 'the white inside the square stays opaque')
  const split = prepareArt(sheet(), { split: true })
  assert.equal(split.pieces.length, 2)
  assert.ok(split.pieces[0].width > split.pieces[1].width, 'left (the square) first')
  assert.ok(
    decodePng(split.pieces[0].grid).width > split.pieces[0].width,
    'the grid adds its margin'
  )
})

test('the prompt says no text, white, and the size from the slot shape', () => {
  const prompt = artPrompt('an oblique plane with a landscape photo', '3/2')
  assert.match(prompt, /NO text of any kind/)
  assert.match(prompt, /pure white/)
  assert.match(prompt, /landscape \(1536x1024\)/)
  assert.match(prompt, /an oblique plane with a landscape photo/)
  assert.match(prompt, /Never reproduce a published paper figure/)
  assert.equal(artSize('1').size, '1024x1024')
  assert.equal(artSize('2:3').size, '1024x1536')
  assert.throws(() => artSize('wide'), /width\/height/)
})

async function withFigure(work) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-art-')))
  try {
    await mkdir(path.join(project, '.aster'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    const made = await cli(project, ['figures', 'new', '--name', 'Method overview'])
    assert.equal(made.code, 0, made.stderr)
    // Why a stub: tests never start the real Codex; this one writes ./art.png like it would.
    const stub = path.join(project, 'codex-stub.mjs')
    await writeFile(path.join(project, 'sheet.png'), sheet())
    await writeFile(
      stub,
      `#!/usr/bin/env node\nimport { copyFileSync, appendFileSync } from 'node:fs'\nlet input = ''\nprocess.stdin.on('data', (c) => (input += c)).on('end', () => {\n  appendFileSync(${JSON.stringify(path.join(project, 'calls.txt'))}, JSON.stringify(process.argv.slice(2)) + '\\n')\n  console.log(JSON.stringify({ type: 'thread.started', thread_id: 't1' }))\n  if (!input.includes('NOTHING')) copyFileSync(${JSON.stringify(path.join(project, 'sheet.png'))}, 'art.png')\n})\n`
    )
    await chmod(stub, 0o755)
    await work(project, { folder: path.join(project, '.aster/figures/art', SLUG), stub })
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

async function cli(project, args, env = {}) {
  try {
    const { stdout, stderr } = await exec(process.execPath, [CLI, ...args, '--project', project], {
      cwd: project,
      env: { ...process.env, CODEX_HOME: path.join(project, 'no-codex-home'), ...env }
    })
    return { code: 0, stdout, stderr }
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr }
  }
}

test('figures art --gen runs Codex on the prompt, prepares the part and stops at the cap', async () => {
  await withFigure(async (project, { folder, stub }) => {
    const art = (...args) =>
      cli(project, ['figures', 'art', '--figure', SLUG, ...args], { ASTER_CODEX_COMMAND: stub })
    const missing = await art('--part', 'sheet', '--gen')
    assert.notEqual(missing.code, 0)
    assert.match(missing.stderr, /Write what to draw first/)
    await mkdir(folder, { recursive: true })
    await writeFile(path.join(folder, 'sheet.prompt.txt'), 'a red square and a blue bar')
    await writeFile(path.join(project, 'photo.png'), sheet())
    const made = await art(
      '--part',
      'sheet',
      '--gen',
      '--aspect',
      '2/1',
      '--split',
      '--ref',
      'photo.png'
    )
    assert.equal(made.code, 0, made.stderr)
    assert.match(made.stdout, /image 1 of 4/)
    assert.match(made.stdout, /sheet-1: .*sheet-1\.png/)
    const calls = (await readFile(path.join(project, 'calls.txt'), 'utf8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    assert.deepEqual(calls[0].slice(0, 3), ['exec', '--enable', 'image_generation'])
    assert.ok(
      calls[0].includes(path.join(project, 'photo.png')),
      'the project picture goes in with -i'
    )
    assert.equal(decodePng(await readFile(path.join(folder, 'sheet-2.png'))).channels, 4)
    const outside = await art('--part', 'sheet', '--gen', '--ref', '/etc/hosts')
    assert.match(outside.stderr, /picture of this project/)
    await writeFile(path.join(folder, 'empty.prompt.txt'), 'NOTHING')
    const none = await art('--part', 'empty', '--gen')
    assert.match(none.stderr, /Codex made no image/)
    for (let n = 2; n <= ART_CAP; n += 1) {
      assert.equal((await art('--part', 'sheet', '--gen')).code, 0)
    }
    const capped = await art('--part', 'sheet', '--gen')
    assert.match(capped.stderr, /used all 4 generated images/)
    const again = await art('--part', 'sheet', '--prep', '--soft')
    assert.equal(again.code, 0, again.stderr)
    const own = await art('--part', 'mine', '--from', path.join(project, 'sheet.png'))
    assert.equal(own.code, 0, own.stderr)
    const state = await art()
    assert.match(state.stdout, /4 of 4 generated images used/)
    assert.match(state.stdout, /mine, sheet/)
  })
})
