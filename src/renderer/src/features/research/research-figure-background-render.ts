import './excalidraw-asset-path'
import { getNonDeletedElements, restore } from '@excalidraw/excalidraw'
import { figureFilePaths } from '../../../../research-harness/research-figures-model.mjs'
import { parseFigureText, sceneSha256 } from './research-figure-document'
import { keepFigurePersonEdits } from './research-figure-person-edits'
import { readFigurePreviewHash } from './research-figure-preview'
import { figureSceneData } from './research-figure-scene-data'
import {
  writeFigureExports,
  type FigureExportSource,
  type FigureTarget
} from './research-figures-export'
import { projectOwnerKey, readProjectText } from './research-project-files'

const openEditors = new Map<string, number>()

function editorKey(target: FigureTarget): string {
  return `${projectOwnerKey(target.owner)}|${target.folder}|${target.slug}`
}

/** The open editor follows its file and exports it itself; the background renderer waits for it. */
export function noteFigureEditorOpen(target: FigureTarget): () => void {
  const key = editorKey(target)
  openEditors.set(key, (openEditors.get(key) ?? 0) + 1)
  return () => {
    const count = (openEditors.get(key) ?? 1) - 1
    if (count > 0) {
      openEditors.set(key, count)
    } else {
      openEditors.delete(key)
    }
  }
}

export function figureEditorOpen(target: FigureTarget): boolean {
  return openEditors.has(editorKey(target))
}

/**
 * The scene as the editor holds it right after opening the file: what Excalidraw's own restore
 * makes of `figureSceneData`, so the export below is the editor's export of the same file.
 */
export function figureExportSource(text: string): FigureExportSource {
  const data = restore(figureSceneData(text), null, null, { repairBindings: true })
  const elements = getNonDeletedElements(data.elements)
  return {
    getSceneElements: () => elements,
    getFiles: () => data.files,
    getAppState: () => data.appState
  }
}

export type BackgroundRenderResult = 'rendered' | 'current' | 'invalid' | 'deferred'

/**
 * Renders one figure's exports and preview with no page open: puts the person's edits back on
 * what an agent wrote, then exports exactly as the editor does. An open editor gets the first
 * go (`deferred`); after its grace it is rendered anyway, leaving the person's edits to it.
 */
export async function renderFigureInBackground(
  target: FigureTarget,
  { editorGraceOver = false }: { editorGraceOver?: boolean } = {}
): Promise<BackgroundRenderResult> {
  const open = figureEditorOpen(target)
  if (open && !editorGraceOver) {
    return 'deferred'
  }
  let text = await readProjectText(target.owner, figureFilePaths(target.folder, target.slug).scene)
  if (!open) {
    text = (await keepFigurePersonEdits(target, text)).text
  }
  if (parseFigureText(text).issues.length) {
    return 'invalid'
  }
  const hash = await sceneSha256(text)
  if ((await readFigurePreviewHash(target.owner, target.slug, readProjectText)) === hash) {
    return 'current'
  }
  await writeFigureExports(figureExportSource(text), target, text, 'background')
  return 'rendered'
}
