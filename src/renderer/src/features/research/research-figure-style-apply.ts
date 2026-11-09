import { CaptureUpdateAction, newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { BinaryFileData, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { figurePage } from '../../../../research-harness/research-figures-model.mjs'
import {
  figureStyle,
  type FigureStyle
} from '../../../../research-harness/research-figures-style.mjs'
import { inkedImages, pageWithStyle, restylePlan, restyleSvg } from './research-figure-restyle'
import { svgFileData } from './research-figure-svg-files'

export type PaperStyleChoice = { style: string; accent?: string | null }
export type PaperStyleResult = { recolored: number; kept: number; style: FigureStyle }

/** The style a figure's page records (what it was drawn in), graphite when it records none. */
export function pageStyle(elements: readonly ExcalidrawElement[]): FigureStyle {
  const page = figurePage(elements)
  return figureStyle(page?.style, page?.accent, { panels: page?.panels })
}

function svgText(dataURL: string): string | null {
  const [head, body] = dataURL.split(',', 2)
  if (!body || !head.startsWith('data:image/svg+xml')) {
    return null
  }
  if (!head.endsWith(';base64')) {
    return decodeURIComponent(body)
  }
  const bytes = Uint8Array.from(atob(body), (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** New SVG files for inked images whose colours change, by element id. */
async function restyledFiles(
  api: ExcalidrawImperativeAPI,
  from: FigureStyle,
  to: FigureStyle
): Promise<Map<string, BinaryFileData>> {
  const files = api.getFiles()
  const byKey = new Map<string, BinaryFileData | null>()
  const next = new Map<string, BinaryFileData>()
  const elements = api.getSceneElements()
  for (const [id, ink] of inkedImages(elements, to)) {
    const element = elements.find((item) => item.id === id)
    const fileId = element?.type === 'image' ? element.fileId : null
    const svg = fileId && files[fileId] ? svgText(files[fileId].dataURL) : null
    if (!fileId || !svg) {
      continue
    }
    const key = `${fileId}|${ink.icon ?? ''}|${ink.lossInk ?? ''}`
    if (!byKey.has(key)) {
      const inked = restyleSvg(svg, from, to, ink.icon, ink.lossInk)
      const prefix = /^(aster-[a-z]+)-/.exec(fileId)?.[1] ?? 'aster-icon'
      byKey.set(key, inked === svg ? null : (await svgFileData(prefix, inked)).binary)
    }
    const file = byKey.get(key)
    if (file) {
      next.set(id, file)
    }
  }
  return next
}

/**
 * Gives the figure a paper style as one undo step: boxes, text and lines recoloured by role
 * (see `restylePlan`), icons, badges and math re-inked, and the page records the style as the
 * person's choice so the Figure agent keeps it. Null when the figure has no page to record it on.
 */
export async function applyPaperStyle(
  api: ExcalidrawImperativeAPI,
  choice: PaperStyleChoice
): Promise<PaperStyleResult | null> {
  const page = figurePage(api.getSceneElements())
  if (!page) {
    return null
  }
  const from = pageStyle(api.getSceneElements())
  const to = figureStyle(choice.style, choice.accent ?? undefined, { panels: page.panels })
  const files = await restyledFiles(api, from, to)
  // Why read again: the scene may have changed while the icon files were hashed.
  const elements = api.getSceneElementsIncludingDeleted()
  const plan = restylePlan(elements, from, to, page.id)
  if (files.size) {
    api.addFiles([...new Set(files.values())])
  }
  let images = 0
  api.updateScene({
    elements: elements.map((element) => {
      if (element.id === page.id) {
        return newElementWith(element, {
          customData: {
            ...element.customData,
            asterPage: pageWithStyle(element.customData?.asterPage, to)
          }
        })
      }
      const patch = plan.patches.get(element.id)
      const file = files.get(element.id)
      if (file && element.type === 'image') {
        images += 1
        const math = element.customData?.asterMath
        return newElementWith(element, {
          fileId: file.id,
          // Why: the math popover re-renders a label in the colour it records.
          ...(math && typeof math === 'object' && typeof math.color === 'string'
            ? {
                customData: {
                  ...element.customData,
                  asterMath: { ...math, color: restyleSvg(math.color, from, to) }
                }
              }
            : {})
        })
      }
      return patch ? newElementWith(element, patch) : element
    }),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY
  })
  return { recolored: plan.patches.size + images, kept: plan.kept, style: to }
}
