// Plots inside diagrams. A plot figure (`<slug>.plot.json` beside its `<slug>.embed.svg`, written
// by aster_plot.py) or any SVG is read, made safe (no scripts, no outside links, no metadata),
// measured (its size in pt, its smallest text, live text and raster parts) and embedded once
// under its content hash as an `image/svg+xml` file, so the diagram's SVG and PDF keep it vector.
// `refreshPlotEmbeds` swaps in a plot's new render in every diagram that shows it.
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { figureElement } from './research-figures-model.mjs'
import {
  pruneGeneratedFiles,
  sanitizeSvg,
  storeSvgFile,
  svgFileId
} from './research-figures-svg-embed.mjs'

export const PLOT_FILE_PREFIX = 'aster-plot-'
const UNITS_PER_PT = 2
const PT_PER = { pt: 1, px: 0.75, in: 72, cm: 72 / 2.54, mm: 72 / 25.4, pc: 12, '': 0.75 }

/** A length attribute (`158.4pt`, `300`, `2in`) in points, or null. */
function lengthPt(value) {
  const match = /^\s*([\d.]+(?:e[+-]?\d+)?)\s*(pt|px|in|cm|mm|pc)?\s*$/i.exec(String(value ?? ''))
  if (!match) {
    return null
  }
  const pt = Number(match[1]) * PT_PER[(match[2] ?? '').toLowerCase()]
  return Number.isFinite(pt) && pt > 0 ? pt : null
}

/** The shared sanitiser (research-figures-svg-embed.mjs), under its plot name. */
export const sanitizePlotSvg = sanitizeSvg

/**
 * What an SVG holds: its size in pt (width/height, else the viewBox at 1 px = 0.75 pt), the
 * smallest text in pt (matplotlib's outlined glyphs are drawn at `scale(s -s)` with s = size /
 * 100; live `<text>` gives its font-size), how much text is live (fonts not embedded) and how
 * many raster images it carries.
 */
