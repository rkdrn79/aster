// Publishing a figure: the paper receives one file, the vector PDF, and only when the person asks.
// Later edits stay out of the paper until it is published again.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { HarnessError } from './research-harness-error.mjs'
import { projectLayout } from './research-layout.mjs'
import { figureFilePaths } from './research-figures-model.mjs'
import {
  figurePublicationPath,
  paperCopyPath,
  publicationRecord
} from './research-figures-locations.mjs'
import {
  catalogManuscript,
  listFigures,
  readPublication,
  sha256,
  workFiguresFolder
} from './research-figures-folders.mjs'
import { PREVIEW_WAIT_SECONDS, previewFigure } from './research-figures.mjs'

export const PUBLISH_WAIT_SECONDS = PREVIEW_WAIT_SECONDS

async function bytesOrNull(file) {
  try {
    return await readFile(file)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

/** A manuscript path from `--manuscript` (or the catalog's), project-relative. */
function manuscriptRelative(project, manuscript) {
  const absolute = path.resolve(project, manuscript)
  const relative = path.relative(project, absolute)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new HarnessError('invalid_argument', `${manuscript} is not inside this project`)
  }
  return relative.split(path.sep).join('/')
}

/** The .tex files that \includegraphics this PDF, among the manuscript and those beside it. */
async function includesOf(project, manuscript, slug) {
  const folder = path.posix.dirname(manuscript)
  const entries = await readdir(path.join(project, folder)).catch(() => [])
  const pattern = new RegExp(
    String.raw`\\includegraphics(?:\[[^\]]*\])?\{(?:[^}]*/)?${slug}(?:\.\w+)?\}`
  )
  const found = []
  for (const name of entries.filter((entry) => entry.endsWith('.tex'))) {
    const text = await readFile(path.join(project, folder, name), 'utf8').catch(() => '')
    if (pattern.test(text)) {
      found.push(folder === '.' ? name : `${folder}/${name}`)
    }
  }
  return found
}

/** Copies a figure's vector PDF to the manuscript's figures folder and records what it was made from. */
export async function publishFigure(
  project,
  { slug, manuscript, replace = false, waitSeconds = PUBLISH_WAIT_SECONDS, pollMs }
) {
  const source = manuscript
    ? manuscriptRelative(project, manuscript)
    : await catalogManuscript(project)
  const target = paperCopyPath(source, slug)
  const listing = await listFigures(project)
  const figure = listing.figures.find((entry) => entry.slug === slug) ?? null
  const plot = listing.others.find(
    (entry) => entry.name === `${slug}.pdf` && entry.folder === workFiguresFolder(project)
  )
  if (!figure && !plot) {
    const scene = `${workFiguresFolder(project)}/${slug}.excalidraw`
    throw new HarnessError('not_found', `No figure ${slug} (no ${scene})`)
  }
  if (figure?.location === 'paper') {
    return { figure: slug, beside: true, pdf: figure.pdf }
  }
  // Why wait: the PDF must show the current scene, and only Aster renders it.
  const sceneSha256 = figure
    ? (await previewFigure(project, slug, { waitSeconds, pollMs })).sceneSha256
    : null
  const from = figure ? figureFilePaths(figure.folder, slug).pdf : plot.path
  const bytes = await bytesOrNull(path.join(project, from))
  if (!bytes) {
    throw new HarnessError('not_found', `${from} is not written yet: open the figure in Aster.`)
  }
  const pdfSha256 = sha256(bytes)
  const previous = await readPublication(project, slug)
  const absolute = path.join(project, target)
  const existing = await bytesOrNull(absolute)
  if (existing && !replace) {
    const existingSha = sha256(existing)
    if (existingSha !== pdfSha256 && existingSha !== previous?.pdfSha256) {
      throw new HarnessError(
        'exists',
        `${target} already exists and did not come from this figure, so it was left alone. If the person wants it replaced, run figures publish --figure ${slug} --replace.`
      )
    }
  }
  await mkdir(path.dirname(absolute), { recursive: true })
  await writeFile(absolute, bytes)
  const recordPath = path.join(project, figurePublicationPath(projectLayout(project).root, slug))
  await mkdir(path.dirname(recordPath), { recursive: true })
  await writeFile(
    recordPath,
    `${JSON.stringify(
      publicationRecord({
        slug,
        pdf: target,
        pdfSha256,
        sceneSha256,
        publishedAt: new Date().toISOString()
      }),
      null,
      2
    )}\n`
  )
  return {
    figure: slug,
    from,
    pdf: target,
    replaced: existing !== null && sha256(existing) !== pdfSha256,
    usedIn: await includesOf(project, source, slug)
  }
}
