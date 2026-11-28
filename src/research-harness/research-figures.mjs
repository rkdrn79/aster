import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { HarnessError } from './research-harness-error.mjs'
import { elementBounds } from './research-figures-geometry.mjs'
import { imageSize } from './research-figures-image.mjs'
import {
  PREVIEW_WAIT_SECONDS,
  previewFigure as previewFigureFile
} from './research-figures-preview.mjs'
import { personEditStatus } from './research-figures-person-files.mjs'
import { manuscriptHeadings, readText } from './research-figures-manuscript.mjs'
import { lintFigureScene } from './research-figures-lint.mjs'
import { critiqueScene } from './research-figures-design-report.mjs'
import { stalePlotFindings } from './research-figures-plot-embed.mjs'
import { FIGURE_STYLES } from './research-figures-style.mjs'
import { PRESET_ALIASES } from './research-figures-palette.mjs'
import { readLibraryFolder, userLibraryDirectory } from './research-figures-library.mjs'
import {
  catalogManuscript,
  ensureWorkFolder,
  figureLibraryFolders,
  figuresFolder,
  folderEntries,
  listFigures,
  workFiguresFolder
} from './research-figures-folders.mjs'
import {
  KIT_SHIM,
  KIT_SHIM_IMPORT,
  ensureKitShim,
  runFigureScript
} from './research-figures-shim.mjs'
import {
  FIGURE_SIZES,
  checkFigureScene,
  elementLabel,
  figureAreas,
  figureFilePaths,
  figurePage,
  figureSlug,
  isFigureSlug,
  newFigureScene,
  referenceRegionsPath
} from './research-figures-model.mjs'

export { figuresFolder, listFigures }

/** `single`, `double`, or `<width>x<height>` in inches. */
export function parseFigureSize(value) {
  if (!value || value === 'single' || value === 'double') {
    return FIGURE_SIZES[value ?? 'single']
  }
  const match = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i.exec(value)
  const widthIn = match ? Number(match[1]) : Number.NaN
  const heightIn = match ? Number(match[2]) : Number.NaN
  if (!(widthIn >= 0.5 && widthIn <= 20 && heightIn >= 0.5 && heightIn <= 20)) {
    throw new HarnessError(
      'invalid_argument',
      '--size takes single, double, or WIDTHxHEIGHT in inches (0.5 to 20), e.g. 3.25x2'
    )
  }
  return { widthIn, heightIn }
}

export async function createFigure(project, { name, slug, size, style }) {
  const chosen = slug ?? figureSlug(name)
  if (!isFigureSlug(chosen)) {
    throw new HarnessError('invalid_argument', `Not a figure slug: ${chosen}`)
  }
  if (style !== undefined && !Object.hasOwn(FIGURE_STYLES, PRESET_ALIASES[style] ?? style)) {
    throw new HarnessError(
      'invalid_argument',
      `Unknown style ${style}; styles: ${Object.keys(FIGURE_STYLES).join(', ')}`
    )
  }
  const folder = workFiguresFolder(project)
  const files = figureFilePaths(folder, chosen)
  if ((await listFigures(project)).plots.some((plot) => plot.slug === chosen)) {
    throw new HarnessError('exists', `A plot named ${chosen} already exists`)
  }
  // Why both folders: an older figure beside the manuscript has this name too.
  const paper = figureFilePaths(await figuresFolder(project), chosen).scene
  if (
    await readFile(path.join(project, paper)).then(
      () => true,
      () => false
    )
  ) {
    throw new HarnessError('exists', `${paper} already exists`)
  }
  const page = parseFigureSize(size)
  await ensureWorkFolder(project)
  const preset = style ? (PRESET_ALIASES[style] ?? style) : null
  const scene = newFigureScene(page, Math.random, preset)
  if (preset) {
    // Why: the agent runs `figures new`, so a style given here is the agent's pick, not the person's.
    scene.elements[0].customData.asterPage.agentStyle = preset
  }
  // Why: the agent runs `figures new`, so it chose this size and may change it.
  scene.elements[0].customData.asterPage.agentSize = {
    widthIn: page.widthIn,
    heightIn: page.heightIn
  }
  try {
    await writeFile(path.join(project, files.scene), `${JSON.stringify(scene, null, 2)}\n`, {
      flag: 'wx'
    })
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new HarnessError('exists', `${files.scene} already exists`)
    }
    throw error
  }
  const shim = await ensureKitShim(project, folder)
  return { slug: chosen, folder, page, ...files, shim: shim.path, import: KIT_SHIM_IMPORT }
}

