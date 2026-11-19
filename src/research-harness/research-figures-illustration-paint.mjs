// Colour roles for illustrations: every painted shape names a role (accent, a neutral step, a
// material) and a tone on that role's ramp, so the figure's palette and the person's accent
// repaint an illustration without touching its drawing. Pure, so the app re-inks with it too.
import { hexToOklch, oklchToHex } from './research-figures-palette.mjs'
import { SEMANTIC_COLORS } from './research-figures-style.mjs'

/** Lightness of the twelve tones every ramp has, light to dark (OKLCH L). */
export const TONE_L = [0.975, 0.935, 0.885, 0.83, 0.765, 0.695, 0.62, 0.54, 0.46, 0.38, 0.31, 0.24]
/** Share of a ramp's chroma at each tone: pale and deep tones carry less colour. */
const TONE_C = [0.14, 0.28, 0.42, 0.56, 0.7, 0.84, 0.95, 1, 0.95, 0.85, 0.7, 0.55]
export const TONES = TONE_L.length

/**
 * Materials: a hue and a peak chroma each, low enough to read as a material rather than a
 * colour that means something (the lint counts only `accent`, `second`, `good` and `bad`).
 */
export const MATERIALS = {
  metal: { h: 250, C: 0.016 },
  skin: { h: 55, C: 0.085 },
  hair: { h: 45, C: 0.045 },
  wood: { h: 70, C: 0.07 },
  leaf: { h: 145, C: 0.075 }
}

/** Skin tones, as tone shifts on the skin ramp; one per figure, chosen by the person. */
export const SKIN_TONES = { light: 0, medium: 2, deep: 5 }

/** Roles an illustration may paint with (beside white, ink and none). */
export const ILLUSTRATION_ROLES = [
  'accent',
  'second',
  'third',
  'fourth',
  'neutral',
  'good',
  'bad',
  ...Object.keys(MATERIALS)
]

/**
 * The house styles: how outlines, shading and corners look, the same for every asset placed
 * in one figure so mixed sources read as one hand.
 * - `flat`: no outlines; a surface turned from the light one or two tones darker in its hue.
 * - `tonal`: a thin outline one shade darker in the surface's own hue, two tones.
 * - `line`: ink outlines at 0.6 pt over light flat fills, the textbook look.
 * - `mono`: ink lines only, white fills: for a print-mono figure.
 */
export const ILLUSTRATION_STYLES = {
  flat: { outline: 'none', shading: 'three-tone', strokePt: 0.75, lift: 0 },
  tonal: { outline: 'tonal', shading: 'two-tone', strokePt: 0.5, lift: 0 },
  line: { outline: 'ink', shading: 'one-face', strokePt: 0.6, lift: -1 },
  mono: { outline: 'ink', shading: 'flat', strokePt: 0.6, lift: 'white' }
}
export const DEFAULT_ILLUSTRATION_STYLE = 'flat'

/** A ramp of TONES hex colours on one hue: `C` is the peak chroma, `shift` moves every tone. */
export function rampFor(h, C, { tinted = 0 } = {}) {
  return TONE_L.map((L, tone) => oklchToHex({ L, C: tinted ? tinted : C * TONE_C[tone], h }))
}

const peak = (hex, fallback = 0.13) => {
  const color = hexToOklch(hex)
  return color
    ? { h: color.h, C: Math.max(0.05, Math.min(0.16, color.C)) }
    : { h: 250, C: fallback }
}

/** The second hue beside an accent: warm beside a cool accent, blue beside a warm one. */
export function secondHue(accentHue) {
  return accentHue >= 150 && accentHue <= 320 ? 70 : 245
}

/** A ramp for a role target: a role name, a figure colour role (`accent-strong`) or a `#hex`. */
function targetRamp(target, base) {
  if (typeof target === 'string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(target)) {
    const { h, C } = peak(target)
    return rampFor(h, C)
  }
  return base[target] ?? null
}

/**
 * Every role's ramp in a figure style: the accent and second from the figure's own accents,
 * neutrals from its grays (slate stays slate), good and bad from the right and wrong roles.
 * `roles` maps a role to another (`{ accent: 'second' }`) or to a `#hex`.
 */
