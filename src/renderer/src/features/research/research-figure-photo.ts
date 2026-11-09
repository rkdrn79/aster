import { convertToExcalidrawElements, newElementWith } from '@excalidraw/excalidraw'
import type {
  ExcalidrawElement,
  ExcalidrawImageElement
} from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { figurePage } from '../../../../research-harness/research-figures-model.mjs'
import { asFileId, binaryFile, sha256Hex, type ImageMimeType } from './research-figure-svg-files'

export type ImageSource = { dataURL: string; mimeType: ImageMimeType }
type Size = { width: number; height: number }
type Commit = (next: readonly ExcalidrawElement[]) => void

const MIME_TYPES: readonly ImageMimeType[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml'
]

export function imageMimeType(value: string): ImageMimeType | null {
  return MIME_TYPES.find((type) => type === value) ?? null
}

export function isPhoto(element: ExcalidrawElement): element is ExcalidrawImageElement {
  return element.type === 'image' && element.customData?.asterPhoto === true
}

export function readImageFile(file: File): Promise<ImageSource | null> {
  const mimeType = imageMimeType(file.type)
  if (!mimeType) {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? { dataURL: reader.result, mimeType } : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

function loadImage(dataURL: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The image could not be read.'))
    image.src = dataURL
  })
}

/** The middle of a picture that covers a frame, as Excalidraw's crop (natural pixels). */
export function coverCrop(natural: Size, frame: Size) {
  const scale = Math.max(frame.width / natural.width, frame.height / natural.height)
  const width = frame.width / scale
  const height = frame.height / scale
  return {
    x: (natural.width - width) / 2,
    y: (natural.height - height) / 2,
    width,
    height,
    naturalWidth: natural.width,
    naturalHeight: natural.height
  }
}

async function addPhotoFile(api: ExcalidrawImperativeAPI, source: ImageSource): Promise<string> {
  const id = `aster-photo-${(await sha256Hex(source.dataURL)).slice(0, 16)}`
  api.addFiles([binaryFile(id, source.mimeType, source.dataURL)])
  return id
}

/** Puts a picture into a photo's frame: same place and size, covered and centred, one undo step. */
export async function replacePhoto(
  api: ExcalidrawImperativeAPI,
  imageId: string,
  source: ImageSource,
  commit: Commit
): Promise<void> {
  const image = await loadImage(source.dataURL)
  const fileId = await addPhotoFile(api, source)
  const natural = { width: image.naturalWidth, height: image.naturalHeight }
  commit(
    api.getSceneElementsIncludingDeleted().map((element) => {
      if (element.id !== imageId || element.type !== 'image') {
        return element
      }
      const { asterPhotoKind: _kind, asterView: _view, ...customData } = element.customData ?? {}
      return newElementWith(element, {
        fileId: asFileId(fileId),
        status: 'saved',
        crop: coverCrop(natural, element),
        customData: { ...customData, asterPhoto: true, asterPhotoSource: fileId, asterNoise: 0 }
      })
    })
  )
}

/** A dropped picture at a point, at most a third of the page wide. */
export async function insertPicture(
  api: ExcalidrawImperativeAPI,
  source: ImageSource,
  at: { x: number; y: number },
  commit: Commit
): Promise<void> {
  const image = await loadImage(source.dataURL)
  const fileId = await addPhotoFile(api, source)
  const page = figurePage(api.getSceneElements())
  const most = page ? page.width / 3 : 160
  const scale = Math.min(1, most / image.naturalWidth)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  const [element] = convertToExcalidrawElements([
    {
      type: 'image',
      x: at.x - width / 2,
      y: at.y - height / 2,
      width,
      height,
      fileId: asFileId(fileId),
      status: 'saved',
      customData: { asterPhoto: true, asterPhotoSource: fileId }
    }
  ])
  commit([...api.getSceneElementsIncludingDeleted(), element])
}

/** The photo with gray noise laid over its source at `level` (0–1), as diffusion figures show. */
export async function noisePhoto(
  api: ExcalidrawImperativeAPI,
  imageId: string,
  level: number,
  commit: Commit
): Promise<void> {
  const element = api.getSceneElements().find((item) => item.id === imageId)
  if (!element || element.type !== 'image' || !element.fileId) {
    return
  }
  const sourceId = String(element.customData?.asterPhotoSource ?? element.fileId)
  const source = api.getFiles()[sourceId] ?? api.getFiles()[element.fileId]
  if (!source) {
    return
  }
  const image = await loadImage(source.dataURL)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) {
    return
  }
  context.drawImage(image, 0, 0)
  if (level > 0) {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    for (let i = 0; i < pixels.data.length; i += 4) {
      const gray = Math.random() * 255
      for (let channel = 0; channel < 3; channel++) {
        pixels.data[i + channel] = pixels.data[i + channel] * (1 - level) + gray * level
      }
    }
    context.putImageData(pixels, 0, 0)
  }
  const noisy: ImageSource =
    level > 0
      ? { dataURL: canvas.toDataURL('image/jpeg', 0.9), mimeType: 'image/jpeg' }
      : { dataURL: source.dataURL, mimeType: imageMimeType(source.mimeType) ?? 'image/png' }
  const fileId = level > 0 ? await addPhotoFile(api, noisy) : sourceId
  commit(
    api.getSceneElementsIncludingDeleted().map((item) =>
      item.id === imageId && item.type === 'image'
        ? newElementWith(item, {
            fileId: asFileId(fileId),
            customData: { ...item.customData, asterPhotoSource: sourceId, asterNoise: level }
          })
        : item
    )
  )
}
