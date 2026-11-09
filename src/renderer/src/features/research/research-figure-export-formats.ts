import { exportToBlob, exportToSvg } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { toast } from 'sonner'
import { copyImageToClipboard } from '@/lib/clipboard-image-copy'
import { revealInFileManager } from '@/lib/reveal-in-file-manager'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import {
  FIGURE_UNITS_PER_INCH,
  PAGE_FRAME_ID
} from '../../../../research-harness/research-figures-model.mjs'
import { cropPhotosForExport } from './research-figure-crops'
import { exportInput, type FigureTarget } from './research-figures-export'
import {
  projectAbsolutePath,
  writeProjectBinary,
  writeProjectText,
  type ProjectFileOwner
} from './research-project-files'

export type FigureExportFormat = 'pdf' | 'svg' | 'png300' | 'png600'
export type FigureExportOptions = { transparent: boolean; selectionOnly: boolean }

const FRAME_RENDERING = { enabled: true, clip: true, name: false, outline: false }

/** The selected elements with their labels and an area's contents, padded on white. */
function selectionInput(api: ExcalidrawImperativeAPI) {
  const selected = api.getAppState().selectedElementIds
  const scene = api.getSceneElements()
  const ids = new Set(
    scene.filter((element) => selected[element.id] && element.id !== PAGE_FRAME_ID).map((e) => e.id)
  )
  const elements = scene.filter(
    (element) =>
      ids.has(element.id) ||
      (element.type === 'text' && element.containerId !== null && ids.has(element.containerId)) ||
      (element.frameId !== null && ids.has(element.frameId))
  )
  return {
    elements,
    files: api.getFiles(),
    appState: {
      ...api.getAppState(),
      exportBackground: true,
      exportWithDarkMode: false,
      viewBackgroundColor: '#ffffff',
      frameRendering: FRAME_RENDERING
    },
    exportPadding: 8,
    exportingFrame: null
  }
}

function imageInput(api: ExcalidrawImperativeAPI, options: FigureExportOptions) {
  const input = options.selectionOnly ? selectionInput(api) : exportInput(api).options
  if (!input.elements.length) {
    throw new Error('Select something to export first.')
  }
  return {
    ...input,
    appState: { ...input.appState, exportBackground: !options.transparent }
  }
}

export async function figurePngBlob(
  api: ExcalidrawImperativeAPI,
  dpi: number,
  options: FigureExportOptions
): Promise<Blob> {
  const scale = dpi / FIGURE_UNITS_PER_INCH
  return exportToBlob({
    ...imageInput(api, options),
    mimeType: 'image/png',
    getDimensions: (width, height) => ({ width: width * scale, height: height * scale, scale })
  })
}

async function selectionSvg(api: ExcalidrawImperativeAPI, options: FigureExportOptions) {
  const input = imageInput(api, options)
  return exportToSvg({ ...input, ...(await cropPhotosForExport(input.elements, input.files)) })
}

/**
 * Writes one export beside the figure and resolves to its project path. The page's PDF and SVG
 * come from `save` (they are written on every save); a selection or a PNG is written here.
 */
export async function writeFigureExport(input: {
  api: ExcalidrawImperativeAPI
  target: FigureTarget
  save: () => Promise<boolean>
  format: FigureExportFormat
  options: FigureExportOptions
}): Promise<string> {
  const { api, target, format, options } = input
  const suffix = `${options.selectionOnly ? '-selection' : ''}${options.transparent ? '-transparent' : ''}`
  const base = `${target.folder}/${target.slug}${suffix}`
  if (format === 'png300' || format === 'png600') {
    const dpi = format === 'png600' ? 600 : 300
    const path = `${base}${dpi === 600 ? '-600dpi' : ''}.png`
    const blob = await figurePngBlob(api, dpi, options)
    await writeProjectBinary(target.owner, path, new Uint8Array(await blob.arrayBuffer()))
    return path
  }
  if (!options.selectionOnly && !options.transparent) {
    if (!(await input.save())) {
      throw new Error('The figure could not be saved. Resolve the message on the canvas first.')
    }
    return `${base}.${format}`
  }
  const svg = await selectionSvg(api, options)
  if (format === 'svg') {
    await writeProjectText(target.owner, `${base}.svg`, svg.outerHTML)
    return `${base}.svg`
  }
  const render = window.api.researchFigures?.renderExports
  if (!render) {
    throw new Error('Update Aster to export figures.')
  }
  const exports = await render({
    svg: svg.outerHTML,
    widthIn: (Number(svg.getAttribute('width')) || 1) / FIGURE_UNITS_PER_INCH,
    heightIn: (Number(svg.getAttribute('height')) || 1) / FIGURE_UNITS_PER_INCH
  })
  const pdf = Uint8Array.from(window.atob(exports.pdf), (char) => char.charCodeAt(0))
  await writeProjectBinary(target.owner, `${base}.pdf`, pdf)
  return `${base}.pdf`
}

export async function copyFigurePng(api: ExcalidrawImperativeAPI, options: FigureExportOptions) {
  await copyImageToClipboard(await figurePngBlob(api, 300, options))
}

/** Shows a project file in Finder (or the platform's file manager). */
export function revealProjectFile(owner: ProjectFileOwner, path: string): void {
  void revealInFileManager(
    projectAbsolutePath(owner, path),
    parseExecutionHostId(owner.hostId)?.id ?? 'unresolved'
  )
}

export function toastExported(owner: ProjectFileOwner, path: string): void {
  toast.success(`Saved ${path}.`, {
    action: { label: 'Reveal', onClick: () => revealProjectFile(owner, path) }
  })
}