export function illustrationPalette(style, { roles = {}, skin = 'light' } = {}) {
  const accent = peak(style?.accents?.[0]?.solid ?? '#2784d5')
  const secondAccent = style?.accents?.[1]?.solid
  const second = secondAccent ? peak(secondAccent) : { h: secondHue(accent.h), C: 0.12 }
  const block = hexToOklch(style?.block ?? '#e9e9e9') ?? { h: 0, C: 0 }
  // Why: a world's machinery (c) and given (d) hues; a quiet preset has none, so they stay gray.
  const [third, fourth] = [2, 3].map((index) => {
    const solid = style?.accents?.[index]?.solid
    return solid && style.accents[index].name !== 'frozen' ? peak(solid) : null
  })
  const neutral = rampFor(block.h, Math.min(block.C * 2.4, 0.03))
  const base = {
    accent: rampFor(accent.h, accent.C),
    second: rampFor(second.h, second.C),
    third: third ? rampFor(third.h, third.C) : neutral,
    fourth: fourth ? rampFor(fourth.h, fourth.C) : neutral,
    // Why the block's own hue: slate and tonal grays are tinted, and the drawing must match.
    neutral,
    good: rampFor(peak(SEMANTIC_COLORS.good.solid).h, 0.13),
    bad: rampFor(peak(SEMANTIC_COLORS.bad.solid).h, 0.14)
  }
  for (const [name, material] of Object.entries(MATERIALS)) {
    base[name] = rampFor(material.h, material.C)
  }
  const shift = SKIN_TONES[skin] ?? 0
  base.skin = base.skin.map((_, tone) => base.skin[Math.min(TONES - 1, tone + shift)])
  const ramps = { ...base }
  for (const [role, target] of Object.entries(roles ?? {})) {
    const ramp = targetRamp(target, base)
    if (ramp && Object.hasOwn(base, role)) {
      ramps[role] = ramp
    }
  }
  return {
    ramps,
    ink: style?.ink ?? '#1e1e1e',
    white: '#ffffff'
  }
}

/**
 * Tone steps a face takes for 0, 1 or 2 shade steps (lit, side, turned away): three tones
 * for flat drawings (top t, lit side t+1, shade side t+3), one shaded face for line art.
 */
export const SHADINGS = {
  'three-tone': [0, 1, 3],
  'two-tone': [0, 1, 1],
  'one-face': [0, 0, 1],
  flat: [0, 0, 0]
}

/** Tone after shading: `shade` 0–2 steps under the look's shading. */
export function shadedTone(tone, shade, shading = 'three-tone') {
  const steps = SHADINGS[shading] ?? SHADINGS['three-tone']
  const step = steps[Math.max(0, Math.min(2, shade))]
  return Math.max(0, Math.min(TONES - 1, tone + step))
}

const HEX_ROLE = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i
const hexRamps = new Map()

/** The ramp a role paints on: the palette's, a `#hex` role's own (its hue, every tone), or neutral. */
function rampOf(palette, role) {
  if (palette.ramps[role]) {
    return palette.ramps[role]
  }
  if (HEX_ROLE.test(role)) {
    if (!hexRamps.has(role)) {
      const { h, C } = peak(role)
      hexRamps.set(role, rampFor(h, C))
    }
    return hexRamps.get(role)
  }
  return palette.ramps.neutral
}

/** A paint's hex: `role.tone` with its shade, `white`, `ink` or `none`; a role may be a `#hex`. */
export function paintHex(palette, role, tone = 2, shade = 0, look = {}) {
  if (role === 'none') {
    return 'none'
  }
  if (role === 'white' || (look.lift === 'white' && role !== 'ink')) {
    return palette.white
  }
  if (role === 'ink') {
    return palette.ink
  }
  const ramp = rampOf(palette, role)
  const lifted = typeof look.lift === 'number' ? tone + look.lift : tone
  return ramp[shadedTone(Math.max(0, lifted), shade, look.shading ?? 'three-tone')]
}

/** An outline's hex for a shape painted `role.tone`, by the house style's outline rule. */
export function outlineHex(palette, role, tone, look) {
  if (look.outline === 'none') {
    return 'none'
  }
  if (look.outline === 'ink' || role === 'ink') {
    return palette.ink
  }
  // Why tonal: an outline in the surface's own hue, darker, reads as one drawn object.
  const ramp = role === 'white' ? palette.ramps.neutral : rampOf(palette, role)
  return ramp[Math.min(TONES - 1, Math.max(tone + 5, 7))]
}

