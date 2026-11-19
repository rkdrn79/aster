import {
  FIGURE_WORK_GITIGNORE,
  mergeFigureListings,
  paperCopyPath,
  parsePublicationRecord,
  type FigureListing,
  type FigurePublication,
  type ListedPlot
} from '../../../../research-harness/research-figures-locations.mjs'
import {
  figureFilePaths,
  listFigureFolder
} from '../../../../research-harness/research-figures-model.mjs'
import { plotFilePaths } from '../../../../research-harness/research-figures-plot-files.mjs'
import {
  listProjectDirectory,
  projectFileSignature,
  readProjectText,
  writeProjectText,
  type ProjectFileOwner
} from './research-project-files'

export type FigureListingSnapshot = {
  listing: FigureListing
  /** Project-relative path → size:mtime of every listed file, so thumbnails follow rewrites. */
  signatures: Record<string, string>
  /** slug → what the paper's copy of that figure was made from. */
  publications: Record<string, FigurePublication>
  /** size:mtime of the manuscript, so "In paper" badges follow edits to it. */
  manuscriptSignature: string
}

async function signatureOf(owner: ProjectFileOwner, path: string): Promise<string> {
  return projectFileSignature(owner, path).then(
    (stat) => stat.signature,
    () => ''
  )
}

async function readPublications(
  owner: ProjectFileOwner,
  work: string
): Promise<Record<string, FigurePublication>> {
  const folder = `${work}/published`
  const entries = (await listProjectDirectory(owner, folder).catch(() => null)) ?? []
  const records = await Promise.all(
    entries
      .filter((entry) => entry.name.endsWith('.json'))
      .map((entry) =>
        readProjectText(owner, `${folder}/${entry.name}`).then(parsePublicationRecord, () => null)
      )
  )
  return Object.fromEntries(
    records.filter((record) => record !== null).map((record) => [record.slug, record])
  )
}

/**
 * The files of a plot whose rewrites its thumbnail, hints and badges follow: the script, what its
 * run wrote, and the paper's copy.
 */
export function plotSignaturePaths(plot: ListedPlot, manuscript: string): string[] {
  const files = plotFilePaths(plot.folder, plot.slug)
  return [
    ...(plot.script ? [files.script] : []),
    ...(plot.manifest ? [files.manifest] : []),
    ...(plot.png ? [files.png] : []),
    ...(plot.pdf ? [files.pdf] : []),
    paperCopyPath(manuscript, plot.slug)
  ]
}

/** Both folders of a project as one list, with the signatures and records its badges need. */
export async function readFigureListing(
  owner: ProjectFileOwner,
  folders: { work: string; paper: string },
  manuscript: string
): Promise<FigureListingSnapshot> {
  const [workEntries, sourceEntries, paperEntries] = await Promise.all([
    listProjectDirectory(owner, folders.work),
    // Why not fatal: without `src/` (or when it cannot be read) the folder simply has no plots.
    listProjectDirectory(owner, `${folders.work}/src`).catch(() => null),
    listProjectDirectory(owner, folders.paper)
  ])
  const listing = mergeFigureListings({
    workFolder: folders.work,
    work: listFigureFolder(workEntries ?? [], sourceEntries ?? []),
    paperFolder: folders.paper,
    paper: listFigureFolder(paperEntries ?? [])
  })
  const paths = [
    ...listing.figures.flatMap((figure) => {
      const files = figureFilePaths(figure.folder, figure.slug)
      return [
        files.scene,
        ...(figure.svg ? [files.svg] : []),
        ...(figure.pdf ? [files.pdf] : []),
        ...(figure.location === 'work' ? [paperCopyPath(manuscript, figure.slug)] : [])
      ]
    }),
    ...listing.plots.flatMap((plot) => plotSignaturePaths(plot, manuscript)),
    ...listing.others.map((entry) => `${entry.folder}/${entry.name}`)
  ]
  const signatures: Record<string, string> = {}
  await Promise.all(
    paths.map(async (path) => {
      signatures[path] = await signatureOf(owner, path)
    })
  )
  const [manuscriptSignature, publications] = await Promise.all([
    signatureOf(owner, manuscript),
    readPublications(owner, folders.work)
  ])
  return { listing, signatures, publications, manuscriptSignature }
}

/** Makes the working folder with its .gitignore (exports stay out of Git; sources are committed). */
export async function ensureFigureWorkFolder(
  owner: ProjectFileOwner,
  folder: string
): Promise<void> {
  const entries = await listProjectDirectory(owner, folder).catch(() => null)
  if (!entries?.some((entry) => entry.name === '.gitignore')) {
    // Why not fatal: the figure's own write reports a folder it cannot use; this only spares Git.
    await writeProjectText(owner, `${folder}/.gitignore`, FIGURE_WORK_GITIGNORE).catch(
      () => undefined
    )
  }
}
