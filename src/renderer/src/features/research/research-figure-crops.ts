import { restore } from '@excalidraw/excalidraw'
import type { NonDeletedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { BinaryFiles } from '@excalidraw/excalidraw/types'

type CropRect = {
  x: number
  y: number
  width: number
  height: number
  naturalWidth: number
  naturalHeight: number
}

async function cropDataUrl(dataURL: string, crop: CropRect, mimeType: string): Promise<string> {
  const image = new Image()
  image.src = dataURL
  await image.decode()
  const sx = image.naturalWidth / (crop.naturalWidth || image.naturalWidth)
  const sy = image.naturalHeight / (crop.naturalHeight || image.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(crop.width * sx))
  canvas.height = Math.max(1, Math.round(crop.height * sy))
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('No 2D canvas to crop the photo.')
  }
  context.drawImage(
    image,
    crop.x * sx,
    crop.y * sy,
    crop.width * sx,
    crop.height * sy,
    0,
    0,
    canvas.width,
    canvas.height
  )
  return canvas.toDataURL(mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.92)
}

/**
 * Exports carry only the shown part of a cropped photo: each crop becomes its own small file, so
 * the SVG and PDF do not embed the whole reference once per photo. The scene keeps the original,
 * so a photo can still be re-cropped in the editor.
 */
export async function cropPhotosForExport(
  elements: readonly NonDeletedExcalidrawElement[],
  files: BinaryFiles
): Promise<{ elements: readonly NonDeletedExcalidrawElement[]; files: BinaryFiles }> {
  const cropped = (element: NonDeletedExcalidrawElement) =>
    element.type === 'image' && element.crop && element.fileId ? files[element.fileId] : undefined
  if (!elements.some(cropped)) {
    return { elements, files }
  }
  const nextFiles: Record<string, unknown> = { ...files }
  const nextElements = await Promise.all(
    elements.map(async (element) => {
      const file = cropped(element)
      if (element.type !== 'image' || !element.crop || !file) {
        return element
      }
      const id = `${file.id}-${element.id}`
      const dataURL = await cropDataUrl(file.dataURL, element.crop, file.mimeType)
      nextFiles[id] = { ...file, id, dataURL }
      return { ...element, fileId: id, crop: null }
    })
  )
  // Why JSON.parse's any: restore() is Excalidraw's own sanitizer; it types the new file ids.
  const restored = restore(
    JSON.parse(JSON.stringify({ elements: nextElements, files: nextFiles })),
    null,
    null
  )
  return { elements: restored.elements, files: restored.files }
}
