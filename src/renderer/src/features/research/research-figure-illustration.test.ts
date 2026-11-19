import { describe, expect, it } from 'vitest'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { figureStyle } from '../../../../research-harness/research-figures-style.mjs'
import {
  illustrationRecord,
  isIllustration,
  repaintedIllustration,
  svgOfDataURL
} from './research-figure-illustration'

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" data-aster-illustration="1" data-look="flat" data-ppt="1"><g><path d="M0 0L10 0L10 10Z" data-r="accent" data-t="2" data-s="0" fill="#000000" data-o="1" data-w="1" stroke="none" stroke-width="0"/></g></svg>'

function image(customData: Record<string, unknown> | undefined): ExcalidrawElement {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a minimal image element for the record reader, which only reads type and customData.
  return { id: 'pic', type: 'image', customData } as unknown as ExcalidrawElement
}

const fillOf = (svg: string): string =>
  /data-r="accent"[^>]*?fill="(#[0-9a-f]{6})"/.exec(svg)?.[1] ?? ''

describe('illustration images in the app', () => {
  it('reads the record the kit leaves on an illustration', () => {
    const element = image({
      asterIllustration: { look: 'line', roles: { accent: 'second', bad: 3 }, skin: 'deep' }
    })
    expect(illustrationRecord(element)).toEqual({
      look: 'line',
      roles: { accent: 'second' },
      skin: 'deep'
    })
    expect(isIllustration(element)).toBe(true)
    expect(isIllustration(image({ asterPhoto: true }))).toBe(false)
    expect(isIllustration(image(undefined))).toBe(false)
  })

  it('decodes SVG data URLs, base64 or not', () => {
    const encoded = `data:image/svg+xml;base64,${btoa(SVG)}`
    expect(svgOfDataURL(encoded)).toBe(SVG)
    expect(svgOfDataURL(`data:image/svg+xml,${encodeURIComponent(SVG)}`)).toBe(SVG)
    expect(svgOfDataURL('data:image/png;base64,AAAA')).toBeNull()
  })

  it('repaints by role when the palette, a role or the look changes', async () => {
    const blue = figureStyle('graphite', 'blue')
    const teal = figureStyle('graphite', 'teal')
    const first = await repaintedIllustration(SVG, { roles: {} }, blue)
    expect(first?.mimeType).toBe('image/svg+xml')
    const blueSvg = svgOfDataURL(first?.dataURL ?? '') ?? ''
    const tealSvg =
      svgOfDataURL((await repaintedIllustration(blueSvg, { roles: {} }, teal))?.dataURL ?? '') ?? ''
    expect(fillOf(tealSvg)).not.toBe(fillOf(blueSvg))
    const second =
      svgOfDataURL(
        (await repaintedIllustration(blueSvg, { roles: { accent: 'second' } }, blue))?.dataURL ?? ''
      ) ?? ''
    expect(fillOf(second)).not.toBe(fillOf(blueSvg))
    const line =
      svgOfDataURL(
        (await repaintedIllustration(blueSvg, { roles: {}, look: 'line' }, blue))?.dataURL ?? ''
      ) ?? ''
    expect(line).toMatch(/data-look="line"/)
    expect(await repaintedIllustration(blueSvg, { roles: {} }, blue)).toBeNull()
    expect(await repaintedIllustration('<svg></svg>', { roles: {} }, blue)).toBeNull()
  })
})