export function plotSvgInfo(svg) {
  const open = /^<svg[^>]*>/.exec(svg)?.[0] ?? ''
  const attribute = (name) => new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`).exec(open)?.[1]
  const box = attribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
  const viewBox =
    box?.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0 ? box : null
  const widthPt = lengthPt(attribute('width')) ?? (viewBox ? viewBox[2] * 0.75 : null)
  const heightPt = lengthPt(attribute('height')) ?? (viewBox ? viewBox[3] * 0.75 : null)
  if (!widthPt || !heightPt) {
    throw new Error('The SVG has no size: give its <svg> a width and height (or a viewBox)')
  }
  // Why the viewBox: font sizes inside are in its units, which print at widthPt / viewBox width.
  const unitPt = viewBox ? widthPt / viewBox[2] : 1
  const sizes = []
  for (const match of svg.matchAll(/scale\(\s*([\d.]+)\s+-\1\s*\)/g)) {
    sizes.push(Number(match[1]) * 100 * unitPt)
  }
  for (const match of svg.matchAll(
    /<text\b[^>]*?(?:font-size\s*[:=]\s*"?\s*([\d.]+)|font:\s*(?:[a-z]+\s+)*([\d.]+)px)/gi
  )) {
    sizes.push(Number(match[1] ?? match[2]) * unitPt)
  }
  const liveText = (svg.match(/<text\b/g) ?? []).length
  const rasters = (svg.match(/<image\b[^>]*href\s*=\s*"data:image\/(?:png|jpeg|gif|webp)/g) ?? [])
    .length
  return {
    widthPt: Math.round(widthPt * 100) / 100,
    heightPt: Math.round(heightPt * 100) / 100,
    minFontPt: sizes.length ? Math.round(Math.min(...sizes) * 100) / 100 : null,
    liveText,
    rasters
  }
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** The file id a plot's SVG is stored under: the same SVG is stored once. */
export const plotFileId = (svg) => svgFileId(PLOT_FILE_PREFIX, svg)

async function readOptional(file) {
  try {
    return await readFile(file, 'utf8')
  } catch {
    return null
  }
}

/**
 * A plot to embed: `figure` (a plot slug in the diagram's figures folder: its manifest's embed
 * SVG, else `<slug>.embed.svg` or `<slug>.svg`) or `svg` (a project path, an absolute path, or
 * SVG markup). Returns the sanitised SVG, its info, where it came from and the manifest.
 */
export async function readPlot(project, folder, { figure, svg }) {
  if (Boolean(figure) === Boolean(svg)) {
    throw new Error('plot needs exactly one of figure (a plot slug) or svg (a path or SVG markup)')
  }
  let text = null
  let source = null
  let manifest = null
  if (figure) {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(figure)) {
      throw new Error(
        `figure must be a plot slug like "loss-curves", not ${JSON.stringify(figure)}`
      )
    }
    const manifestText = await readOptional(path.join(folder, `${figure}.plot.json`))
    if (manifestText) {
      try {
        manifest = JSON.parse(manifestText)
      } catch (error) {
        throw new Error(
          `${figure}.plot.json is not valid JSON (${error.message}); run figures plot run --figure ${figure}`
        )
      }
    }
    const candidates = [
      manifest?.files?.embed,
      manifest?.files?.svg,
      `${figure}.embed.svg`,
      `${figure}.svg`
    ].filter(Boolean)
    for (const name of candidates) {
      text = await readOptional(path.join(folder, name))
      if (text) {
        source = path.relative(project, path.join(folder, name)).split(path.sep).join('/')
        break
      }
    }
    if (!text) {
      throw new Error(
        `No rendered plot ${figure} in ${path.relative(project, folder) || '.'}: run figures plot run --figure ${figure} first (it writes ${figure}.embed.svg and ${figure}.plot.json)`
      )
    }
  } else if (/^\s*(<\?xml|<svg)/i.test(svg)) {
    text = svg
    source = null
  } else {
    const absolute = path.isAbsolute(svg) ? svg : path.join(project, svg)
    text = await readOptional(absolute)
    if (!text) {
      throw new Error(`No SVG at ${svg} (paths are from the project root)`)
    }
    source = path.isAbsolute(svg) ? svg : svg.split(path.sep).join('/')
  }
  const clean = sanitizePlotSvg(text)
  return { svg: clean, info: plotSvgInfo(clean), source, manifest, sha256: sha256(text) }
}

/** The manifest's panels in inches (top-left, y down), kept on the element for plotPoint. */
function manifestPanels(manifest) {
  return (manifest?.panels ?? [])
    .filter(
      (panel) => panel?.box && ['x', 'y', 'w', 'h'].every((key) => Number.isFinite(panel.box[key]))
    )
    .map((panel) => ({
      id: String(panel.id ?? ''),
      label: panel.label ?? null,
      title: panel.title ?? null,
      kind: panel.kind ?? '2d',
      box: panel.box,
      ...(Array.isArray(panel.xlim)
        ? {
            xlim: panel.xlim,
            ylim: panel.ylim,
            xscale: panel.xscale ?? 'linear',
            yscale: panel.yscale ?? 'linear'
          }
        : {})
    }))
}

/** What a plot image remembers about its source, to refresh it and to lint it. */
export function plotRecord(plot, figure) {
  return {
    figure: figure ?? null,
    source: plot.source,
    sha256: plot.sha256,
    widthPt: plot.info.widthPt,
    heightPt: plot.info.heightPt,
    minFontPt: plot.info.minFontPt,
    liveText: plot.info.liveText,
    rasters: plot.info.rasters,
    panels: manifestPanels(plot.manifest),
    ...(plot.manifest?.style ? { style: plot.manifest.style } : {}),
    ...(plot.manifest?.sourceSha256
      ? { sourceSha256: plot.manifest.sourceSha256, script: plot.manifest.script ?? null }
      : {})
  }
}

/** The image element showing a plot at `box` (scene units). */
export function makePlotImage(spec, plot, box) {
  return figureElement('image', {
    id: spec.id,
    x: Math.round(box.x * 100) / 100,
    y: Math.round(box.y * 100) / 100,
    width: Math.round(box.width * 100) / 100,
    height: Math.round(box.height * 100) / 100,
    fileId: plotFileId(plot.svg),
    status: 'saved',
    scale: [1, 1],
    crop: null,
    strokeColor: 'transparent',
    boundElements: [],
    frameId: spec.frame ?? null,
    groupIds: spec.groupIds ?? [],
    customData: { asterPlot: plotRecord(plot, spec.figure) }
  })
}

/** A plot's natural size in scene units (1 pt = 2 units). */
export const naturalSize = (info) => ({
  width: info.widthPt * UNITS_PER_PT,
  height: info.heightPt * UNITS_PER_PT
})

/** Stores the SVG in the scene's files under its id. */
export const storePlotFile = (scene, svg) => storeSvgFile(scene, PLOT_FILE_PREFIX, svg)

async function sceneFiles(folder) {
  try {
    return (await readdir(folder))
      .filter((name) => name.endsWith('.excalidraw'))
      .map((name) => path.join(folder, name))
  } catch {
    return []
  }
}

/**
 * Swaps the plots rendered since into one scene file (only plot `only` when given), keeping each
 * image's place and width (the height follows the new shape); returns the ids it changed.
 */
export async function refreshSceneFile(project, file, only = null) {
  const scene = JSON.parse(await readFile(file, 'utf8'))
  const folder = path.dirname(file)
  const changed = []
  for (const element of scene.elements ?? []) {
    const record = element?.customData?.asterPlot
    if (
      element.isDeleted ||
      element.type !== 'image' ||
      !record?.figure ||
      (only && record.figure !== only)
    ) {
      continue
    }
    const plot = await readPlot(project, folder, { figure: record.figure })
    if (plot.sha256 === record.sha256) {
      continue
    }
    const natural = naturalSize(plot.info)
    element.fileId = storePlotFile(scene, plot.svg)
    element.height = Math.round(((element.width * natural.height) / natural.width) * 100) / 100
    element.customData = { ...element.customData, asterPlot: plotRecord(plot, record.figure) }
    element.version = (element.version ?? 1) + 1
    changed.push(element.id)
  }
  if (changed.length) {
    pruneGeneratedFiles(scene.files, scene.elements)
    await writeFile(file, `${JSON.stringify(scene, null, 2)}\n`)
  }
  return changed
}

/**
 * After plot `slug` is rendered again (the end of `figures plot run`): every diagram in `folder`
 * that shows it takes the new render. Returns the scenes changed, project-relative.
 */
export async function refreshPlotEmbeds(project, folder, slug) {
  const changed = []
  for (const file of await sceneFiles(folder)) {
    const ids = await refreshSceneFile(project, file, slug).catch(() => [])
    if (ids.length) {
      changed.push(path.relative(project, file).split(path.sep).join('/'))
    }
  }
  return changed
}

/**
 * Plots a scene shows that changed since they were embedded (their render's hash differs), or
 * whose script changed since it last ran: findings in the lint's shape.
 */
export async function stalePlotFindings(project, folder, scene) {
  const findings = []
  for (const element of scene.elements ?? []) {
    const record = element?.customData?.asterPlot
    if (element?.isDeleted || element?.type !== 'image' || !record?.figure) {
      continue
    }
    let plot
    try {
      plot = await readPlot(project, folder, { figure: record.figure })
    } catch (error) {
      findings.push({ code: 'plot-missing', id: element.id, message: error.message })
      continue
    }
    if (plot.sha256 !== record.sha256) {
      findings.push({
        code: 'plot-stale',
        id: element.id,
        message: `plot ${record.figure} was rendered again since this diagram embedded it; run figures refresh (or rerun this figure's script) to show the new one`
      })
    }
    const script = plot.manifest?.script
      ? await readOptional(path.join(folder, plot.manifest.script))
      : null
    if (script && plot.manifest.sourceSha256 && sha256(script) !== plot.manifest.sourceSha256) {
      findings.push({
        code: 'plot-script-changed',
        id: element.id,
        message: `${plot.manifest.script} changed since ${record.figure} was rendered; run figures plot run --figure ${record.figure}, then figures refresh`
      })
    }
  }
  return findings
}