const ATTRIBUTE = /\s([a-zA-Z:-]+)="([^"]*)"/g
const PAINTED = /<(path|circle|ellipse|rect|polygon|polyline|line)\b([^>]*?)(\/?)>/g

function attributes(text) {
  return Object.fromEntries([...text.matchAll(ATTRIBUTE)].map((match) => [match[1], match[2]]))
}

/** The look recorded on an illustration SVG's root (`data-look`), or the named style. */
export function illustrationLook(svg) {
  const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? ''
  const name = attributes(root)['data-look']
  return { name: name ?? null, ...(ILLUSTRATION_STYLES[name] ?? ILLUSTRATION_STYLES.flat) }
}

/** Seams between touching faces of a flat drawing: a hairline in the face's own colour. */
const SEAM_PT = 0.25

/**
 * Repaints a role-tagged illustration SVG (as the kit writes it): each shape's `data-r` role
 * and `data-t` tone (with `data-s` shade) give its fill, `data-o` an outline by the house
 * style's rule, `data-sr`/`data-st` a stroke paint; widths follow the root's `data-ppt`
 * (viewBox units per printed pt). `look` switches the house style. Untagged shapes stay.
 */
export function paintIllustrationSvg(svg, palette, { look: lookName } = {}) {
  const look = lookName
    ? { name: lookName, ...ILLUSTRATION_STYLES[lookName] }
    : illustrationLook(svg)
  const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? ''
  const perPt = Number(attributes(root)['data-ppt'] ?? 1) || 1
  const width = (pt) => String(Math.round(pt * perPt * 100) / 100)
  const withLook = lookName
    ? svg.replace(/(<svg\b[^>]*?\sdata-look=")[^"]*(")/, `$1${lookName}$2`)
    : svg
  return withLook.replace(PAINTED, (whole, tag, body, close) => {
    const attrs = attributes(body)
    if (!('data-r' in attrs) && !('data-sr' in attrs) && !('data-e' in attrs)) {
      return whole
    }
    const tone = Number(attrs['data-t'] ?? 2)
    const shade = Number(attrs['data-s'] ?? 0)
    const weight = Number(attrs['data-w'] ?? 1)
    const next = { ...attrs }
    if ('data-r' in attrs) {
      next.fill = paintHex(palette, attrs['data-r'], tone, shade, look)
      const outline =
        'data-o' in attrs ? outlineHex(palette, attrs['data-r'], tone + shade, look) : 'none'
      if (attrs['data-k'] === 'shadow' && look.lift === 'white') {
        // Why: a line drawing has no shading, so a cast shadow would print as a blot.
        next.fill = 'none'
        next.stroke = 'none'
        next['stroke-width'] = '0'
      } else if (outline !== 'none') {
        next.stroke = outline
        next['stroke-width'] = width(look.strokePt * weight)
      } else if (look.lift === 'white' && attrs['data-k'] === 'decal') {
        // Why: in white-only line art a detail (a screen, a label) shows only by its outline.
        next.stroke = palette.ink
        next['stroke-width'] = width(look.strokePt * 0.7)
      } else if ('data-seam' in attrs && next.fill !== 'none') {
        next.stroke = next.fill
        next['stroke-width'] = width(SEAM_PT)
      } else {
        next.stroke = 'none'
        next['stroke-width'] = '0'
      }
    }
    if ('data-e' in attrs) {
      const edge = outlineHex(palette, attrs['data-e'], tone, look)
      next.stroke = edge
      next['stroke-width'] = edge === 'none' ? '0' : width(look.strokePt * weight)
    }
    if ('data-sr' in attrs) {
      next.stroke =
        look.lift === 'white' && attrs['data-sr'] !== 'none'
          ? palette.ink
          : paintHex(palette, attrs['data-sr'], Number(attrs['data-st'] ?? 6), 0, {
              ...look,
              lift: 0
            })
      next['stroke-width'] = width(look.strokePt * weight)
    }
    const text = Object.entries(next)
      .map(([key, value]) => ` ${key}="${value}"`)
      .join('')
    return `<${tag}${text}${close}>`
  })
}

/** The hexes an illustration SVG paints with, for the lint's hue count. */
export function svgColors(svg) {
  return [
    ...new Set(
      [...String(svg).matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/gi)].map((m) => m[1].toLowerCase())
    )
  ]
}
