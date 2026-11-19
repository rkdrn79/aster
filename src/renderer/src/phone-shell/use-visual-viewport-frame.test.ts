import { describe, expect, it } from 'vitest'
import { nextViewportFrame, type ViewportReading } from './use-visual-viewport-frame'

const PHONE = 844

function reading(visual: { offsetTop?: number; height: number; scale?: number }): ViewportReading {
  return {
    innerHeight: PHONE,
    layoutHeight: PHONE,
    visual: { offsetTop: visual.offsetTop ?? 0, height: visual.height, scale: visual.scale ?? 1 }
  }
}

describe('nextViewportFrame', () => {
  it('follows the keyboard at normal scale', () => {
    const rest = nextViewportFrame(null, reading({ height: PHONE }))
    expect(rest).toEqual({ top: 0, height: PHONE, keyboardOpen: false })
    const typing = nextViewportFrame(rest, reading({ offsetTop: 40, height: 500 }))
    expect(typing).toEqual({ top: 40, height: 500, keyboardOpen: true })
    expect(nextViewportFrame(typing, reading({ height: PHONE }))).toEqual(rest)
  })

  it('keeps the frame while pinch-zoomed instead of shrinking into the zoomed region', () => {
    const rest = nextViewportFrame(null, reading({ height: PHONE }))
    // Why 2x: iOS also reports a zoomed innerHeight, which the layout height corrects.
    const zoomed = nextViewportFrame(rest, {
      innerHeight: PHONE / 2,
      layoutHeight: PHONE,
      visual: { offsetTop: 300, height: PHONE / 2, scale: 2 }
    })
    expect(zoomed).toBe(rest)
  })

  it('still notices the keyboard closing while zoomed', () => {
    const typing = nextViewportFrame(null, reading({ offsetTop: 40, height: 500 }))
    const zoomedTyping = nextViewportFrame(
      typing,
      reading({ offsetTop: 120, height: 250, scale: 2 })
    )
    expect(zoomedTyping).toBe(typing)
    const closed = nextViewportFrame(
      zoomedTyping,
      reading({ offsetTop: 120, height: 422, scale: 2 })
    )
    expect(closed).toEqual({ top: 0, height: PHONE, keyboardOpen: false })
  })

  it('uses the window height when the browser has no visual viewport', () => {
    expect(nextViewportFrame(null, { innerHeight: 700, layoutHeight: 700, visual: null })).toEqual({
      top: 0,
      height: 700,
      keyboardOpen: false
    })
  })
})
