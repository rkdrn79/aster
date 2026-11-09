// Sizing shared by the stacked templates (transformer, DiT): fill a height without empty boxes.

/**
 * Fits a stacked template to `spec.h`: the gaps take 20–32 units first (an arrow with a shaft,
 * not a hole in the stack), then the blocks grow or shrink (0.8–1.4×) to fill the rest, so the
 * drawn height is the height asked for. Returns the block scale and the gap.
 */
export function fitStack(spec, { fixed, boxes, gaps, gap = 20 }) {
  const natural = fixed + boxes.reduce((sum, h) => sum + h, 0) + gaps * gap
  if (spec.h === undefined || Math.abs(spec.h - natural) < 1) {
    return { k: 1, gap }
  }
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value))
  const room = spec.h - fixed
  const sum = boxes.reduce((total, h) => total + h, 0)
  const wanted = clamp((room - sum) / gaps, 20, 32)
  const k = clamp((room - gaps * wanted) / sum, 0.8, 1.4)
  // Why 16 at least: an arrow between stacked blocks must still show a shaft; 44 at most: longer
  // arrows read as gaps in the stack (widen the page's other content instead).
  return { k, gap: Math.round(clamp((room - sum * k) / gaps, 16, 44)) }
}
