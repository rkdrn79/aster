// aster_plot.py: the self-contained helper a plot script imports, written beside it in
// `<figures>/src/` (as the kit's shim is for diagrams). It needs only numpy and matplotlib, and
// carries the diagram style as JSON, so a plot reruns the same on any computer.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { plotStyleData } from './research-figures-plot-style.mjs'
import { PLOT_PY_CHECK } from './research-figures-plot-py-check.mjs'
import { PLOT_PY_COMPACT } from './research-figures-plot-py-compact.mjs'
import { PLOT_PY_CORE } from './research-figures-plot-py-core.mjs'
import { PLOT_PY_DISTS } from './research-figures-plot-py-dists.mjs'
import { PLOT_PY_HIDDEN } from './research-figures-plot-py-hidden.mjs'
import { PLOT_PY_HYPER } from './research-figures-plot-py-hyper.mjs'
import { PLOT_PY_LAYOUT } from './research-figures-plot-py-layout.mjs'
import { PLOT_PY_LEGEND } from './research-figures-plot-py-legend.mjs'
import { PLOT_PY_OUTPUT } from './research-figures-plot-py-output.mjs'
import { PLOT_PY_PATHS } from './research-figures-plot-py-paths.mjs'
import { PLOT_PY_RESULTS } from './research-figures-plot-py-results.mjs'
import { PLOT_PY_STATS } from './research-figures-plot-py-stats.mjs'
import { PLOT_PY_SPACE } from './research-figures-plot-py-space.mjs'
import { PLOT_PY_VIEW3D } from './research-figures-plot-py-view3d.mjs'
import { PLOT_PY_TOY } from './research-figures-plot-py-toy.mjs'
import { PLOT_PY_TOY_OPT } from './research-figures-plot-py-toy-opt.mjs'

export const PLOT_LIB_FILE = 'aster_plot.py'
export const PLOT_LIB_MARK =
  '# Written by Aster (figures plot new, figures plot run); rewritten when Aster changes it.'
const STYLE_SLOT = '__ASTER_STYLE_JSON__'
const PARTS = [
  PLOT_PY_CORE,
  PLOT_PY_LAYOUT,
  PLOT_PY_LEGEND,
  PLOT_PY_OUTPUT,
  PLOT_PY_COMPACT,
  PLOT_PY_CHECK,
  PLOT_PY_HIDDEN,
  PLOT_PY_TOY,
  PLOT_PY_TOY_OPT,
  PLOT_PY_PATHS,
  PLOT_PY_DISTS,
  PLOT_PY_SPACE,
  PLOT_PY_VIEW3D,
  PLOT_PY_RESULTS,
  PLOT_PY_STATS,
  PLOT_PY_HYPER
]

/** A short hash of the helper's code and style: what each manifest reports as `lib`. */
export function plotLibVersion() {
  return createHash('sha256')
    .update(PARTS.join('\n'))
    .update(JSON.stringify(plotStyleData()))
    .digest('hex')
    .slice(0, 12)
}

/** The whole aster_plot.py, the style JSON in its slot. */
export function asterPlotSource() {
  const data = { ...plotStyleData(), lib: plotLibVersion() }
  const json = JSON.stringify(data).replaceAll('"""', '\\u0022\\u0022\\u0022')
  const body = PARTS.join('\n')
  return `${PLOT_LIB_MARK}\n${body.replace(STYLE_SLOT, () => json)}\n`
}

/**
 * Writes `<folder>/src/aster_plot.py` (project-relative `folder`) when it is missing or an older
 * one of Aster's; a helper the person replaced with their own stays.
 */
export async function ensurePlotLib(project, folder) {
  const relative = `${folder}/src/${PLOT_LIB_FILE}`
  const file = path.join(project, relative)
  const text = asterPlotSource()
  const current = await readFile(file, 'utf8').catch(() => null)
  if (current === null || (current !== text && current.startsWith(PLOT_LIB_MARK))) {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, text)
    return { path: relative, written: true }
  }
  return { path: relative, written: false }
}