/**
 * Runs a figure's script (`<figures>/src/<slug>.figure.mjs`) with this harness's kit: writes the
 * portable shim it imports when missing, and points the shim here.
 */
export async function runFigure(project, slug) {
  const figure = await resolveFigure(project, slug)
  const exists = await readFile(path.join(project, figure.script)).then(
    () => true,
    () => false
  )
  if (!exists) {
    throw new HarnessError(
      'not_found',
      `No script ${figure.script}; write it there, starting with ${KIT_SHIM_IMPORT}`
    )
  }
  const shim = await ensureKitShim(project, path.posix.dirname(path.posix.dirname(figure.script)))
  const output = await runFigureScript(project, figure.script, { harness: import.meta.dirname })
  return { figure: figure.slug, script: figure.script, shim: shim.path, ...output }
}

async function resolveFigure(project, slug) {
  const { folder, figures, plots } = await listFigures(project)
  if (slug) {
    const figure = figures.find((entry) => entry.slug === slug)
    if (!figure) {
      throw new HarnessError(
        'not_found',
        plots.some((plot) => plot.slug === slug)
          ? `${slug} is a plot: use figures plot run / check / preview --figure ${slug}`
          : `No figure ${slug} in ${folder}`
      )
    }
    return figure
  }
  if (figures.length !== 1) {
    throw new HarnessError(
      'usage',
      figures.length
        ? `--figure is required: ${figures.map((entry) => entry.slug).join(', ')}`
        : `No figures in ${folder} yet. Create one with figures new --name NAME`
    )
  }
  return figures[0]
}

async function readScene(project, figure) {
  const text = await readFile(path.join(project, figure.scene), 'utf8')
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new HarnessError('invalid_json', `${figure.scene}: ${error.message}`)
  }
}

function imagePixels(dataURL) {
  const match = /^data:([^;,]+);base64,(.*)$/.exec(String(dataURL ?? ''))
  return match ? imageSize(Buffer.from(match[2], 'base64')) : null
}

const round = (value) => Math.round(value * 10) / 10

export async function showFigure(project, slug) {
  const figure = await resolveFigure(project, slug)
  const scene = await readScene(project, figure)
  const elements = Array.isArray(scene.elements) ? scene.elements : []
  const live = elements.filter((element) => element && !element.isDeleted)
  const { script } = figure
  const exists = (relative) =>
    readFile(path.join(project, relative)).then(
      () => true,
      () => false
    )
  const shim = `${path.posix.dirname(script)}/${KIT_SHIM}`
  return {
    figure,
    script: { path: script, exists: await exists(script) },
    shim: { path: shim, exists: await exists(shim), import: KIT_SHIM_IMPORT },
    page: figurePage(elements),
    areas: figureAreas(elements),
    elements: live.map((element) => {
      const bounds = elementBounds(element)
      return {
        id: element.id,
        type: element.type,
        x: round(bounds.x),
        y: round(bounds.y),
        width: round(bounds.width),
        height: round(bounds.height),
        label: elementLabel(element, live).replace(/\s+/g, ' ').trim().slice(0, 60),
        frameId: element.frameId ?? null
      }
    }),
    images: live
      .filter((element) => element.type === 'image')
      .map((element) => {
        // Why: a cropped photo shows crop.width source pixels across its width, not the image's.
        const crop = element.crop ?? null
        const pixels = crop
          ? { width: crop.width, height: crop.height }
          : imagePixels(scene.files?.[element.fileId]?.dataURL)
        return {
          id: element.id,
          fileId: element.fileId,
          pixels,
          crop,
          unitsPerPixel: pixels ? round((element.width / pixels.width) * 1000) / 1000 : null
        }
      }),
    issues: checkFigureScene(scene),
    personEdits: (await personEditStatus(project, figure, scene))?.lines ?? []
  }
}

const HAND_PLACED = 'the person set this by hand, so it stays unless they ask'
const PLACEMENT = new Set(['x', 'y', 'width', 'height', 'angle', 'path', 'text', 'added'])
const PAIRED = /align|overlap|gap|spacing|crowd|touch|close/

/**
 * Findings about what the person placed by hand become notes: the agent cannot fix them (Aster
 * keeps the person's edit), and an ERROR it cannot clear would send it round in circles.
 */
