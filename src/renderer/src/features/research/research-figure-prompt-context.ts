import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import {
  figureFilePaths,
  figurePage
} from '../../../../research-harness/research-figures-model.mjs'
import type { FigurePromptContext } from './research-figures-agent-prompts'
import type { FiguresAgentScope } from './research-figures-agent-session'
import type { FigureTarget } from './research-figures-export'
import { projectAbsolutePath } from './research-project-files'

export type FigureRequestHost = {
  api: ExcalidrawImperativeAPI | null
  target: FigureTarget | null
  folder: string
  owner: FigureTarget['owner']
  manuscript: string | null
  scope: FiguresAgentScope
  /** Saves the open figure so the agent reads what is on screen; false when it could not. */
  save: () => Promise<boolean>
}

/** The files and page a Figure prompt names; kept free of Excalidraw's runtime for the page. */
export function figurePromptContext(
  host: Pick<FigureRequestHost, 'api' | 'target' | 'folder' | 'owner' | 'manuscript'>
): FigurePromptContext {
  const { api, target, owner } = host
  return {
    folderPath: projectAbsolutePath(owner, host.folder),
    manuscriptPath: host.manuscript ? projectAbsolutePath(owner, host.manuscript) : null,
    figure:
      api && target
        ? {
            slug: target.slug,
            scenePath: projectAbsolutePath(
              owner,
              figureFilePaths(target.folder, target.slug).scene
            ),
            page: figurePage(api.getSceneElements())
          }
        : null
  }
}
