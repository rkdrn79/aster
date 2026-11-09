import { PAGE_FRAME_ID } from '../../../../research-harness/research-figures-model.mjs'
import type { SceneBox } from './ResearchFigureCanvasOverlays'

type BoundsElement = {
  readonly id: string
  readonly type: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly isDeleted?: boolean
  readonly points?: readonly (readonly [number, number])[]
  readonly customData?: Readonly<Record<string, unknown>> | null
}

/** What an element covers; a line's own points, which its width and height may not start at. */
export function elementBox(element: BoundsElement): SceneBox {
  if (element.points?.length) {
    const xs = element.points.map((point) => element.x + point[0])
    const ys = element.points.map((point) => element.y + point[1])
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
  }
  return { x: element.x, y: element.y, width: element.width, height: element.height }
}

/** The page frame and the ids of what reaches past it (what would be cut off in print). */
export function elementsOutsidePage(elements: readonly BoundsElement[]): {
  page: SceneBox | null
  outside: string[]
} {
  const frame = elements.find(
    (element) =>
      !element.isDeleted &&
      element.type === 'frame' &&
      (element.id === PAGE_FRAME_ID || element.customData?.asterPage !== undefined)
  )
  if (!frame) {
    return { page: null, outside: [] }
  }
  const page = { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
  const tolerance = 0.5
  const outside = elements
    .filter((element) => !element.isDeleted && element.type !== 'frame')
    .filter((element) => {
      const box = elementBox(element)
      return (
        box.x < page.x - tolerance ||
        box.y < page.y - tolerance ||
        box.x + box.width > page.x + page.width + tolerance ||
        box.y + box.height > page.y + page.height + tolerance
      )
    })
    .map((element) => element.id)
  return { page, outside }
}
