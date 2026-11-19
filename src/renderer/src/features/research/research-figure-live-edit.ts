import { flushSync } from 'react-dom'
import { CaptureUpdateAction, newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

type Scene = readonly ExcalidrawElement[]
type Settle = (elements: Scene, selected?: ReadonlySet<string>) => ExcalidrawElement[]
type Capture = (typeof CaptureUpdateAction)[keyof typeof CaptureUpdateAction]
/** The two calls a live edit makes; Excalidraw's API fits, and so does a test's stand-in. */
type Api = {
  getSceneElementsIncludingDeleted: () => Scene
  updateScene: (scene: { elements: Scene; captureUpdate: Capture }) => void
}

function geometryOf(element: ExcalidrawElement) {
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    ...('points' in element ? { points: element.points } : {})
  }
}

function sameGeometry(a: ExcalidrawElement, b: ExcalidrawElement): boolean {
  return JSON.stringify(geometryOf(a)) === JSON.stringify(geometryOf(b))
}

/**
 * A drag on one of Aster's handles (a gap, a connector segment) that moves things live and ends
 * as one undo step. Each move is applied unrecorded; at the end the scene goes back to where it
 * started (unrecorded, with newer versions so nothing reads as older) and the final edit is
 * recorded from there. Excalidraw's deferred capture cannot do this: other unrecorded updates in
 * between take part of the drag out of its undo step.
 */
export function startLiveEdit(api: Api, settleEdit: Settle, selected: ReadonlySet<string>) {
  const start = new Map(
    api.getSceneElementsIncludingDeleted().map((element) => [element.id, element])
  )
  const apply = (edit: (scene: Scene) => ExcalidrawElement[], capture: 'NEVER' | 'IMMEDIATELY') => {
    api.updateScene({
      elements: settleEdit(edit(api.getSceneElementsIncludingDeleted()), selected),
      captureUpdate: CaptureUpdateAction[capture]
    })
  }
  const restore = (): void => {
    const back = api.getSceneElementsIncludingDeleted().map((element) => {
      const was = start.get(element.id)
      return was && !sameGeometry(was, element) ? newElementWith(element, geometryOf(was)) : element
    })
    // Why flushSync: Excalidraw commits its undo snapshot when it renders, so this unrecorded
    // step must render before the recorded one, or both land as one diff from the last move.
    flushSync(() =>
      api.updateScene({
        elements: settleEdit(back, selected),
        captureUpdate: CaptureUpdateAction.NEVER
      })
    )
  }
  return {
    preview: (edit: (scene: Scene) => ExcalidrawElement[]) => apply(edit, 'NEVER'),
    finish: (edit: (scene: Scene) => ExcalidrawElement[]) => {
      restore()
      apply(edit, 'IMMEDIATELY')
    },
    cancel: restore
  }
}
