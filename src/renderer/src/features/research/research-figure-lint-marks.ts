import type { FigureFinding } from '../../../../research-harness/research-figures-lint.mjs'
import {
  PAGE_FRAME_ID,
  type FigureElement
} from '../../../../research-harness/research-figures-model.mjs'

// Why 144: the PDF page is the page frame at 144 scene units per inch.
const UNITS_PER_INCH = 144
// Why: an export without a page frame keeps 16 units around the drawing.
const LOOSE_PADDING = 16

export type LintMark = {
  x: number
  y: number
  width: number
  height: number
  codes: string[]
  error: boolean
}

function pointsOf(element: FigureElement): [number, number][] {
  const points: unknown = Reflect.get(element, 'points')
  if (!Array.isArray(points)) {
    return []
  }
  return points.flatMap((point: unknown) =>
    Array.isArray(point) && typeof point[0] === 'number' && typeof point[1] === 'number'
      ? [[element.x + point[0], element.y + point[1]] satisfies [number, number]]
      : []
  )
}

function boundsOf(element: FigureElement) {
  const points = pointsOf(element)
  if (points.length) {
    const xs = points.map((point) => point[0])
    const ys = points.map((point) => point[1])
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys)
    }
  }
  const x = Math.min(element.x, element.x + element.width)
  const y = Math.min(element.y, element.y + element.height)
  return { x, y, right: x + Math.abs(element.width), bottom: y + Math.abs(element.height) }
}

/**
 * Where each finding's element sits on the preview, in pixels at `dpi`, one mark per element
 * with all its codes, and one per region a finding names (an empty stretch); findings about the
 * whole page or a file come back as `page` codes.
 */
export function lintMarks(
  elements: readonly FigureElement[],
  findings: { errors: FigureFinding[]; warnings: FigureFinding[] },
  dpi: number
): { marks: LintMark[]; page: string[] } {
  const live = elements.filter((element) => !element.isDeleted)
  const frame = live.find((element) => element.id === PAGE_FRAME_ID)
  const all = live.filter((element) => element.type !== 'frame').map(boundsOf)
  const origin = frame
    ? { x: frame.x, y: frame.y }
    : {
        x: Math.min(...all.map((box) => box.x)) - LOOSE_PADDING,
        y: Math.min(...all.map((box) => box.y)) - LOOSE_PADDING
      }
  const scale = dpi / UNITS_PER_INCH
  const byId = new Map<string, LintMark>()
  const page = new Set<string>()
  const regions: LintMark[] = []
  const add = (finding: FigureFinding, error: boolean) => {
    // Why first: an empty stretch has no element; it is boxed where it lies on the page.
    if (finding.regions?.length) {
      for (const region of finding.regions) {
        regions.push({
          x: (region.x - origin.x) * scale,
          y: (region.y - origin.y) * scale,
          width: region.width * scale,
          height: region.height * scale,
          codes: [finding.code],
          error
        })
      }
      return
    }
    const element = finding.id ? live.find((item) => item.id === finding.id) : undefined
    if (!element || element.id === PAGE_FRAME_ID) {
      page.add(finding.code)
      return
    }
    const known = byId.get(element.id)
    if (known) {
      known.codes = [...new Set([...known.codes, finding.code])]
      known.error ||= error
      return
    }
    const box = boundsOf(element)
    byId.set(element.id, {
      x: (box.x - origin.x) * scale,
      y: (box.y - origin.y) * scale,
      width: (box.right - box.x) * scale,
      height: (box.bottom - box.y) * scale,
      codes: [finding.code],
      error
    })
  }
  findings.errors.forEach((finding) => add(finding, true))
  findings.warnings.forEach((finding) => add(finding, false))
  return { marks: [...byId.values(), ...regions], page: [...page] }
}

/**
 * A copy of the preview with a red box around each element the lint names and its codes
 * beside it: solid for errors, dashed for warnings; page-wide codes along the top.
 */
export function drawLintMarks(
  source: HTMLCanvasElement,
  marks: { marks: LintMark[]; page: string[] },
  dpi: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('No 2D canvas to mark the lint findings on.')
  }
  context.drawImage(source, 0, 0)
  const unit = dpi / 150
  const pad = 4 * unit
  context.font = `600 ${Math.round(13 * unit)}px Helvetica, Arial, sans-serif`
  context.textBaseline = 'top'
  const tag = (text: string, x: number, y: number) => {
    const width = context.measureText(text).width + 8 * unit
    const height = 18 * unit
    const left = Math.max(0, Math.min(x, canvas.width - width))
    const top = Math.max(0, Math.min(y, canvas.height - height))
    context.fillStyle = '#ffffff'
    context.fillRect(left, top, width, height)
    context.strokeStyle = '#d00000'
    context.lineWidth = 1.5 * unit
    context.setLineDash([])
    context.strokeRect(left, top, width, height)
    context.fillStyle = '#d00000'
    context.fillText(text, left + 4 * unit, top + 3 * unit)
  }
  for (const mark of marks.marks) {
    context.strokeStyle = '#d00000'
    context.lineWidth = 2 * unit
    context.setLineDash(mark.error ? [] : [6 * unit, 4 * unit])
    context.strokeRect(mark.x - pad, mark.y - pad, mark.width + pad * 2, mark.height + pad * 2)
    tag(mark.codes.join(', '), mark.x - pad, mark.y - pad - 20 * unit)
  }
  if (marks.page.length) {
    tag(`page: ${marks.page.join(', ')}`, 4 * unit, 4 * unit)
  }
  return canvas
}
