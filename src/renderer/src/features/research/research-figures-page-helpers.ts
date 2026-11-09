import { figureFilePaths } from '../../../../research-harness/research-figures-model.mjs'
import type { FigureReference } from './research-figure-recreate'
import type { FigureSendTrack } from './research-figure-chat-send'
import { useFigureEditorHandle } from './research-figure-editor-handle'
import type { FigureRequestHost } from './research-figure-prompt-context'
import { readProjectText, type ProjectFileOwner } from './research-project-files'
import { resolveManuscriptFile } from './research-writing-source'
import { readWritingManuscript, type WritingProjectScope } from './research-writing-project'

/** The image selected on the open figure's canvas, offered as the reference to recreate. */
export function selectedCanvasImage(): FigureReference | null {
  const api = useFigureEditorHandle.getState().handle?.api
  if (!api) {
    return null
  }
  const selected = api.getAppState().selectedElementIds
  const image = api
    .getSceneElements()
    .find((element) => selected[element.id] && element.type === 'image')
  const file = image?.type === 'image' && image.fileId ? api.getFiles()[image.fileId] : undefined
  const match = file ? /^data:([^;,]+);base64,(.*)$/.exec(file.dataURL) : null
  return match
    ? {
        bytes: Uint8Array.from(window.atob(match[2]), (char) => char.charCodeAt(0)),
        name: match[1] === 'image/jpeg' ? 'reference.jpg' : 'reference.png'
      }
    : null
}

/** How many elements are selected on the open canvas (⌘K asks about them). */
export function canvasSelectionCount(): number {
  const api = useFigureEditorHandle.getState().handle?.api
  return api ? Object.keys(api.getAppState().selectedElementIds).length : 0
}

/** The manuscript Writing uses, project-relative; null leaves the default `paper/main.tex`. */
export async function manuscriptSource(
  scope: WritingProjectScope,
  linked: Parameters<typeof readWritingManuscript>[1]
): Promise<string | null> {
  const manuscript = await readWritingManuscript(scope, linked).catch(() => undefined)
  return manuscript
    ? resolveManuscriptFile(scope, manuscript.sourcePath, '.tex').relativePath
    : null
}

/** "Before send" for the open figure, read off its canvas; null when no figure is open. */
export async function openFigureSendTrack(
  host: Pick<FigureRequestHost, 'api' | 'target'>
): Promise<FigureSendTrack | null> {
  if (!host.api || !host.target) {
    return null
  }
  // Why load it here: the export code pulls in Excalidraw, which the page keeps out of its chunk.
  const { figureSceneText } = await import('./research-figures-export')
  return { target: host.target, beforeText: figureSceneText(host.api) }
}

/** "Before send" for a figure the New figure dialog just wrote: its blank page on disk. */
export async function newFigureSendTrack(
  owner: ProjectFileOwner,
  folder: string,
  slug: string
): Promise<FigureSendTrack> {
  const beforeText = await readProjectText(owner, figureFilePaths(folder, slug).scene).catch(
    () => null
  )
  return { target: { owner, folder, slug }, beforeText }
}
