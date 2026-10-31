import { useEffect, useState } from 'react'

// Why a margin: browser toolbars shrink the visual viewport too, by far less than a keyboard.
const KEYBOARD_MIN_HEIGHT = 120

type ViewportFrame = { top: number; height: number; keyboardOpen: boolean }

function readFrame(): ViewportFrame {
  const viewport = window.visualViewport
  return viewport
    ? {
        top: viewport.offsetTop,
        height: viewport.height,
        keyboardOpen: window.innerHeight - viewport.height > KEYBOARD_MIN_HEIGHT
      }
    : { top: 0, height: window.innerHeight, keyboardOpen: false }
}

/**
 * The part of the page the on-screen keyboard leaves visible. iOS keeps the layout viewport
 * full height under the keyboard, so a bottom composer pinned to it would sit behind the keys.
 */
export function useVisualViewportFrame(): ViewportFrame {
  const [frame, setFrame] = useState(readFrame)
  useEffect(() => {
    const viewport = window.visualViewport
    const update = (): void => {
      const next = readFrame()
      setFrame((current) =>
        current.top === next.top &&
        current.height === next.height &&
        current.keyboardOpen === next.keyboardOpen
          ? current
          : next
      )
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
