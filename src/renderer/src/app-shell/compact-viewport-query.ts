// Why: the exact complement of Tailwind's `md` breakpoint, so `md:` classes and phone layouts agree.
const COMPACT_VIEWPORT_QUERY = 'not all and (min-width: 48rem)'

// Why: a phone turned sideways is wider than `md` but still a phone, so the web client also asks
// for a touch screen that is short; a narrowed desktop window or a tablet keeps its layout.
const PHONE_LANDSCAPE_QUERY = '(pointer: coarse) and (max-height: 500px)'

/** The phone-layout query; only the web client counts a sideways phone as one. */
export function compactViewportQuery(webClient: boolean): string {
  return webClient ? `${COMPACT_VIEWPORT_QUERY}, ${PHONE_LANDSCAPE_QUERY}` : COMPACT_VIEWPORT_QUERY
}