function handPlacedFindings(report, edited) {
  const placed = Object.keys(edited).filter((id) => edited[id].some((prop) => PLACEMENT.has(prop)))
  if (!placed.length) {
    return report
  }
  const escape = (id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const mentioned = new RegExp(`(^|[^\\w-])(${placed.map(escape).join('|')})([^\\w-]|$)`)
  const mentions = (finding) =>
    placed.includes(finding.id) || (PAIRED.test(finding.code) && mentioned.test(finding.message))
  const moved = [...report.errors, ...report.warnings].filter(mentions)
  return {
    ...report,
    errors: report.errors.filter((finding) => !mentions(finding)),
    warnings: report.warnings.filter((finding) => !mentions(finding)),
    notes: [
      ...(report.notes ?? []),
      ...moved.map((finding) => ({ ...finding, message: `${finding.message} (${HAND_PLACED})` }))
    ]
  }
}

/** The person's hand edits as check notes: never failures, always what to build on. */
function personEditNotes(status) {
  if (!status) {
    return []
  }
  const note = (code, message) => ({ code, id: null, message })
  return [
    ...status.kept.map((line) => note('person-edit', `kept over the script: ${line}`)),
    ...status.overrode.map((line) => note('person-edit-overrode', line)),
    ...status.gone.map((line) =>
      note('person-edit-gone', `the element is gone, so this no longer applies: ${line}`)
    )
  ]
}

export async function checkFigures(project, slug, area) {
  const { figures } = await listFigures(project)
  const chosen = slug || area ? [await resolveFigure(project, slug)] : figures
  const results = []
  for (const figure of chosen) {
    let report
    try {
      const scene = await readScene(project, figure)
      report = lintFigureScene(scene, { area })
      // Why here: a plot rendered again since the diagram embedded it is only seen on disk.
      report.warnings.push(
        ...(await stalePlotFindings(project, path.dirname(path.join(project, figure.scene)), scene))
      )
      const edits = await personEditStatus(project, figure, scene)
      report = handPlacedFindings(report, edits?.edited ?? {})
      report.notes = [...(report.notes ?? []), ...personEditNotes(edits)]
    } catch (error) {
      report = {
        errors: [{ code: 'invalid', id: null, message: error.message }],
        warnings: [],
        notes: []
      }
    }
    results.push({ slug: figure.slug, scene: figure.scene, ...report })
  }
  return { figures: results }
}

/**
 * The design pass (`figures critique`): for each figure, the computed design report (focus,
 * colours and their meanings, repeats, size and spacing, box styles, text sizes) and the cuts.
 */
export async function critiqueFigures(project, slug) {
  const { figures } = await listFigures(project)
  const chosen = slug ? [await resolveFigure(project, slug)] : figures
  const results = []
  for (const figure of chosen) {
    const scene = await readScene(project, figure)
    results.push({ slug: figure.slug, scene: figure.scene, ...critiqueScene(scene) })
  }
  return { figures: results }
}

async function readSidecar(target) {
  try {
    return JSON.parse(await readFile(target, 'utf8'))
  } catch {
    return null
  }
}

export { PREVIEW_WAIT_SECONDS }

/** Waits until Aster has rendered the current scene, then returns the PNG preview's path. */
export async function previewFigure(project, slug, options = {}) {
  return previewFigureFile(project, await resolveFigure(project, slug), options)
}

/** The reference's path and scale, and the colour regions Aster measured, in scene units. */
export async function referenceFigure(project, slug) {
  const figure = await resolveFigure(project, slug)
  const page = figurePage((await readScene(project, figure)).elements ?? [])
  if (!page?.reference) {
    throw new HarnessError(
      'no_reference',
      `${figure.scene} recreates no reference image; Recreate from image in Aster sets one.`
    )
  }
  const size = imageSize(await readFile(path.join(project, page.reference)))
  if (!size) {
    throw new HarnessError('invalid_reference', `${page.reference} is not a PNG or JPEG.`)
  }
  const scale = page.width / size.width
  const saved = await readSidecar(path.join(project, referenceRegionsPath(page.reference)))
  const units = (value) => round(value * scale)
  return {
    figure: figure.slug,
    reference: path.join(project, page.reference),
    widthPx: size.width,
    heightPx: size.height,
    unitsPerPixel: Math.round(scale * 10000) / 10000,
    page: { x: page.x, y: page.y },
    regions: Array.isArray(saved?.regions)
      ? saved.regions.map((region) => ({
          color: region.color,
          x: round(page.x + region.x * scale),
          y: round(page.y + region.y * scale),
          width: units(region.width),
          height: units(region.height),
          fill: region.fill
        }))
      : null
  }
}

/** Saved parts for `figures kit library`: the project's, then the person's on this computer. */
export async function libraryListText(project) {
  const folders = await figureLibraryFolders(
    project,
    path.join(project, workFiguresFolder(project))
  )
  const parts = [
    ...(await Promise.all(folders.map((entry) => readLibraryFolder(entry, 'project')))).flat(),
    ...(await readLibraryFolder(userLibraryDirectory(), 'user'))
  ]
  return [
    "fig.part(name, { id, x, y }) places a saved part with fresh ids; fig.savePart(name, ids, { scope: 'project' | 'user' }) saves one.",
    `project parts: ${path.relative(project, folders[0])}/; your parts: ${userLibraryDirectory()}`,
    '',
    ...(parts.length
      ? parts.map(
          (part) =>
            `  ${part.name.padEnd(24)} ${part.scope.padEnd(8)} ${part.elements.length} elements`
        )
      : ['  (none saved yet)'])
  ].join('\n')
}

/** A template's parts, read by drawing it once on a scratch page: `figures kit <template>`. */
export async function templatePartsText(name) {
  const { openFigure } = await import('./research-figures-kit.mjs')
  const folder = await mkdtemp(path.join(os.tmpdir(), 'aster-template-'))
  try {
    const file = path.join(folder, 'parts.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene({ widthIn: 6.75, heightIn: 6 })))
    const fig = await openFigure(file)
    const drawn = fig.template(name, { id: 't', x: 20, y: 20 })
    const all = fig.elements.filter((element) => element.type !== 'frame').map(elementBounds)
    const width = Math.max(...all.map((part) => part.right)) - 20
    const height = Math.max(...all.map((part) => part.bottom)) - 20
    return [
      `  Returns ids: ${Object.entries(drawn.ids)
        .map(([key, value]) => `${key}${Array.isArray(value) ? `: [${value.length}]` : ''}`)
        .join(
          ', '
        )} (for id 't': ids.${Object.keys(drawn.ids)[0]} is '${[drawn.ids[Object.keys(drawn.ids)[0]]].flat()[0]}')`,
      `  Size at the defaults: about ${Math.round(width)} × ${Math.round(height)} units from (x, y).`
    ].join('\n')
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

/** The project's .tex files that \includegraphics the figure `slug`. */
async function manuscriptsShowing(project, folder, slug) {
  const names = (await folderEntries(path.join(project, folder)))
    .filter((entry) => !entry.isDirectory && entry.name.endsWith('.tex'))
    .map((entry) => entry.name)
  const escaped = slug.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    String.raw`\\includegraphics(?:\[[^\]]*\])?\{(?:[^}]*/)?${escaped}(?:\.\w+)?\}`
  )
  const found = []
  for (const name of names) {
    if (pattern.test((await readText(path.join(project, folder, name))) ?? '')) {
      found.push(folder === '.' ? name : `${folder}/${name}`)
    }
  }
  return found
}

/**
 * The manuscript's headings (sections, subsections and run-in paragraph headings, following
 * \input and \include one level), so an agent can find the method or say it is not there yet.
 * `manuscript` (absolute or project-relative) wins; else the one that shows `figure`; else the
 * catalog's. The other .tex files beside it are listed, to pick from when it is the wrong one.
 */
export async function figureContext(project, { manuscript = null, figure = null } = {}) {
  const figures = workFiguresFolder(project)
  const paperFigures = await figuresFolder(project)
  const catalog = await catalogManuscript(project)
  let source = catalog
  let chosenBy = 'catalog'
  if (manuscript) {
    const absolute = path.resolve(project, manuscript)
    const relative = path.relative(project, absolute)
    source = relative.startsWith('..') || path.isAbsolute(relative) ? absolute : relative
    chosenBy = 'option'
  } else if (figure) {
    const showing = await manuscriptsShowing(project, path.dirname(catalog), figure)
    if (showing.length === 1) {
      source = showing[0]
      chosenBy = 'figure'
    }
  }
  const file = path.resolve(project, source)
  const text = await readText(file)
  const { headings, included } =
    text === null ? { headings: [], included: new Set() } : await manuscriptHeadings(file, text)
  const others = []
  for (const entry of await folderEntries(path.dirname(file))) {
    const other = path.join(path.dirname(file), entry.name)
    // Why only whole documents: a section file or a macro file beside the paper is not one.
    if (
      !entry.isDirectory &&
      entry.name.endsWith('.tex') &&
      other !== file &&
      !included.has(other) &&
      /\\documentclass/.test((await readText(other)) ?? '')
    ) {
      others.push(entry.name)
    }
  }
  others.sort()
  return {
    manuscript: source,
    chosenBy,
    exists: text !== null,
    sections: headings,
    others,
    figures,
    paperFigures
  }
}
