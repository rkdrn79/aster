import { readFigureListing } from '@/features/research/research-figure-listing'
import { buildFigureMessageContext } from '@/features/research/research-figures-agent-prompts'
import { DEFAULT_MANUSCRIPT } from '@/features/research/research-figures-store'
import {
  projectRecordRoot,
  type ProjectFileOwner
} from '@/features/research/research-project-files'
import { joinPath } from '@/lib/path'
import { figureWorkFolder } from '../../../research-harness/research-figures-locations.mjs'
import {
  figureFilePaths,
  figurePreviewPaths,
  figuresFolderFor
} from '../../../research-harness/research-figures-model.mjs'
import { plotFilePaths } from '../../../research-harness/research-figures-plot-files.mjs'
import { withAsterContext } from '../../../shared/aster-context-block'

/** One figure of the project as the phone lists it: what to show and what the agent edits. */
export type PhoneFigure = {
  slug: string
  kind: 'diagram' | 'plot' | 'image'
  /** Its folder, project-relative: the working folder or the manuscript's. */
  folder: string
  /** The image the phone shows, project-relative; null when nothing was exported yet. */
  image: string | null
  /** size:mtime of the image, so a thumbnail follows a redraw. */
  version: string
}

export type PhoneFigureProject = {
  figures: PhoneFigure[]
  workFolder: string
  manuscript: string
}

/** The project's figures and plots, read the way the desktop's Figures list reads them. */
export async function readPhoneFigures(
  owner: ProjectFileOwner,
  manuscriptSource: string | null
): Promise<PhoneFigureProject> {
  const manuscript = manuscriptSource ?? DEFAULT_MANUSCRIPT
  const recordRoot = await projectRecordRoot(owner)
  const workFolder = figureWorkFolder(recordRoot)
  const { listing, signatures } = await readFigureListing(
    owner,
    { work: workFolder, paper: figuresFolderFor(manuscript) },
    manuscript
  )
  const version = (path: string | null): string => (path ? (signatures[path] ?? '') : '')
  const diagrams = listing.figures.map((figure): PhoneFigure => {
    const files = figureFilePaths(figure.folder, figure.slug)
    // Why the preview last: Aster renders it on the desktop, so a phone-only project may lack it.
    const image = figure.svg
      ? files.svg
      : figure.png
        ? files.png
        : figurePreviewPaths(recordRoot, figure.slug).png
    return {
      slug: figure.slug,
      kind: 'diagram',
      folder: figure.folder,
      image,
      version: version(image)
    }
  })
  const plots = listing.plots.map((plot): PhoneFigure => {
    const files = plotFilePaths(plot.folder, plot.slug)
    const image = plot.png ? files.png : plot.svg ? files.svg : null
    return { slug: plot.slug, kind: 'plot', folder: plot.folder, image, version: version(image) }
  })
  const images = listing.others
    .filter((entry) => entry.kind === 'image')
    .map((entry): PhoneFigure => {
      const image = `${entry.folder}/${entry.name}`
      return {
        slug: entry.name,
        kind: 'image',
        folder: entry.folder,
        image,
        version: version(image)
      }
    })
  return { figures: [...diagrams, ...plots, ...images], workFolder, manuscript }
}

/**
 * A request for the Figure agent about one figure, with the same context the desktop's figure
 * chat sends: where the figure, its sources and the manuscript live on the host.
 */
export function phoneFigureAgentPrompt(
  workspacePath: string,
  project: Pick<PhoneFigureProject, 'workFolder' | 'manuscript'>,
  figure: PhoneFigure,
  request: string
): string {
  const absolute = (relative: string): string => joinPath(workspacePath, relative)
  const plot = figure.kind === 'plot' ? plotFilePaths(figure.folder, figure.slug) : null
  const message = buildFigureMessageContext({
    folderPath: absolute(figure.folder),
    workFolderPath: absolute(project.workFolder),
    manuscriptPath: absolute(project.manuscript),
    figure:
      figure.kind === 'diagram'
        ? {
            slug: figure.slug,
            scenePath: absolute(figureFilePaths(figure.folder, figure.slug).scene),
            page: null
          }
        : null,
    plot: plot
      ? {
          slug: figure.slug,
          scriptPath: absolute(plot.script),
          pngPath: absolute(plot.png),
          pdfPath: absolute(plot.pdf),
          manifestPath: absolute(plot.manifest)
        }
      : null
  })
  return withAsterContext(request.trim(), { label: message.label, body: message.body })
}
