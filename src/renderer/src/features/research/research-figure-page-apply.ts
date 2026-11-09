import { CaptureUpdateAction, newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import {
  figurePage,
  figureSizeLabel
} from '../../../../research-harness/research-figures-model.mjs'
import { fitPageToContent, pageResizePatches, type ElementPatch } from './research-figure-page-size'

function applyPatches(
  api: ExcalidrawImperativeAPI,
  patches: readonly ElementPatch[],
  page: { id: string; widthIn: number; heightIn: number }
): void {
  const byId = new Map(patches.map((patch) => [patch.id, patch]))
  api.updateScene({
    elements: api.getSceneElementsIncludingDeleted().map((element) => {
      const patch = byId.get(element.id)
      if (!patch) {
        return element
      }
      const { id: _id, points, ...geometry } = patch
      if (element.id === page.id && element.type === 'frame') {
        return newElementWith(element, {
          ...geometry,
          name: `Figure · ${figureSizeLabel(page.widthIn, page.heightIn)}`,
          customData: {
            ...element.customData,
            asterPage: {
              ...element.customData?.asterPage,
              widthIn: page.widthIn,
              heightIn: page.heightIn
            }
          }
        })
      }
      return (element.type === 'arrow' || element.type === 'line' || element.type === 'freedraw') &&
        points
        ? newElementWith(element, { ...geometry, points })
        : newElementWith(element, geometry)
    }),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY
  })
}

/** Gives the page a new printed size in one undo step; see `pageResizePatches` for the modes. */
export function applyPageSize(
  api: ExcalidrawImperativeAPI,
  next: { widthIn: number; heightIn: number },
  mode: 'keep' | 'scale'
): boolean {
  const page = figurePage(api.getSceneElements())
  if (!page) {
    return false
  }
  applyPatches(api, pageResizePatches(api.getSceneElements(), page, next, mode), {
    id: page.id,
    ...next
  })
  return true
}

/** Fits the page's height to the drawing; false when the page is empty. */
export function fitPageHeight(api: ExcalidrawImperativeAPI): number | null {
  const page = figurePage(api.getSceneElements())
  const fit = page ? fitPageToContent(api.getSceneElements(), page) : null
  if (!page || !fit) {
    return null
  }
  applyPatches(api, [{ id: page.id, y: fit.y, height: fit.height }], {
    id: page.id,
    widthIn: page.widthIn,
    heightIn: fit.heightIn
  })
  return fit.heightIn
}
