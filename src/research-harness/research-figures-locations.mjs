// Where a project's figures live. A figure is worked on in the record tree, `<record root>/figures`
// (scene, exports, `src/` with its script and the portable shim); the paper only receives its
// vector PDF, in the manuscript's figures folder, when the person asks. Older figures still in the
// manuscript's folder keep working where they are.
import { cleanRelative, figuresFolderFor } from './research-figures-model.mjs'

/** Sources are committed; exports are rebuilt when the figure opens, so Git never sees them. */
export const FIGURE_WORK_GITIGNORE = '*.pdf\n*.svg\n*.png\n'

export function figureWorkFolder(recordRoot) {
  return `${cleanRelative(recordRoot)}/figures`
}

/** The paper's copy of a figure: the PDF `\includegraphics{figures/<slug>.pdf}` resolves to. */
export function paperCopyPath(manuscriptSource, slug) {
  return `${figuresFolderFor(manuscriptSource)}/${slug}.pdf`
}

/** What was last copied to the paper, one small committed file per figure. */
export function figurePublicationPath(recordRoot, slug) {
  return `${figureWorkFolder(recordRoot)}/published/${slug}.json`
}

/** One publication record: which scene and PDF the paper's copy was made from, and when. */
export function publicationRecord({ slug, pdf, pdfSha256, sceneSha256, publishedAt }) {
  return { slug, pdf, pdfSha256, sceneSha256, publishedAt }
}

export function parsePublicationRecord(text) {
  try {
    const value = JSON.parse(text)
    return typeof value?.slug === 'string' && typeof value?.pdfSha256 === 'string' ? value : null
  } catch {
    return null
  }
}

/**
 * The two folders of a project as one list. A figure in both is taken from the working folder
 * (the record tree wins, as it does for the project's layout); the other stays on disk, listed in
 * `shadowed`. A paper PDF that is the copy of a working figure is not a figure of its own.
 */
export function mergeFigureListings({ workFolder, work, paperFolder, paper }) {
  const beside = workFolder === paperFolder ? { figures: [], others: [] } : paper
  const slugs = new Set(work.figures.map((figure) => figure.slug))
  const names = new Set(work.others.map((entry) => entry.name))
  const figures = [
    ...work.figures.map((figure) => ({ ...figure, folder: workFolder, location: 'work' })),
    ...beside.figures
      .filter((figure) => !slugs.has(figure.slug))
      .map((figure) => ({ ...figure, folder: paperFolder, location: 'paper' }))
  ].sort((a, b) => a.slug.localeCompare(b.slug))
  const copies = new Set([...slugs].map((slug) => `${slug}.pdf`))
  const others = [
    ...work.others.map((entry) => ({ ...entry, folder: workFolder })),
    ...beside.others
      .filter((entry) => !names.has(entry.name) && !copies.has(entry.name))
      .map((entry) => ({ ...entry, folder: paperFolder }))
  ].sort((a, b) => a.name.localeCompare(b.name))
  const shadowed = beside.figures
    .filter((figure) => slugs.has(figure.slug))
    .map((figure) => ({ slug: figure.slug, folder: paperFolder }))
  return { figures, others, shadowed }
}

/**
 * How the paper's copy stands: `beside` for a figure kept beside the manuscript (edits reach the
 * paper directly), `none`, `current`, `outdated` (the figure changed since it was published) or
 * `missing` (it was published here, but the copy is gone). A null `sceneSha256` means not read yet.
 */
export function figurePaperState({ location, record, paperCopy, expectedPdf, sceneSha256 }) {
  if (location === 'paper') {
    return 'beside'
  }
  if (!record) {
    return 'none'
  }
  if (!paperCopy) {
    return record.pdf === expectedPdf ? 'missing' : 'none'
  }
  if (sceneSha256 === null || record.sceneSha256 === null) {
    return 'current'
  }
  return sceneSha256 === record.sceneSha256 ? 'current' : 'outdated'
}
