import { useCallback } from 'react'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import {
  imageMimeType,
  insertPicture,
  isPhoto,
  readImageFile,
  replacePhoto
} from './research-figure-photo'

function pictures(transfer: DataTransfer | null): File[] {
  return [...(transfer?.files ?? [])].filter((file) => imageMimeType(file.type) !== null)
}

/**
 * Pictures dropped on the canvas: onto a photo they replace its picture (frame and crop kept);
 * anywhere else they come in at most a third of the page wide. One undo step each.
 */
export function useFigureImageDrop(
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>,
  commit: (next: readonly ExcalidrawElement[]) => void
) {
  const onDragOver = useCallback((event: React.DragEvent): void => {
    if ([...(event.dataTransfer?.items ?? [])].some((item) => item.type.startsWith('image/'))) {
      event.preventDefault()
    }
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent): void => {
      const api = apiRef.current
      const [file] = pictures(event.dataTransfer)
      if (!api || !file) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const state = api.getAppState()
      const x = (event.clientX - state.offsetLeft) / state.zoom.value - state.scrollX
      const y = (event.clientY - state.offsetTop) / state.zoom.value - state.scrollY
      const photo = api
        .getSceneElements()
        .toReversed()
        .find(
          (element) =>
            isPhoto(element) &&
            x >= element.x &&
            x <= element.x + element.width &&
            y >= element.y &&
            y <= element.y + element.height
        )
      void readImageFile(file).then((source) => {
        if (!source) {
          return
        }
        return photo
          ? replacePhoto(api, photo.id, source, commit)
          : insertPicture(api, source, { x, y }, commit)
      })
    },
    [apiRef, commit]
  )

  return { onDragOver, onDrop }
}
