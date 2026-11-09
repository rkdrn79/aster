import type { FileId } from '@excalidraw/excalidraw/element/types'
import type { BinaryFileData, DataURL } from '@excalidraw/excalidraw/types'
import { inkColor, type FigureStyle } from '../../../../research-harness/research-figures-style.mjs'

export type ImageMimeType = Extract<
  BinaryFileData['mimeType'],
  'image/svg+xml' | 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
>
export type SvgFile = { fileId: FileId; dataURL: DataURL; binary: BinaryFileData }

export function asFileId(id: string): FileId {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: FileId is a string with a compile-time brand; callers pass the kit's own `aster-<kind>-<hash>` ids.
  return id as FileId
}

export function asDataURL(url: string): DataURL {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: DataURL is a string with a compile-time brand; callers pass a base64 data URL they built.
  return url as DataURL
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function textToBase64(text: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

export function binaryFile(id: string, mimeType: ImageMimeType, dataURL: string): BinaryFileData {
  return { id: asFileId(id), mimeType, dataURL: asDataURL(dataURL), created: Date.now() }
}

/** A line icon inked in the figure's style, as the kit's `iconImage(…, { variant: 'line' })`. */
export function lineIconSvg(raw: string, style: FigureStyle): string {
  return raw.replaceAll('currentColor', inkColor(style, 'ink'))
}

/** An SVG as an Excalidraw file under `<prefix>-<first 16 hex of its sha256>`, as the kit ids it. */
export async function svgFileData(prefix: string, svg: string): Promise<SvgFile> {
  const id = `${prefix}-${(await sha256Hex(svg)).slice(0, 16)}`
  const binary = binaryFile(id, 'image/svg+xml', `data:image/svg+xml;base64,${textToBase64(svg)}`)
  return { fileId: binary.id, dataURL: binary.dataURL, binary }
}
