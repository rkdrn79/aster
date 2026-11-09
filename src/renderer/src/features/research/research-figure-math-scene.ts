import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  newElementWith
} from '@excalidraw/excalidraw'
import type {
  ExcalidrawElement,
  ExcalidrawImageElement,
  ExcalidrawTextElement
} from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { readFigureMath, typesetFigureMath, type TypesetMath } from './research-figure-math'
import { asFileId, binaryFile } from './research-figure-svg-files'

export type FigureMath = { tex: string; size: number; color: string }
/** Runs settling over a proposed scene so the edit and what follows it are one undo step. */
export type SettleEdit = (elements: readonly ExcalidrawElement[]) => ExcalidrawElement[]

function addMathFile(api: ExcalidrawImperativeAPI, typeset: TypesetMath): void {
  api.addFiles([binaryFile(typeset.fileId, 'image/svg+xml', typeset.dataURL)])
}

function commit(
  api: ExcalidrawImperativeAPI,
  elements: readonly ExcalidrawElement[],
  settle: SettleEdit,
  select: string | null
): void {
  api.updateScene({
    elements: settle(elements),
    ...(select
      ? { appState: { selectedElementIds: { [select]: true }, selectedGroupIds: {} } }
      : {}),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY
  })
}

export async function readMathOf(
  api: ExcalidrawImperativeAPI,
  image: ExcalidrawImageElement
): Promise<FigureMath | null> {
  const file = image.fileId ? api.getFiles()[image.fileId] : undefined
  return readFigureMath(image, file?.dataURL)
}

/**
 * Re-typesets a math image in place: same id, same pen position and baseline, new picture and
 * size. Throws (and changes nothing) when the TeX does not typeset.
 */
export async function applyFigureMath(
  api: ExcalidrawImperativeAPI,
  imageId: string,
  next: FigureMath,
  settle: SettleEdit
): Promise<void> {
  const image = api.getSceneElements().find((element) => element.id === imageId)
  if (image?.type !== 'image') {
    throw new Error('The math label is gone.')
  }
  const before = await readMathOf(api, image)
  const typeset = await typesetFigureMath(next.tex, next.size, next.color)
  const old = before
    ? await typesetFigureMath(before.tex, before.size, before.color).catch(() => null)
    : null
  const baseline = image.y + (old ? old.ascent : image.height)
  const pen = image.x - (old ? old.left : 0)
  addMathFile(api, typeset)
  const elements = api.getSceneElementsIncludingDeleted().map((element) =>
    element.id === imageId && element.type === 'image'
      ? newElementWith(element, {
          fileId: asFileId(typeset.fileId),
          x: pen + typeset.left,
          y: baseline - typeset.ascent,
          width: typeset.width,
          height: typeset.height,
          status: 'saved',
          customData: { ...element.customData, asterMath: next.tex, asterTex: true }
        })
      : element
  )
  commit(api, elements, settle, null)
}

/** A new math image with its baseline at `at`, selected. */
export async function insertFigureMath(
  api: ExcalidrawImperativeAPI,
  at: { x: number; baseline: number; groupIds?: readonly string[] },
  next: FigureMath,
  settle: SettleEdit,
  replacing: string | null = null
): Promise<string> {
  const typeset = await typesetFigureMath(next.tex, next.size, next.color)
  addMathFile(api, typeset)
  const [image] = convertToExcalidrawElements([
    {
      type: 'image',
      x: at.x + typeset.left,
      y: at.baseline - typeset.ascent,
      width: typeset.width,
      height: typeset.height,
      fileId: asFileId(typeset.fileId),
      status: 'saved',
      strokeColor: 'transparent',
      groupIds: [...(at.groupIds ?? [])],
      customData: { asterMath: next.tex, asterTex: true }
    }
  ])
  const kept = api
    .getSceneElementsIncludingDeleted()
    .map((element) =>
      element.id === replacing ? newElementWith(element, { isDeleted: true }) : element
    )
  commit(api, [...kept, image], settle, image.id)
  return image.id
}

/** Replaces a text element holding `$…$` with the same words typeset as math. */
export async function typesetTextAsMath(
  api: ExcalidrawImperativeAPI,
  text: ExcalidrawTextElement,
  tex: string,
  settle: SettleEdit
): Promise<string> {
  // Why 0.8: the label font's baseline sits about 0.8 of its size below the line top.
  const baseline =
    text.y + text.fontSize * 0.8 + (text.height - text.fontSize * text.lineHeight) / 2
  return insertFigureMath(
    api,
    { x: text.x, baseline, groupIds: text.groupIds },
    { tex, size: text.fontSize, color: text.strokeColor },
    settle,
    text.id
  )
}
