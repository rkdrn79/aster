// Math typeset by MathJax (vendored, Apache-2.0) as SVG paths: serif italic symbols and proper
// scripts like LaTeX, with no fonts to install and vector in PDF exports. Node only; drawing
// falls back to text runs when MathJax cannot load.
import { createHash } from 'node:crypto'

// Why larger than the label size: TeX's x-height (0.44 em) is smaller than Liberation Sans'
// (0.52 em), so math at the same size would look a step smaller than the words beside it.
const MATH_SCALE = 1.12

/**
 * `renderTex(tex, size, color)` → { fileId, width, ascent, descent } in scene units, with the SVG
 * kept for `svgFor(fileId)`; null when MathJax is unavailable.
 */
export async function loadTexRenderer() {
  let module
  try {
    module = await import('./vendor/mathjax/tex-svg.mjs')
  } catch {
    return null
  }
  const svgs = new Map()
  const cache = new Map()
  const renderTex = (tex, size, color = '#1e1e1e') => {
    const key = `${tex}\u0000${size}\u0000${color}`
    if (cache.has(key)) {
      return cache.get(key)
    }
    const raw = module.texToSvg(String(tex))
    const error = /data-mjx-error="([^"]*)"/.exec(raw)
    if (error) {
      throw new Error(`TeX error in ${JSON.stringify(tex)}: ${error[1]}`)
    }
    const [vx, vy, vw, vh] = /viewBox="([^"]+)"/.exec(raw)[1].split(/\s+/).map(Number)
    const scale = (size * MATH_SCALE) / 1000
    const width = vw * scale
    const ascent = -vy * scale
    const descent = (vh + vy) * scale
    const svg = raw
      .replace(/ style="[^"]*"/, '')
      .replace(/ width="[^"]*"/, ` width="${width.toFixed(2)}"`)
      .replace(/ height="[^"]*"/, ` height="${(ascent + descent).toFixed(2)}"`)
      .replace(/ role="img" focusable="false"/, '')
      .replaceAll('currentColor', color)
    const fileId = `aster-tex-${createHash('sha256').update(svg).digest('hex').slice(0, 16)}`
    svgs.set(fileId, svg)
    const box = { fileId, width, ascent, descent, x: vx * scale }
    cache.set(key, box)
    return box
  }
  return { renderTex, svgFor: (fileId) => svgs.get(fileId) ?? null }
}
