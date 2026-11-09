import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { buildPdfJsDocumentOptions } from '@/components/editor/pdf-js-document-options'
import { lintFigureScene } from '../../../../research-harness/research-figures-lint.mjs'
import {
  figureFilePaths,
  figurePreviewPaths
} from '../../../../research-harness/research-figures-model.mjs'
import { canvasPng, writeFigureCompare } from './research-figure-compare'
import { drawLintMarks, lintMarks } from './research-figure-lint-marks'
import { parseFigureText, sceneSha256 } from './research-figure-document'
import {
  listProjectDirectory,
  projectRecordRoot,
  writeProjectBinary,
  writeProjectText,
  type ProjectFileOwner
} from './research-project-files'

// Why 216: a double-column figure (6.75 in) comes out about 1460 px wide, enough to read 7 pt text.
export const FIGURE_PREVIEW_DPI = 216
// Why 150: the figure at about the size it has on paper, where small labels stop being legible.
export const FIGURE_PRINT_DPI = 150

// Why here too: the PDF viewer sets the same worker, but the preview may render before it loads.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type FigurePreviewSidecar = {
  scene: string
  sceneSha256: string
  widthPx: number
  heightPx: number
  renderedAt: string
  /** Reference beside preview, and preview over reference, when the figure recreates one. */
  compare?: string
  overlay?: string
  /** The same page at FIGURE_PRINT_DPI, and the preview with the lint findings boxed. */
  print?: string
  printDpi?: number
  lint?: string
  lintFindings?: number
}

async function renderPage(page: pdfjs.PDFPageProxy, dpi: number) {
  const viewport = page.getViewport({ scale: dpi / 72 })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  await page.render({ canvas, viewport, background: '#ffffff' }).promise
  return canvas
}

/** Page 1 of the exported PDF as a PNG (exactly what the paper will show), and at print size. */
export async function renderPdfPreview(pdf: Uint8Array): Promise<{
  png: Uint8Array
  canvas: HTMLCanvasElement
  widthPx: number
  heightPx: number
  print: Uint8Array
}> {
  const task = pdfjs.getDocument(buildPdfJsDocumentOptions(pdf.slice(), document.baseURI))
  try {
    const page = await (await task.promise).getPage(1)
    const canvas = await renderPage(page, FIGURE_PREVIEW_DPI)
    return {
      png: await canvasPng(canvas),
      canvas,
      widthPx: canvas.width,
      heightPx: canvas.height,
      print: await canvasPng(await renderPage(page, FIGURE_PRINT_DPI))
    }
  } finally {
    void task.destroy().catch(() => undefined)
  }
}

/** The preview with each lint finding boxed and named, or null when the lint finds nothing. */
async function lintPng(sceneText: string, canvas: HTMLCanvasElement) {
  const scene = parseFigureText(sceneText)
  if (scene.issues.length) {
    return null
  }
  const findings = lintFigureScene(JSON.parse(sceneText))
  const count = findings.errors.length + findings.warnings.length
  if (!count) {
    return null
  }
  const marks = lintMarks(scene.elements, findings, FIGURE_PREVIEW_DPI)
  return { png: await canvasPng(drawLintMarks(canvas, marks, FIGURE_PREVIEW_DPI)), count }
}

/** The agent's eyes: the PNG and a sidecar naming the scene version it shows, never committed. */
export async function writeFigurePreview(
  owner: ProjectFileOwner,
  target: { folder: string; slug: string },
  pdf: Uint8Array,
  sceneText: string,
  referencePath: string | null = null
): Promise<FigurePreviewSidecar> {
  const paths = figurePreviewPaths(await projectRecordRoot(owner), target.slug)
  const preview = await renderPdfPreview(pdf)
  await writeProjectBinary(owner, paths.png, preview.png)
  await writeProjectBinary(owner, paths.print, preview.print)
  const linted = await lintPng(sceneText, preview.canvas)
  if (linted) {
    await writeProjectBinary(owner, paths.lint, linted.png)
  }
  const entries = await listProjectDirectory(owner, paths.directory)
  if (!entries?.some((entry) => entry.name === '.gitignore')) {
    await writeProjectText(owner, `${paths.directory}/.gitignore`, '*\n')
  }
  // Why before the sidecar: the agent waits on the sidecar, so the comparison is ready with it.
  const compared = referencePath
    ? await writeFigureCompare(owner, paths, referencePath, preview.canvas)
    : null
  const sidecar: FigurePreviewSidecar = {
    scene: figureFilePaths(target.folder, target.slug).scene,
    sceneSha256: await sceneSha256(sceneText),
    widthPx: preview.widthPx,
    heightPx: preview.heightPx,
    renderedAt: new Date().toISOString(),
    ...compared,
    print: paths.print,
    printDpi: FIGURE_PRINT_DPI,
    ...(linted ? { lint: paths.lint, lintFindings: linted.count } : {})
  }
  await writeProjectText(owner, paths.sidecar, `${JSON.stringify(sidecar, null, 2)}\n`)
  return sidecar
}

/** The scene hash the current preview was rendered from, or null when there is none. */
export async function readFigurePreviewHash(
  owner: ProjectFileOwner,
  slug: string,
  read: (owner: ProjectFileOwner, path: string) => Promise<string>
): Promise<string | null> {
  try {
    const paths = figurePreviewPaths(await projectRecordRoot(owner), slug)
    const value: unknown = JSON.parse(await read(owner, paths.sidecar))
    const hash: unknown =
      value && typeof value === 'object' ? Reflect.get(value, 'sceneSha256') : null
    return typeof hash === 'string' ? hash : null
  } catch {
    return null
  }
}
