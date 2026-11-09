import type { figurePreviewPaths } from '../../../../research-harness/research-figures-model.mjs'
import {
  projectFileSignature,
  projectOwnerKey,
  readProjectFile,
  writeProjectBinary,
  type ProjectFileOwner
} from './research-project-files'

// Why 1200: two panels side by side stay legible after an agent's image reader scales them down.
const PANEL_MAX_PX = 1200
const GUTTER_PX = 24
const CAPTION_PX = 32
// Why: a wide figure reads better with the reference above the preview than beside it.
const STACK_ASPECT = 1.6

type DecodedImage = { image: HTMLImageElement; key: string }
let lastReference: DecodedImage | null = null

export async function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) {
    throw new Error('The image could not be encoded.')
  }
  return new Uint8Array(await blob.arrayBuffer())
}

function blankCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('No 2D canvas to compose the comparison.')
  }
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  return { canvas, context }
}

/** A project image, decoded; the last reference is kept until its file changes. */
export async function loadProjectImage(
  owner: ProjectFileOwner,
  relativePath: string
): Promise<HTMLImageElement> {
  const { signature } = await projectFileSignature(owner, relativePath)
  const key = `${projectOwnerKey(owner)}:${relativePath}:${signature}`
  if (lastReference?.key === key) {
    return lastReference.image
  }
  const file = await readProjectFile(owner, relativePath)
  const source =
    file.mediaUrl ??
    (file.isBinary ? `data:${file.mimeType ?? 'image/png'};base64,${file.content}` : null)
  if (!source) {
    throw new Error(`${relativePath} is not an image.`)
  }
  const image = new Image()
  image.src = source
  await image.decode()
  lastReference = { image, key }
  return image
}

type Size = { width: number; height: number }

/** Where the two panels go: one width for both, stacked when the figure is wide. */
export function compareLayout(preview: Size, reference: Size) {
  const width = Math.min(preview.width, PANEL_MAX_PX)
  const previewHeight = (preview.height * width) / preview.width
  const referenceHeight = (reference.height * width) / reference.width
  const panelHeight = Math.max(previewHeight, referenceHeight)
  const stacked = width / panelHeight > STACK_ASPECT
  const panel = CAPTION_PX + panelHeight
  const at = (index: number) => ({
    left: stacked ? 0 : index * (width + GUTTER_PX),
    top: (stacked ? index * (panel + GUTTER_PX) : 0) + CAPTION_PX
  })
  return {
    width,
    previewHeight,
    referenceHeight,
    panelHeight,
    stacked,
    canvas: stacked
      ? { width, height: panel * 2 + GUTTER_PX }
      : { width: width * 2 + GUTTER_PX, height: panel },
    reference: at(0),
    preview: at(1)
  }
}

/**
 * The reference and the preview at one scale (the reference spans the page's width, as in the
 * recreation), side by side or stacked, and the preview multiplied over a faded reference.
 */
export async function composeFigureCompare(
  reference: HTMLImageElement,
  preview: HTMLCanvasElement
): Promise<{ compare: Uint8Array; overlay: Uint8Array }> {
  const layout = compareLayout(preview, {
    width: reference.naturalWidth,
    height: reference.naturalHeight
  })
  const { width, previewHeight, referenceHeight, panelHeight } = layout
  const { canvas, context } = blankCanvas(layout.canvas.width, layout.canvas.height)
  const panels = [
    { caption: 'Reference', image: reference, height: referenceHeight, ...layout.reference },
    {
      caption: 'Preview (what the PDF shows)',
      image: preview,
      height: previewHeight,
      ...layout.preview
    }
  ]
  context.font = '600 18px sans-serif'
  for (const entry of panels) {
    context.fillStyle = '#333333'
    context.fillText(entry.caption, entry.left + 2, entry.top - 10)
    context.drawImage(entry.image, entry.left, entry.top, width, entry.height)
    context.strokeStyle = '#c8c8c8'
    context.strokeRect(entry.left + 0.5, entry.top + 0.5, width - 1, entry.height - 1)
  }
  const overlay = blankCanvas(width, panelHeight)
  // Why multiply over a faded reference: the preview stays crisp, its white does not wash the
  // reference out, and an offset shows as a ghost edge beside the drawn one.
  overlay.context.globalAlpha = 0.35
  overlay.context.drawImage(reference, 0, 0, width, referenceHeight)
  overlay.context.globalAlpha = 1
  overlay.context.globalCompositeOperation = 'multiply'
  overlay.context.drawImage(preview, 0, 0, width, previewHeight)
  return { compare: await canvasPng(canvas), overlay: await canvasPng(overlay.canvas) }
}

/**
 * Writes `<slug>.compare.png` and `<slug>.overlay.png` beside the preview; null when the
 * reference cannot be read (the preview itself still counts).
 */
export async function writeFigureCompare(
  owner: ProjectFileOwner,
  paths: ReturnType<typeof figurePreviewPaths>,
  referencePath: string,
  preview: HTMLCanvasElement
): Promise<{ compare: string; overlay: string } | null> {
  let images: { compare: Uint8Array; overlay: Uint8Array }
  try {
    images = await composeFigureCompare(await loadProjectImage(owner, referencePath), preview)
  } catch {
    return null
  }
  await writeProjectBinary(owner, paths.compare, images.compare)
  await writeProjectBinary(owner, paths.overlay, images.overlay)
  return { compare: paths.compare, overlay: paths.overlay }
}
