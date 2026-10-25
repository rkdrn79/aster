import { PEER_PRODUCT_NAME_PATTERN } from './product-brand'

/** The markers a clipped payload carries in its own text, anchored to the end
 *  so nothing that merely looks like one inside the body can match. */
const BOUNDED_TEXT_MARKERS = [
  /\n\u2026 \(\d+ bytes\)$/,
  // Why both names: journals from before the rebrand, or an older host's, carry the upstream one.
  new RegExp(
    `\\n\\[${PEER_PRODUCT_NAME_PATTERN}: output truncated \\u2014 \\d+ bytes total, digest [0-9a-f]+\\]$`
  )
]

/** Recovers the clipped body from a bounded payload's text, and says whether a
 *  marker was there. A reader that treats the text as content renders the
 *  marker as a line of it — with a line number, which reads as a real position
 *  in the file — and reports the body as complete. */
export function stripBoundedTextMarker(text: string): { text: string; truncated: boolean } {
  const stripped = BOUNDED_TEXT_MARKERS.reduce((value, marker) => value.replace(marker, ''), text)
  return { text: stripped, truncated: stripped.length !== text.length }
}
