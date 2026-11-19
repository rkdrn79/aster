import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import {
  figureFilePaths,
  figurePage
} from '../../../../research-harness/research-figures-model.mjs'
import { plotFilePaths } from '../../../../research-harness/research-figures-plot-files.mjs'
import type { FigurePromptContext } from './research-figures-agent-prompts'
import type { FiguresAgentScope } from './research-figures-agent-session'
import type { FigureTarget } from './research-figures-export'
import { projectAbsolutePath } from './research-project-files'
import { currentFigurePromptModes } from './research-figure-reference-library'

export type FigureRequestHost = {
  api: ExcalidrawImperativeAPI | null
  target: FigureTarget | null
  folder: string
  owner: FigureTarget['owner']
  manuscript: string | null
  scope: FiguresAgentScope
  /** Saves the open figure so the agent reads what is on screen; false when it could not. */
  save: () => Promise<boolean>
  /** The open plot's slug (in the working folder) when a plot rather than a diagram is open. */
  plot?: string | null
}

/** The open plot as the target of an agent turn; null when a diagram or nothing is open. */
export function figureRequestPlotTarget(
  host: Pick<FigureRequestHost, 'api' | 'plot' | 'folder' | 'owner'>
): FigureTarget | null {
  return !host.api && host.plot ? { owner: host.owner, folder: host.folder, slug: host.plot } : null
}

/** The files and page a Figure prompt names; kept free of Excalidraw's runtime for the page. */
export function figurePromptContext(
  host: Pick<FigureRequestHost, 'api' | 'target' | 'folder' | 'owner' | 'manuscript' | 'plot'>
): FigurePromptContext {
  const { api, target, owner } = host
  const plot = figureRequestPlotTarget(host)
  const plotFiles = plot ? plotFilePaths(plot.folder, plot.slug) : null
  return {
    folderPath: projectAbsolutePath(owner, api && target ? target.folder : host.folder),
    workFolderPath: projectAbsolutePath(owner, host.folder),
    manuscriptPath: host.manuscript ? projectAbsolutePath(owner, host.manuscript) : null,
    figure:
      api && target
        ? {
            slug: target.slug,
            scenePath: projectAbsolutePath(
              owner,
              figureFilePaths(target.folder, target.slug).scene
            ),
            page: figurePage(api.getSceneElements()),
            besideManuscript: target.folder !== host.folder
          }
        : null,
    plot:
      plot && plotFiles
        ? {
            slug: plot.slug,
            scriptPath: projectAbsolutePath(owner, plotFiles.script),
            pngPath: projectAbsolutePath(owner, plotFiles.png),
            pdfPath: projectAbsolutePath(owner, plotFiles.pdf),
            manifestPath: projectAbsolutePath(owner, plotFiles.manifest)
          }
        : null,
    modes: currentFigurePromptModes(owner)
  }
}
