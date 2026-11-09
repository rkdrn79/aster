import { useEffect } from 'react'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { fitFigureInView, noteViewAdjusted, viewStillFitted } from './research-figure-editor-config'

const ZOOM_KEYS = new Set(['=', '+', '-', '_', '0'])

/** Marks the view as the person's when they zoom or pan (wheel, zoom keys and buttons, hand). */
export function useViewAdjustmentTracking(apiRef: React.RefObject<ExcalidrawImperativeAPI | null>) {
  const mark = (): void => {
    if (apiRef.current) {
      noteViewAdjusted(apiRef.current)
    }
  }
  return {
    onWheel: mark,
    onKeyDown: (event: React.KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && ZOOM_KEYS.has(event.key)) {
        mark()
      }
    },
    onPointerDown: (event: React.PointerEvent): void => {
      const target = event.target instanceof Element ? event.target : null
      const tool = apiRef.current?.getAppState().activeTool.type
      if (event.button === 1 || tool === 'hand' || target?.closest('.zoom-actions')) {
        mark()
      }
    }
  }
}

/**
 * Re-fits the page when the canvas changes size (a pane opens or closes, the window resizes),
 * unless the person has zoomed or panned since the last fit.
 */
export function useFigureAutoFit(
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>,
  containerRef: React.RefObject<HTMLDivElement | null>
): void {
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    let frame = 0
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const api = apiRef.current
        if (!api) {
          return
        }
        if (viewStillFitted(api)) {
          fitFigureInView(api)
        } else {
          api.refresh()
        }
      })
    })
    observer.observe(container)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [apiRef, containerRef])
}
