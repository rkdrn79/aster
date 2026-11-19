// Plot figures: a Python script per plot (`<figures>/src/<slug>.plot.py`) that draws with
// aster_plot.py and writes a page-true PDF, SVG and PNG with a manifest of what it checked.
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { HarnessError } from './research-harness-error.mjs'
import { projectLayout } from './research-layout.mjs'
import { figurePreviewPaths, figureSlug, isFigureSlug } from './research-figures-model.mjs'
import { ensureWorkFolder, listFigures, sha256 } from './research-figures-folders.mjs'
import { refreshPlotEmbeds } from './research-figures-plot-embed.mjs'
import { ensurePlotLib, plotLibVersion } from './research-figures-plot-lib.mjs'
import { parsePlotManifest, plotFilePaths, plotGitignore } from './research-figures-plot-files.mjs'
import { PLOT_STARTERS_GENRES } from './research-figures-plot-starters-genres.mjs'
import { PLOT_STARTERS_HYPER } from './research-figures-plot-starters-hyper.mjs'
import { PLOT_STARTERS_RESULTS } from './research-figures-plot-starters-results.mjs'
import { createPythonFinder } from './research-python-finder.mjs'

/** `figures plot new --kind`: each kind's starter is a finished demo on toy data. */
export const PLOT_KINDS = {
  ...PLOT_STARTERS_GENRES,
  ...PLOT_STARTERS_RESULTS,
  ...PLOT_STARTERS_HYPER
}
export const PLOT_RUN_TIMEOUT_MS = 10 * 60_000
const PLOT_SIZES = new Set(['single', 'double', 'onehalf'])
const PLOT_VENUES = new Set(['icml', 'cvpr', 'acl', 'neurips', 'arxiv'])

export const findPlotPython = createPythonFinder({ modules: ['numpy', 'matplotlib'] })

export const PLOT_INSTALL_HINT =
  "No Python with numpy and matplotlib was found (tried $ASTER_PLOT_PYTHON, python3, python, and conda envs in ~/.conda, ~/miniconda3, ~/anaconda3, ~/miniforge3). Install them in the Python you use: `python3 -m pip install --user numpy matplotlib`, or `conda install numpy matplotlib` in your env; or point Aster at one with ASTER_PLOT_PYTHON=/path/to/python (on an SSH host, in that host's shell profile)."

/** The size arguments of a starter for `--size` and `--venue`. */
function sizedStarter(text, { size, venue }) {
  const pattern = /size="(?:single|double|onehalf)"(, height=[\d.]+)?/g
  if (!size && !venue) {
    return text
  }
  const custom = size && !PLOT_SIZES.has(size) ? customSize(size) : null
  if (size && !PLOT_SIZES.has(size) && !custom) {
    throw new HarnessError(
      'invalid_argument',
      '--size takes single, onehalf, double, or WIDTHxHEIGHT in inches (3.25x2), or with a unit: in, pt, cm, mm, or u for scene units, 144 per inch, as a diagram cell measures (312x216u, made with panel=True)'
    )
  }
  if (venue && !PLOT_VENUES.has(venue)) {
    throw new HarnessError('invalid_argument', `--venue takes ${[...PLOT_VENUES].join(', ')}`)
  }
  return text.replace(pattern, (whole, height) => {
    const named = custom
      ? `size=(${custom.width}, ${custom.height})${custom.cell ? ', panel=True' : ''}`
      : `size="${size ?? /size="(\w+)"/.exec(whole)[1]}"${height ?? ''}`
    return custom || !venue ? named : `${named}, venue="${venue}"`
  })
}

const UNIT_INCHES = { in: 1, pt: 1 / 72, cm: 1 / 2.54, mm: 1 / 25.4, u: 1 / 144 }

/**
 * `--size WxH[unit]` in inches: unit in (the default), pt, cm, mm, or u (scene units, 144 per
 * inch: a diagram cell, so the plot is made with panel=True).
 */
export function customSize(size) {
  const found = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)\s*(in|pt|cm|mm|u|units)?$/i.exec(size)
  if (!found) {
    return null
  }
  const unit = (found[3] ?? 'in').toLowerCase().replace('units', 'u')
  const inches = (value) => Number((Number(value) * UNIT_INCHES[unit]).toFixed(4))
  return { width: inches(found[1]), height: inches(found[2]), cell: unit === 'u' }
}

