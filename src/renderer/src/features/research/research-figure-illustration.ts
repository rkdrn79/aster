import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { BinaryFileData } from '@excalidraw/excalidraw/types'
import {
  illustrationPalette,
  paintIllustrationSvg
} from '../../../../research-harness/research-figures-illustration-paint.mjs'
import type { FigureStyle } from '../../../../research-harness/research-figures-style.mjs'
import { svgFileData } from './research-figure-svg-files'

/** What the kit records on an illustration image: its look and colour role overrides. */
export type IllustrationRecord = {
  look?: string
  roles: Record<string, string>
  skin?: string
  name?: string | null
}

function textMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
}

/** The illustration record of an image the kit placed, or null for any other element. */
export function illustrationRecord(element: ExcalidrawElement): IllustrationRecord | null {
  const record: unknown = element.customData?.asterIllustration
  if (element.type !== 'image' || !record || typeof record !== 'object') {
    return null
  }
  const look = Reflect.get(record, 'look')
  const skin = Reflect.get(record, 'skin')
  const name = Reflect.get(record, 'name')
  return {
    roles: textMap(Reflect.get(record, 'roles')),
    ...(typeof look === 'string' ? { look } : {}),
    ...(typeof skin === 'string' ? { skin } : {}),
    ...(typeof name === 'string' ? { name } : {})
  }
}

export function isIllustration(element: ExcalidrawElement): boolean {
  return illustrationRecord(element) !== null
}

/** The SVG text of a data URL, or null when it holds no SVG. */
export function svgOfDataURL(dataURL: string): string | null {
  const [head, body] = dataURL.split(',', 2)
  if (!body || !head.startsWith('data:image/svg+xml')) {
    return null
  }
  if (!head.endsWith(';base64')) {
    return decodeURIComponent(body)
  }
  return new TextDecoder().decode(Uint8Array.from(atob(body), (char) => char.charCodeAt(0)))
}

/**
 * An illustration's SVG repainted in `style` with its record (look, roles, skin); null when
 * nothing changes or the SVG carries no colour roles.
 */
export async function repaintedIllustration(
  svg: string,
  record: IllustrationRecord,
  style: FigureStyle
): Promise<BinaryFileData | null> {
  if (!svg.includes('data-aster-illustration')) {
    return null
  }
  const painted = paintIllustrationSvg(
    svg,
    illustrationPalette(style, { roles: record.roles, skin: record.skin }),
    record.look ? { look: record.look } : {}
  )
  return painted === svg ? null : (await svgFileData('aster-ill', painted)).binary
}
