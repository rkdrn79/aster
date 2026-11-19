import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import { HarnessError } from './research-harness-error.mjs'
import { openFigure } from './research-figures-kit.mjs'
import { PLOT_LIB_MARK } from './research-figures-plot-lib.mjs'
import {
  PLOT_INSTALL_HINT,
  PLOT_KINDS,
  createPlot,
  findPlotPython,
  plotState,
  runPlot
} from './research-figures-plot.mjs'
import { plotFilePaths } from './research-figures-plot-files.mjs'

const exec = promisify(execFile)
const CLI = path.join(import.meta.dirname, 'cli.mjs')
const python = await findPlotPython()
const needsPython = python ? false : 'no Python with numpy and matplotlib'

async function withProject(run) {
  const project = await mkdtemp(path.join(os.tmpdir(), 'aster-plot-'))
  try {
    await run(project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

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

const script = (project, slug) => path.join(project, `.aster/figures/src/${slug}.plot.py`)

test('every kind has a starter that saves a page-true figure', () => {
  assert.deepEqual(Object.keys(PLOT_KINDS).length >= 16, true)
  for (const [kind, starter] of Object.entries(PLOT_KINDS)) {
    assert.match(starter.text, /^"""/, kind)
    assert.match(starter.text, /import aster_plot as ap/, kind)
    assert.match(starter.text, /\.save\(\)/, kind)
    assert.match(starter.text, /size="(single|double)"/, kind)
    assert.ok(starter.label.length > 10, kind)
  }
})

test('figures plot new writes the starter with its size, venue and style', async () => {
  await withProject(async (project) => {
    const made = await createPlot(project, { name: 'Flow paths', kind: 'trajectories' })
    assert.equal(made.slug, 'flow-paths')
    assert.equal(made.script, '.aster/figures/src/flow-paths.plot.py')
    const text = await readFile(script(project, 'flow-paths'), 'utf8')
    assert.ok(text.startsWith('"""Flow paths: node H/cli.mjs figures plot run --figure flow-paths'))
    assert.match(text, /size="double", height=2\.15/)
    const lib = await readFile(path.join(project, made.lib), 'utf8')
    assert.ok(lib.startsWith(PLOT_LIB_MARK))
    assert.match(
      await readFile(path.join(project, '.aster/figures/.gitignore'), 'utf8'),
      /\*\.plot\.json/
    )

    await createPlot(project, { name: 'Bars', kind: 'bars', size: 'double', venue: 'cvpr' })
    assert.match(
      await readFile(script(project, 'bars'), 'utf8'),
      /size="double", height=1\.9, venue="cvpr"/
    )
    await createPlot(project, {
      name: 'Wide',
      kind: 'curves',
      size: '4.5x2.2',
      style: 'slate',
      accent: 'teal'
    })
    const wide = await readFile(script(project, 'wide'), 'utf8')
    assert.match(wide, /ap\.figure\(size=\(4\.5, 2\.2\)\)/)
    assert.match(wide, /ap\.use\("slate", accent="teal"\)/)
    await createPlot(project, { name: 'Mine', slug: 'mine', accent: '#cc3366' })
    assert.match(
      await readFile(script(project, 'mine'), 'utf8'),
      /ap\.use\(None, accent="#cc3366"\)/
    )

    await assert.rejects(createPlot(project, { name: 'Flow paths' }), /already exists/)
    await assert.rejects(createPlot(project, { name: 'x', kind: 'nope' }), /Unknown kind nope/)
    await assert.rejects(createPlot(project, { name: 'y', size: 'huge' }), /--size takes/)
    await assert.rejects(createPlot(project, { name: 'z', venue: 'nips' }), /--venue takes/)
    await assert.rejects(createPlot(project, { name: 'w', slug: 'Bad Slug' }), /Not a figure slug/)
  })
})

test('an older .gitignore gains the manifest line once', async () => {
  await withProject(async (project) => {
    await mkdir(path.join(project, '.aster/figures'), { recursive: true })
    await writeFile(path.join(project, '.aster/figures/.gitignore'), '*.pdf\n*.svg\n*.png\n')
    await createPlot(project, { name: 'a' })
    await createPlot(project, { name: 'b' })
    assert.equal(
      await readFile(path.join(project, '.aster/figures/.gitignore'), 'utf8'),
      '*.pdf\n*.svg\n*.png\n*.plot.json\n'
    )
  })
})

test('without a Python that has matplotlib, run says how to get one', async () => {
  await withProject(async (project) => {
    await createPlot(project, { name: 'a' })
    await assert.rejects(runPlot(project, 'a', { find: async () => null }), (error) => {
      assert.ok(error instanceof HarnessError)
      assert.equal(error.message, PLOT_INSTALL_HINT)
      assert.match(error.message, /pip install --user numpy matplotlib/)
      assert.match(error.message, /ASTER_PLOT_PYTHON/)
      return true
    })
  })
})

test(
  'figures plot new, run, check, preview, list and publish',
  { skip: needsPython, timeout: 240_000 },
  async () => {
    await withProject(async (project) => {
      let out = await cli(project, ['figures', 'plot', 'new', '--name', 'Loss', '--kind', 'curves'])
      assert.equal(out.code, 0, out.stderr)
      assert.match(
        out.stdout,
        /Created \.aster\/figures\/src\/loss\.plot\.py from the curves starter/
      )

      out = await cli(project, ['figures', 'list'])
      assert.match(
        out.stdout,
        /loss {2}\.aster\/figures\/src\/loss\.plot\.py \(plot; not run yet: figures plot run\)/
      )

      out = await cli(project, ['figures', 'plot', 'run', '--figure', 'loss'])
      assert.equal(out.code, 0, out.stderr)
      assert.match(out.stdout, /exited 0/)
      assert.match(out.stdout, /saved .*loss\.pdf \(3\.25 x 1\.90 in\): 0 errors/)
      const files = plotFilePaths('.aster/figures', 'loss')
      for (const key of ['pdf', 'svg', 'embed', 'png', 'manifest']) {
        await readFile(path.join(project, files[key]))
      }
      const manifest = JSON.parse(await readFile(path.join(project, files.manifest), 'utf8'))
      assert.equal(manifest.script, 'src/loss.plot.py')
      assert.equal((await plotState(project, files)).stale, false)

      out = await cli(project, ['figures', 'plot', 'check'])
      assert.equal(out.code, 0)
      assert.match(out.stdout, /loss\.plot\.py: (ok|0 errors)/)

      out = await cli(project, ['figures', 'plot', 'preview', '--figure', 'loss'])
      assert.match(out.stdout, /loss\.png\n\(3\.25 × 1\.9 in/)
      assert.match(out.stdout, /cache\/figures\/loss\.print\.png/)
      assert.doesNotMatch(out.stdout, /\.cvd\.png/)

      out = await cli(project, ['figures', 'check', '--figure', 'loss'])
      assert.equal(out.code, 1)
      assert.match(
        out.stderr,
        /loss is a plot: use figures plot run \/ check \/ preview --figure loss/
      )
      out = await cli(project, ['figures', 'new', '--name', 'loss'])
      assert.match(out.stderr, /A plot named loss already exists/)

      out = await cli(project, ['figures', 'publish', '--figure', 'loss'])
      assert.equal(out.code, 0, out.stderr)
      assert.match(out.stdout, /Copied \.aster\/figures\/loss\.pdf to paper\/figures\/loss\.pdf/)
      const record = JSON.parse(
        await readFile(path.join(project, '.aster/figures/published/loss.json'), 'utf8')
      )
      assert.equal(record.sceneSha256, manifest.sourceSha256)
      assert.match(
        (await cli(project, ['figures', 'list'])).stdout,
        /in the paper as paper\/figures\/loss\.pdf, up to date/
      )

      // An edited script reruns before a check, and the paper copy reads as outdated.
      const text = await readFile(script(project, 'loss'), 'utf8')
      await writeFile(
        script(project, 'loss'),
        text.replace(
          'ax.set_ylim(0.1, 1.05)',
          'ax.set_ylim(0.1, 1.05)\nax.set_xlabel("x", fontsize=4)'
        )
      )
      assert.match((await cli(project, ['figures', 'list'])).stdout, /paper copy outdated/)
      out = await cli(project, ['figures', 'plot', 'check', '--figure', 'loss'])
      assert.equal(out.code, 1)
      assert.match(out.stdout, /1 errors.*\(ran it first\)\n {2}ERROR tiny-text a: 'x' is 4\.0 pt/)
      out = await cli(project, ['figures', 'plot', 'preview', '--figure', 'loss'])
      assert.match(out.stdout, /loss\.lint\.png\n\(\d+ findings boxed in red/)
    })
  }
)

test(
  'a script that fails or never saves is reported, and kit, style and usage answer',
  { skip: needsPython, timeout: 120_000 },
  async () => {
    await withProject(async (project) => {
      await createPlot(project, { name: 'broken' })
      await writeFile(
        script(project, 'broken'),
        'import aster_plot as ap\nraise SystemExit("boom")\n'
      )
      let out = await cli(project, ['figures', 'plot', 'run', '--figure', 'broken'])
      assert.equal(out.code, 1)
      assert.match(out.stdout, /exited 1/)
      assert.match(out.stdout, /boom/)
      out = await cli(project, ['figures', 'plot', 'check', '--figure', 'broken'])
      assert.equal(out.code, 1)
      assert.match(out.stderr, /broken\.plot\.py exited 1/)

      await writeFile(script(project, 'broken'), 'import aster_plot as ap\np, ax = ap.figure()\n')
      out = await cli(project, ['figures', 'plot', 'run', '--figure', 'broken'])
      assert.equal(out.code, 1)
      assert.match(out.stdout, /PROBLEM .*finished without saving: end it with p\.save\(\)/)

      out = await cli(project, ['figures', 'plot', 'run'])
      assert.match(out.stdout, /broken\.plot\.py exited 0/)
      out = await cli(project, ['figures', 'plot', 'run', '--figure', 'nope'])
      assert.match(out.stderr, /No plot nope/)

      out = await cli(project, ['figures', 'plot', 'kit'])
      assert.match(out.stdout, /panels\(layout='a'/)
      assert.match(out.stdout, /ap\.toy\.flow\(/)
      assert.match(out.stdout, /Kinds \(figures plot new --kind\):\n {2}trajectories/)
      const data = await cli(project, ['figures', 'kit', 'data'])
      assert.match(data.stdout, /ap\.toy\.flow\(/)
      assert.match((await cli(project, ['figures', 'kit'])).stdout, /\ndata: Python data figures/)
      out = await cli(project, ['figures', 'plot', 'style', '--style', 'slate', '--accent', 'teal'])
      assert.match(out.stdout, /^slate, accent teal \(ap\.use\("slate", accent="teal"\)\)/)
      out = await cli(project, ['figures', 'plot', 'style', '--json'])
      assert.equal(JSON.parse(out.stdout).data.defaultPreset, 'graphite')
      out = await cli(project, ['figures', 'plot', 'style', '--accent', 'nope'])
      assert.match(out.stderr, /Unknown accent nope/)
      out = await cli(project, ['figures', 'plot', 'style', '--style', 'nope'])
      assert.match(out.stderr, /Unknown style nope/)
      out = await cli(project, ['figures', 'plot', 'fly'])
      assert.match(out.stderr, /figures plot takes new, run, check, preview, style, kit, not fly/)
      out = await cli(project, ['figures', 'plot', 'new'])
      assert.match(out.stderr, /needs --name/)
      out = await cli(project, ['figures', '--help'])
      assert.match(out.stdout, /figures plot new --name NAME/)
    })
  }
)

test(
  'a rerun plot reaches every diagram that embeds it',
  { skip: needsPython, timeout: 180_000 },
  async () => {
    await withProject(async (project) => {
      await createPlot(project, { name: 'cell', kind: 'blank', size: '2.2x1.5' })
      let out = await cli(project, ['figures', 'plot', 'run', '--figure', 'cell'])
      assert.equal(out.code, 0, out.stderr)
      assert.doesNotMatch(out.stdout, /Updated the plot in/)
      out = await cli(project, ['figures', 'new', '--name', 'teaser', '--size', 'double'])
      assert.equal(out.code, 0, out.stderr)
      const scene = path.join(project, '.aster/figures/teaser.excalidraw')
      const fig = await openFigure(scene)
      await fig.plot({ id: 'p', figure: 'cell', x: 20, y: 20 })
      await fig.save()
      const before = JSON.parse(await readFile(scene, 'utf8'))
      const text = await readFile(script(project, 'cell'), 'utf8')
      await writeFile(script(project, 'cell'), text.replace('x ** 0.5', 'x ** 0.3'))
      out = await cli(project, ['figures', 'plot', 'run', '--figure', 'cell'])
      assert.equal(out.code, 0, out.stderr)
      assert.match(out.stdout, /Updated the plot in \.aster\/figures\/teaser\.excalidraw/)
      const after = JSON.parse(await readFile(scene, 'utf8'))
      const image = (value) => value.elements.find((element) => element.id === 'p')
      assert.notEqual(image(after).fileId, image(before).fileId)
      assert.equal(image(after).x, image(before).x)
    })
  }
)
