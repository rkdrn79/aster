import { FIGURE_UNITS_PER_POINT } from '../../../../research-harness/research-figures-model.mjs'
import { readAsterMath, type MetaElement } from './research-figure-element-meta'
import { sha256Hex, textToBase64 } from './research-figure-svg-files'

// Why the kit's scale: TeX's x-height is smaller than the label font's, so math typeset at the
// label size would look a step smaller than the words beside it (see research-figures-tex.mjs).
const MATH_SCALE = 1.12
const DEFAULT_INK = '#1e1e1e'
/** The kit's label size: 8 pt. */
export const DEFAULT_MATH_SIZE = 8 * FIGURE_UNITS_PER_POINT

export type TypesetMath = {
  fileId: string
  dataURL: string
  /** Scene units; the image's width and height. */
  width: number
  height: number
  /** From the image top to the baseline, and the left bearing, in scene units. */
  ascent: number
  left: number
}

type TexToSvg = (tex: string) => string
let loading: Promise<TexToSvg> | null = null

/** MathJax as the kit vendors it, loaded on first use (it is large). */
function texToSvg(): Promise<TexToSvg> {
  loading ??= import('../../../../research-harness/vendor/mathjax/tex-svg.mjs').then(
    (module: unknown) => {
      const typeset: unknown =
        typeof module === 'object' && module !== null && 'texToSvg' in module
          ? module.texToSvg
          : null
      if (typeof typeset !== 'function') {
        throw new Error('TeX error: MathJax did not load')
      }
      return (tex: string) => String(typeset(tex))
    }
  )
  loading.catch(() => {
    loading = null
  })
  return loading
}

/**
 * TeX as the kit typesets it: an SVG of glyph paths at `size` scene units in `color`, with the
 * same file id the kit would give it. Throws `TeX error: …` for input MathJax rejects.
 */
export async function typesetFigureMath(
  tex: string,
  size: number,
  color: string
): Promise<TypesetMath> {
  if (!tex.trim()) {
    throw new Error('TeX error: nothing to typeset')
  }
  const raw = (await texToSvg())(tex)
  const error = /data-mjx-error="([^"]*)"/.exec(raw)
  if (error) {
    throw new Error(`TeX error: ${error[1]}`)
  }
  const box = /viewBox="([^"]+)"/.exec(raw)
  const [vx, vy, vw, vh] = (box?.[1] ?? '').split(/\s+/).map(Number)
  if (![vx, vy, vw, vh].every(Number.isFinite)) {
    throw new Error('TeX error: MathJax returned no picture')
  }
  const scale = (size * MATH_SCALE) / 1000
  const width = vw * scale
  const ascent = -vy * scale
  const height = vh * scale
  const svg = raw
    .replace(/ style="[^"]*"/, '')
    .replace(/ width="[^"]*"/, ` width="${width.toFixed(2)}"`)
    .replace(/ height="[^"]*"/, ` height="${height.toFixed(2)}"`)
    .replace(/ role="img" focusable="false"/, '')
    .replaceAll('currentColor', color)
  return {
    fileId: `aster-tex-${(await sha256Hex(svg)).slice(0, 16)}`,
    dataURL: `data:image/svg+xml;base64,${textToBase64(svg)}`,
    width,
    height,
    ascent,
    left: vx * scale
  }
}

/** The ink an SVG math image was typeset in. */
export function mathInk(dataURL: string | undefined): string {
  const match = dataURL ? /^data:image\/svg\+xml;base64,(.*)$/.exec(dataURL) : null
  if (!match) {
    return DEFAULT_INK
  }
  try {
    const svg = new TextDecoder().decode(
      Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0))
    )
    return /fill="(#[0-9a-fA-F]{3,8})"/.exec(svg)?.[1] ?? DEFAULT_INK
  } catch {
    return DEFAULT_INK
  }
}

/**
 * A math image's TeX, size (scene units) and ink: what it records, else measured from the image
 * (its height against the same TeX typeset at the label size).
 */
export async function readFigureMath(
  element: MetaElement & { height: number },
  dataURL: string | undefined
): Promise<{ tex: string; size: number; color: string } | null> {
  const math = readAsterMath(element)
  if (!math) {
    return null
  }
  const color = math.color ?? mathInk(dataURL)
  if (math.size) {
    return { tex: math.tex, size: math.size, color }
  }
  try {
    const probe = await typesetFigureMath(math.tex, DEFAULT_MATH_SIZE, color)
    const size = (DEFAULT_MATH_SIZE * element.height) / (probe.height || element.height || 1)
    return { tex: math.tex, size: Math.round(size * 4) / 4, color }
  } catch {
    return { tex: math.tex, size: DEFAULT_MATH_SIZE, color }
  }
}

/** `$…$` in typed text, as TeX: words stay upright text, math stays math. */
export function texFromDollars(text: string): string | null {
  if (!/\$[^$]+\$/.test(text)) {
    return null
  }
  const whole = /^\s*\$([^$]+)\$\s*$/.exec(text)
  if (whole) {
    return whole[1]
  }
  return text
    .split(/(\$[^$]+\$)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('$') && part.endsWith('$')
        ? part.slice(1, -1)
        : `\\text{${part.replace(/([{}\\])/g, '\\$1')}}`
    )
    .join('')
}
