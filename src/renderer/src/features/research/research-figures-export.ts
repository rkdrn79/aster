import { exportToSvg, serializeAsJSON } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import {
  FIGURE_UNITS_PER_INCH,
  figureFilePaths,
  figurePage
} from '../../../../research-harness/research-figures-model.mjs'
import { cropPhotosForExport } from './research-figure-crops'
import { figureFileText, sketchFilePath } from './research-figure-document'
import { writeFigurePreview } from './research-figure-preview'
import {
  projectAbsolutePath,
  writeProjectBinary,
  writeProjectText,
  type ProjectFileOwner
} from './research-project-files'

export type FigureTarget = { owner: ProjectFileOwner; folder: string; slug: string }

// Why: frames are editing aids; exports show their contents, never their outline or name.
const EXPORT_FRAME_RENDERING = { enabled: true, clip: true, name: false, outline: false }

/** The scene as Aster stores it: Excalidraw's own JSON, pretty-printed. */
export function figureSceneText(api: ExcalidrawImperativeAPI): string {
  const scene: unknown = JSON.parse(
    serializeAsJSON(
      api.getSceneElementsIncludingDeleted(),
      api.getAppState(),
      api.getFiles(),
      'local'
    )
  )
  if (scene && typeof scene === 'object') {
    Reflect.set(scene, 'source', 'aster')
  }
  return figureFileText(scene)
}

export function exportInput(api: ExcalidrawImperativeAPI) {
  const scene = api.getSceneElements()
  const page = figurePage(scene)
  const frame = page
    ? scene.find((element) => element.id === page.id && element.type === 'frame')
    : undefined
  // Why: Excalidraw exports only the exporting frame's own children, so an area's contents
  // count as the page's here; areas are editing aids and never print.
  const elements =
    frame?.type === 'frame'
      ? scene
          .filter((element) => element.type !== 'frame' || element.id === frame.id)
          .map((element) =>
            element.frameId && element.frameId !== frame.id
              ? { ...element, frameId: frame.id }
              : element
          )
      : scene
  return {
    page,
    options: {
      elements,
      files: api.getFiles(),
      appState: {
        ...api.getAppState(),
        exportBackground: true,
        exportWithDarkMode: false,
        viewBackgroundColor: '#ffffff',
        frameRendering: EXPORT_FRAME_RENDERING
      },
      exportPadding: page ? 0 : 16,
      exportingFrame: frame?.type === 'frame' ? frame : null
    }
  }
}

/**
 * Writes `<slug>.svg` and the vector `<slug>.pdf` at the page's printed size (or the drawing's,
 * at 144 units per inch, when the figure has no page frame).
 */
export async function writeFigureExports(
  api: ExcalidrawImperativeAPI,
  target: FigureTarget,
  sceneText: string
): Promise<void> {
  const render = window.api.researchFigures?.renderExports
  if (!render) {
    throw new Error('Update Aster to export figures.')
  }
  const { page, options } = exportInput(api)
  const svg = await exportToSvg({
    ...options,
    ...(await cropPhotosForExport(options.elements, options.files))
  })
  const width = Number(svg.getAttribute('width')) || 1
  const height = Number(svg.getAttribute('height')) || 1
  const exports = await render({
    svg: svg.outerHTML,
    widthIn: page?.widthIn ?? width / FIGURE_UNITS_PER_INCH,
    heightIn: page?.heightIn ?? height / FIGURE_UNITS_PER_INCH
  })
  const files = figureFilePaths(target.folder, target.slug)
  await writeProjectText(target.owner, files.svg, exports.svg)
  const pdf = Uint8Array.from(window.atob(exports.pdf), (char) => char.charCodeAt(0))
  await writeProjectBinary(target.owner, files.pdf, pdf)
  await writeFigurePreview(target.owner, target, pdf, sceneText, page?.reference ?? null)
}

/** Saves pasted sketch images as files the agent can open; returns their absolute paths. */
export async function writeFigureSketches(
  api: ExcalidrawImperativeAPI,
  target: FigureTarget,
  elementIds: readonly string[]
): Promise<{ elementId: string; path: string }[]> {
  const files = api.getFiles()
  const sketches: { elementId: string; path: string }[] = []
  for (const element of api.getSceneElements()) {
    if (element.type !== 'image' || !element.fileId || !elementIds.includes(element.id)) {
      continue
    }
    const file = files[element.fileId]
    const match = file ? /^data:([^;,]+);base64,(.*)$/.exec(file.dataURL) : null
    if (!match) {
      continue
    }
    const path = sketchFilePath(target.folder, target.slug, element.id, match[1])
    await writeProjectBinary(
      target.owner,
      path,
      Uint8Array.from(window.atob(match[2]), (char) => char.charCodeAt(0))
    )
    sketches.push({ elementId: element.id, path: projectAbsolutePath(target.owner, path) })
  }
  return sketches
}
