// Round 14: every worked example (`figures kit examples`) runs through `figures run` on the page
// it names and saves with no lint errors or warnings, and the page lists and prints them.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { KIT_EXAMPLES, examplesText } from './research-figures-kit-examples.mjs'
import { FIGURE_MODE_RULES, FIGURE_STYLE_RULES } from './research-figures-style-rules.mjs'

const exec = promisify(execFile)
const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url))

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

test('the examples page lists every example and prints whole scripts', () => {
  assert.ok(KIT_EXAMPLES.length >= 1)
  const index = examplesText(null)
  for (const example of KIT_EXAMPLES) {
    assert.match(index, new RegExp(`^${example.name} `, 'm'))
    assert.ok(example.render.length > 40, `${example.name} describes its render`)
    assert.match(example.page, /^\d+(\.\d+)?x\d+(\.\d+)?$/)
    assert.ok(!example.script.includes('${'), `${example.name} has no template literal`)
    assert.match(
      example.script,
      new RegExp(`new URL\\('\\.\\./${example.name}\\.excalidraw', import\\.meta\\.url\\)`)
    )
    assert.ok(example.script.trim().split('\n').length <= 45, `${example.name} stays short`)
  }
  const one = examplesText(KIT_EXAMPLES[0].name)
  assert.match(one, /import \{ openFigure \} from '\.\/aster-figures-kit\.mjs'/)
  assert.throws(() => examplesText('no-such-example'), /No example "no-such-example"; examples: /)
})

test('every example runs clean on its page', { timeout: 300_000 }, async () => {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r14x-')))
  try {
    await mkdir(path.join(project, '.aster'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    for (const example of KIT_EXAMPLES) {
      const made = await cli(project, [
        'figures',
        'new',
        '--name',
        example.name,
        '--size',
        example.page,
        '--json'
      ])
      assert.equal(made.code, 0, made.stderr)
      assert.equal(JSON.parse(made.stdout).slug, example.name)
      const script = path.join(project, `.aster/figures/src/${example.name}.figure.mjs`)
      await writeFile(script, example.script)
      const ran = await cli(project, ['figures', 'run', '--figure', example.name])
      assert.equal(ran.code, 0, `${example.name}: ${ran.stdout}\n${ran.stderr}`)
      const report = JSON.parse(ran.stdout.slice(ran.stdout.indexOf('{"errors"')).split('\n')[0])
      // Why whitespace may stay: how blank a page reads depends on the content an agent adds.
      const whitespace = new Set(['empty-space', 'empty-region'])
      assert.deepEqual(
        [...report.errors, ...report.warnings]
          .filter((entry) => !whitespace.has(entry.code))
          .map((entry) => `${entry.code} ${entry.id ?? ''}`),
        [],
        `${example.name} saves clean`
      )
      assert.doesNotMatch(
        ran.stdout + ran.stderr,
        /kit warning|warning:/i,
        `${example.name}: no kit warnings`
      )
    }
  } finally {
    await rm(project, { recursive: true, force: true })
  }
})

test('the Figures guide carries the shared style rules word for word', async () => {
  const flat = (text) => text.replace(/\*\*/g, '').replace(/\s+/g, ' ')
  const guide = flat(await readFile(new URL('./track/SKILL.md', import.meta.url), 'utf8'))
  for (const rule of [...FIGURE_STYLE_RULES, ...FIGURE_MODE_RULES]) {
    assert.ok(guide.includes(flat(rule)), `the guide holds: ${rule.slice(0, 60)}…`)
  }
})