function starterText(kind, { name, slug, size, venue, style, accent }) {
  const starter = PLOT_KINDS[kind]
  if (!starter) {
    throw new HarnessError(
      'invalid_argument',
      `Unknown kind ${kind}; kinds: ${Object.keys(PLOT_KINDS).join(', ')}`
    )
  }
  let text = sizedStarter(starter.text, { size, venue })
  if (style || accent) {
    const args = [
      style ? JSON.stringify(style) : 'None',
      ...(accent ? [`accent=${JSON.stringify(accent)}`] : [])
    ]
    text = text.replace(
      'import aster_plot as ap\n',
      `import aster_plot as ap\n\nap.use(${args.join(', ')})\n`
    )
  }
  return text.replace(/^"""/, `"""${name}: node H/cli.mjs figures plot run --figure ${slug}\n\n`)
}

async function exists(file) {
  return readFile(file).then(
    () => true,
    () => false
  )
}

/** Adds `*.plot.json` to a working folder's .gitignore written before plots. */
async function ignoreManifests(project, folder) {
  const file = path.join(project, folder, '.gitignore')
  const next = plotGitignore(await readFile(file, 'utf8').catch(() => null))
  if (next !== null) {
    await writeFile(file, next)
  }
}

/** `figures plot new`: the plot's script from a starter, with aster_plot.py beside it. */
export async function createPlot(
  project,
  { name, slug, kind = 'blank', size, venue, style, accent }
) {
  const chosen = slug ?? figureSlug(name)
  if (!isFigureSlug(chosen)) {
    throw new HarnessError('invalid_argument', `Not a figure slug: ${chosen}`)
  }
  const listing = await listFigures(project)
  if (
    listing.figures.some((figure) => figure.slug === chosen) ||
    listing.plots.some((plot) => plot.slug === chosen)
  ) {
    throw new HarnessError('exists', `A figure or plot named ${chosen} already exists`)
  }
  const folder = await ensureWorkFolder(project)
  await ignoreManifests(project, folder)
  const files = plotFilePaths(folder, chosen)
  const text = starterText(kind, { name: name ?? chosen, slug: chosen, size, venue, style, accent })
  await mkdir(path.join(project, folder, 'src'), { recursive: true })
  try {
    await writeFile(path.join(project, files.script), text, { flag: 'wx' })
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new HarnessError('exists', `${files.script} already exists`)
    }
    throw error
  }
  const lib = await ensurePlotLib(project, folder)
  return { slug: chosen, kind, folder, ...files, lib: lib.path }
}

async function resolvePlot(project, slug) {
  const listing = await listFigures(project)
  const plots = listing.plots.filter((plot) => plot.script)
  if (slug) {
    const plot = plots.find((entry) => entry.slug === slug)
    if (!plot) {
      const diagram = listing.figures.some((figure) => figure.slug === slug)
      throw new HarnessError(
        'not_found',
        diagram
          ? `${slug} is a diagram, not a plot: use figures run / check / preview --figure ${slug}`
          : `No plot ${slug}: no ${plotFilePaths(listing.folder, slug).script}`
      )
    }
    return { ...plot, ...plotFilePaths(plot.folder, plot.slug) }
  }
  if (plots.length !== 1) {
    throw new HarnessError(
      'usage',
      plots.length
        ? `--figure is required: ${plots.map((entry) => entry.slug).join(', ')}`
        : `No plots in ${listing.folder} yet. Start one with figures plot new --name NAME --kind KIND`
    )
  }
  return { ...plots[0], ...plotFilePaths(plots[0].folder, plots[0].slug) }
}

/** The plot's last run, and whether it is behind the script or the helper. */
export async function plotState(project, plot) {
  const [script, manifestText] = await Promise.all([
    readFile(path.join(project, plot.script)),
    readFile(path.join(project, plot.manifest), 'utf8').catch(() => null)
  ])
  const manifest = manifestText === null ? null : parsePlotManifest(manifestText)
  const sourceSha256 = sha256(script)
  const stale =
    !manifest || manifest.sourceSha256 !== sourceSha256 || manifest.lib !== plotLibVersion()
  return { manifest, sourceSha256, stale }
}

function runPython(python, script, { cwd, env, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ exitCode: timedOut ? 124 : (code ?? 1), stdout, stderr, timedOut })
    })
  })
}

/** `figures plot run`: runs the script with a Python that has numpy and matplotlib. */
/**
 * The diagram cell a plot is made for (`<slug>.cell.json`, written by fig.plot): "WxH" in inches,
 * so every run renders it at the size it is shown (with panel=True in the script).
 */
async function plotCell(project, plot) {
  try {
    const cell = JSON.parse(
      await readFile(path.join(project, plot.folder, `${plot.slug}.cell.json`), 'utf8')
    )
    return Number.isFinite(cell.widthIn) && Number.isFinite(cell.heightIn)
      ? `${cell.widthIn}x${cell.heightIn}`
      : null
  } catch {
    return null
  }
}

export async function runPlot(
  project,
  slug,
  { python, timeoutMs = PLOT_RUN_TIMEOUT_MS, find = findPlotPython } = {}
) {
  const plot = await resolvePlot(project, slug)
  const lib = await ensurePlotLib(project, plot.folder)
  await ignoreManifests(project, plot.folder)
  const found = await find(python ?? process.env.ASTER_PLOT_PYTHON ?? null)
  if (!found) {
    throw new HarnessError('no_python', PLOT_INSTALL_HINT)
  }
  const root = projectLayout(project).root
  const cell = await plotCell(project, plot)
  const output = await runPython(found, path.join(project, plot.script), {
    cwd: project,
    timeoutMs,
    env: {
      ...process.env,
      MPLBACKEND: 'Agg',
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONUNBUFFERED: '1',
      ASTER_PLOT_OUT: path.join(project, plot.folder),
      ASTER_PLOT_CACHE: path.join(project, figurePreviewPaths(root, plot.slug).directory),
      ...(cell ? { ASTER_PLOT_CELL: cell } : {})
    }
  })
  const state = await plotState(project, plot)
  const saved = output.exitCode === 0 && !state.stale
  // Why here: a diagram that embeds this plot (fig.plot) takes the new render where it was placed.
  const diagrams = saved
    ? await refreshPlotEmbeds(project, path.join(project, plot.folder), plot.slug).catch(() => [])
    : []
  return {
    figure: plot.slug,
    script: plot.script,
    lib: lib.path,
    python: found,
    ...output,
    saved,
    diagrams,
    manifest: state.manifest,
    problem: output.timedOut
      ? `${plot.script} ran over ${Math.round(timeoutMs / 1000)} s and was stopped`
      : output.exitCode === 0 && state.stale
        ? `${plot.script} finished without saving: end it with p.save() (or ap.save(fig))`
        : null
  }
}

/** Runs the plot when its manifest is behind the script; returns its state after. */
export async function freshPlot(project, slug, options = {}) {
  const plot = await resolvePlot(project, slug)
  let state = await plotState(project, plot)
  let run = null
  if (state.stale) {
    run = await runPlot(project, plot.slug, options)
    if (!run.saved) {
      throw new HarnessError(
        'plot_failed',
        [
          run.problem ?? `${plot.script} exited ${run.exitCode}`,
          run.stderr.trim().split('\n').slice(-12).join('\n')
        ]
          .filter(Boolean)
          .join('\n')
      )
    }
    state = await plotState(project, plot)
  }
  return { plot, state, ran: run !== null }
}

/** `figures plot check`: the checks of the plot's current run, as `figures check` reports them. */
export async function checkPlot(project, slug, options = {}) {
  const slugs = slug
    ? [slug]
    : (await listFigures(project)).plots.filter((plot) => plot.script).map((plot) => plot.slug)
  const figures = []
  for (const each of slugs) {
    const { plot, state, ran } = await freshPlot(project, each, options)
    figures.push({ slug: plot.slug, scene: plot.script, ran, ...state.manifest.findings })
  }
  return { figures }
}

/** `figures plot preview`: the PNG, the print-size PNG and the lint view. */
export async function previewPlot(project, slug, options = {}) {
  const { plot, state, ran } = await freshPlot(project, slug, options)
  const { manifest } = state
  const cache = figurePreviewPaths(projectLayout(project).root, plot.slug)
  const inCache = async (name) => {
    const file = path.join(project, cache.directory, `${plot.slug}.${name}.png`)
    return (await exists(file)) ? file : null
  }
  const findings = manifest.findings
  return {
    figure: plot.slug,
    ran,
    png: path.join(project, plot.png),
    pdf: path.join(project, plot.pdf),
    print: await inCache('print'),
    lint: await inCache('lint'),
    size: manifest.size,
    renderedAt: manifest.renderedAt,
    sourceSha256: state.sourceSha256,
    findings: findings.errors.length + findings.warnings.length
  }
}
