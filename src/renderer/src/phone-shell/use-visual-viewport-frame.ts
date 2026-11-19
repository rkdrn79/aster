import { useEffect, useState } from 'react'

// Why a margin: browser toolbars shrink the visual viewport too, by far less than a keyboard.
const KEYBOARD_MIN_HEIGHT = 120
// Why a tolerance: some browsers report 1.0000001 at rest.
const ZOOMED_SCALE = 1.01

export type ViewportFrame = { top: number; height: number; keyboardOpen: boolean }

export type ViewportReading = {
  innerHeight: number
  /** The layout viewport; unlike `innerHeight` on iOS, pinch zoom leaves it alone. */
  layoutHeight: number
  visual: { offsetTop: number; height: number; scale: number } | null
}

/**
 * The frame for one viewport reading. Pinch zoom shrinks the visual viewport just as a keyboard
 * does; following it would pin the shell inside the zoomed region and keep it there, so while
 * zoomed the frame holds still and only a keyboard opening or closing moves it.
 */
export function nextViewportFrame(
  previous: ViewportFrame | null,
  reading: ViewportReading
): ViewportFrame {
  const { visual } = reading
  if (!visual) {
    return { top: 0, height: reading.innerHeight, keyboardOpen: false }
  }
  if (!(visual.scale > ZOOMED_SCALE)) {
    return {
      top: visual.offsetTop,
      height: visual.height,
      keyboardOpen: reading.innerHeight - visual.height > KEYBOARD_MIN_HEIGHT
    }
  }
  const layoutHeight = Math.max(reading.innerHeight, reading.layoutHeight)
  const unzoomedHeight = Math.round(visual.height * visual.scale)
  const keyboardOpen = layoutHeight - unzoomedHeight > KEYBOARD_MIN_HEIGHT
  if (previous && previous.keyboardOpen === keyboardOpen) {
    return previous
  }
  return keyboardOpen
    ? { top: previous?.top ?? 0, height: unzoomedHeight, keyboardOpen: true }
    : { top: 0, height: layoutHeight, keyboardOpen: false }
}

function readViewport(): ViewportReading {
  const viewport = window.visualViewport
  return {
    innerHeight: window.innerHeight,
    layoutHeight: document.documentElement.clientHeight,
    visual: viewport
      ? { offsetTop: viewport.offsetTop, height: viewport.height, scale: viewport.scale }
      : null
  }
}

/**
 * The part of the page the on-screen keyboard leaves visible. iOS keeps the layout viewport
 * full height under the keyboard, so a bottom composer pinned to it would sit behind the keys.
 */
export function useVisualViewportFrame(): ViewportFrame {
  const [frame, setFrame] = useState(() => nextViewportFrame(null, readViewport()))
  useEffect(() => {
    const viewport = window.visualViewport
    const update = (): void => {
      setFrame((current) => {
        const next = nextViewportFrame(current, readViewport())
        return current.top === next.top &&
          current.height === next.height &&
          current.keyboardOpen === next.keyboardOpen
          ? current
          : next
      })
    }
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  return frame
}
