import { ACTIVE_TAB_INDICATOR_CLASSES } from './drop-indicator'

// Where each strip's active chip last sat, in strip content coordinates.
const lastLeftByStrip = new WeakMap<Element, number>()

function leftInStrip(node: HTMLElement, strip: Element): number {
  return node.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** Slides a newly mounted chip in from the strip's last one; the cleanup records where it ends. */
function attachIndicator(node: HTMLSpanElement | null): (() => void) | undefined {
  const strip = node?.closest('.terminal-tab-strip')
  if (!node || !strip) {
    return undefined
  }
  const left = leftInStrip(node, strip)
  const previous = lastLeftByStrip.get(strip)
  lastLeftByStrip.set(strip, left)
  if (previous !== undefined && Math.abs(previous - left) >= 1 && !prefersReducedMotion()) {
    node.style.transition = 'none'
    node.style.transform = `translateX(${previous - left}px)`
    // Why the read: commit the start position before the transition is switched on.
    void node.offsetWidth
    node.style.transition = 'transform var(--duration-fast) var(--ease-out-quint)'
    node.style.transform = ''
  }
  // Why on detach: tabs closed or moved meanwhile shift this chip; the next one starts from here.
  return () => {
    if (node.isConnected) {
      lastLeftByStrip.set(strip, leftInStrip(node, strip))
    }
  }
}

/**
 * The active tab's chip. It lives inside the tab, so a docked (sticky) active tab keeps it, and on
 * mount it slides in from where the previous active tab's chip was in the same strip. A ref
 * callback, not an effect: tab tests render these components as plain functions.
 */
export function ActiveTabIndicator(): React.JSX.Element {
  return <span ref={attachIndicator} aria-hidden className={ACTIVE_TAB_INDICATOR_CLASSES} />
}
