import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

/**
 * Keeps the list's `--segment-x/y/w/h` on its selected child, so one highlight can slide between
 * tabs or segments instead of each item painting its own. The list must be positioned (`relative`).
 * `data-segment-indicator` is `placed` for the first frame (no slide in from the corner) and
 * `ready` after; items hide their own selected background while it is set. A new selection moves
 * by transform only: the box takes the new size at once, starts over the old item through
 * `--segment-sx/sy`, and settles (motion.css).
 */
type SegmentBox = { item: HTMLElement; x: number; y: number; w: number; h: number }

export function useSegmentIndicator<T extends HTMLElement>(
  selectedSelector: string,
  enabled: boolean,
  forwardedRef?: React.Ref<T>
): (node: T | null) => void {
  const [list, setList] = React.useState<T | null>(null)

  React.useLayoutEffect(() => {
    if (!list || !enabled) {
      return undefined
    }
    let frame = 0
    let ready = false
    let last: SegmentBox | null = null
    const setBox = (box: SegmentBox, from: SegmentBox): void => {
      list.style.setProperty('--segment-x', `${from.x}px`)
      list.style.setProperty('--segment-y', `${from.y}px`)
      list.style.setProperty('--segment-w', `${box.w}px`)
      list.style.setProperty('--segment-h', `${box.h}px`)
      list.style.setProperty('--segment-sx', String(from.w / box.w))
      list.style.setProperty('--segment-sy', String(from.h / box.h))
    }
    const place = (): void => {
      const selected = list.querySelector<HTMLElement>(`:scope > ${selectedSelector}`)
      if (!selected || selected.offsetWidth === 0) {
        ready = false
        last = null
        list.removeAttribute('data-segment-indicator')
        return
      }
      const box: SegmentBox = {
        item: selected,
        x: selected.offsetLeft,
        y: selected.offsetTop,
        w: selected.offsetWidth,
        h: selected.offsetHeight
      }
      if (ready && last && last.item !== selected && box.h > 0) {
        // Why: start over the old item with transitions off, flush, then let the transform settle.
        list.setAttribute('data-segment-indicator', 'placed')
        setBox(box, last)
        void list.offsetWidth
        list.setAttribute('data-segment-indicator', 'ready')
      }
      setBox(box, box)
      last = box
      if (!ready) {
        list.setAttribute('data-segment-indicator', 'placed')
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => {
          ready = true
          list.setAttribute('data-segment-indicator', 'ready')
        })
      }
    }
    // Why the stand-in: jsdom has no ResizeObserver; the selection still follows data-state.
    const resize: Pick<ResizeObserver, 'observe' | 'disconnect'> =
      typeof ResizeObserver === 'undefined'
        ? { observe: () => undefined, disconnect: () => undefined }
        : new ResizeObserver(place)
    const mutations = new MutationObserver(place)
    mutations.observe(list, {
      subtree: true,
      childList: true,
      attributes: true,
      // Why the aria states: radio groups and nav lists mark their choice there, not in data-state.
      attributeFilter: ['data-state', 'aria-checked', 'aria-current']
    })
    // Labels can change width without the list changing, so watch each item too.
    resize.observe(list)
    for (const child of list.children) {
      resize.observe(child)
    }
    place()
    return () => {
      cancelAnimationFrame(frame)
      mutations.disconnect()
      resize.disconnect()
      list.removeAttribute('data-segment-indicator')
    }
  }, [list, enabled, selectedSelector])

  return React.useCallback(
    (node: T | null) => {
      setList(node)
      if (typeof forwardedRef === 'function') {
        forwardedRef(node)
      } else if (forwardedRef) {
        forwardedRef.current = node
      }
    },
    [forwardedRef]
  )
}

const segmentIndicatorVariants = cva('', {
  variants: {
    variant: {
      // A raised pill on a track: tabs and single-choice segmented controls.
      pill: 'rounded-full bg-raised shadow-raised',
      // Only the bottom edge, for line tabs.
      line: 'after:absolute after:inset-x-0 after:-bottom-[5px] after:h-0.5 after:rounded-full after:bg-foreground group-data-[orientation=vertical]/tabs:after:inset-x-auto group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:bottom-auto group-data-[orientation=vertical]/tabs:after:h-auto group-data-[orientation=vertical]/tabs:after:w-0.5'
    }
  },
  defaultVariants: { variant: 'pill' }
})

/** The sliding highlight itself; render it as the list's first child. */
export function SegmentIndicator({
  variant
}: VariantProps<typeof segmentIndicatorVariants>): React.JSX.Element {
  return (
    <span
      aria-hidden
      data-slot="segment-indicator"
      className={segmentIndicatorVariants({ variant })}
    />
  )
}
