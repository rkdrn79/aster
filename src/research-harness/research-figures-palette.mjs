// Figure palettes measured from 73 method figures in 51 papers (2024–25): eight presets, and the
// rule that turns any picked colour into a usable accent (tint, strong, shade, solid). OKLab /
// OKLCH (Ottosson 2020) throughout; pure, so the kit, the lint and the app share it.

/** The red a loss takes when it is asked for (`tone: 'red'`); papers mostly write it in ink. */
export const LOSS_RED = '#ba2c25'
/** The loss red's OKLCH hue; an accent this close in hue cannot sit beside a red loss. */
export const LOSS_HUE = 28
const LOSS_CLEARANCE = 35
/** How a loss is coloured: ink (the default, as most papers write it), the accent, or red. */
export const LOSS_TONES = ['ink', 'accent', 'red']

const accent = (name, role, hue, tint, strong, shade, solid, extra = {}) => ({
  name,
  role,
  hue,
  tint,
  strong,
  shade,
  solid,
  ...extra
})

/**
 * The presets: neutrals (panel, block, strong, text, line, muted), the box outline, corner
 * radius, accents with fixed roles, and the rules each one keeps.
 */
export const PALETTE_PRESETS = {
  graphite: {
    label: 'Graphite: gray blocks, one accent',
    neutrals: {
      panel: '#f4f4f4',
      block: '#e9e9e9',
      strong: '#cecece',
      text: '#1e1e1e',
      line: '#333333',
      muted: '#8c8c8c'
    },
    outline: null,
    radius: 4,
    accents: [
      accent('accent', 'the contribution', 250, '#c5def8', '#7fb0e2', '#1263a6', '#2784d5')
    ],
    rules: [
      'Blocks gray without outlines; one accent on the paper’s own module and the tokens it makes.',
      'Arrows ink; text ink on every fill.'
    ]
  },
  slate: {
    label: 'Slate: blue-gray blocks and text, one warm accent',
    neutrals: {
      panel: '#f1f5f9',
      block: '#dfe6ee',
      strong: '#c0ccd9',
      text: '#384a5a',
      line: '#303f4c',
      muted: '#828e98'
    },
    outline: null,
    radius: 6,
    accents: [
      accent(
        'accent',
        'the contribution, warm on the cool base',
        85,
        '#fff0d0',
        '#e1bb69',
        '#996000',
        '#b17000'
      )
    ],
    rules: [
      'Slate is the neutral: blocks, text and lines share one cool hue.',
      'The accent is warm (amber, ochre or clay); a blue accent disappears into the slate.'
    ]
  },
  outline: {
    label: 'Outline: white boxes, ink outlines, one tinted box',
    neutrals: {
      panel: '#f7f7f7',
      block: '#ffffff',
      strong: '#f0f0f0',
      text: '#111111',
      line: '#111111',
      muted: '#808080'
    },
    outline: '#111111',
    outlineWidth: 1.5,
    radius: 2,
    accents: [
      accent(
        'accent',
        'the contribution, outlined like every box',
        55,
        '#f9d6bf',
        '#df9d6f',
        '#974c00',
        '#c16300'
      )
    ],
    rules: [
      'Every box has a thin ink outline, never in its fill’s hue.',
      'Fills are white, one light gray for heavy modules and one tint for the contribution.'
    ]
  },
  'blue-amber': {
    label: 'Blue + amber: ours vs. given',
    neutrals: {
      panel: '#f7f7f7',
      block: '#f0f0f0',
      strong: '#c1c1c1',
      text: '#1e1e1e',
      line: '#333333',
      muted: '#8c8c8c'
    },
    outline: null,
    radius: 4,
    accents: [
      accent('primary', 'trained / ours', 252, '#bfd9f7', '#77aae3', '#175fa4', '#2f82d6'),
      accent(
        'secondary',
        'given: frozen, pretrained, data',
        82,
        '#fedfa6',
        '#d6ac5c',
        '#905700',
        '#b46e00'
      )
    ],
    rules: [
      'Two hues with fixed meanings (blue ours, amber given), named once in the caption.',
      'Everything else gray.'
    ]
  },
  'sage-butter': {
    label: 'Sage + butter (+ clay): module types, warm pastels',
    neutrals: {
      panel: '#f4f4f4',
      block: '#f0f0f0',
      strong: '#b1b1b1',
      text: '#1e1e1e',
      line: '#333333',
      muted: '#8c8c8c'
    },
    outline: null,
    radius: 3,
    accents: [
      accent(
        'primary',
        'the operation the paper is about',
        135,
        '#afd09f',
        '#77a45e',
        '#2e5e00',
        '#56932b'
      ),
      accent(
        'secondary',
        'feed-forward / given modules',
        92,
        '#fae39f',
        '#cdb25d',
        '#885c00',
        '#aa7400'
      ),
      accent('tertiary', 'conditioning, modulation', 50, '#f4cfbb', '#db956e', '#984500', '#c46016')
    ],
    rules: [
      'Hues name module types: the same type always the same hue (DiT: attention, MLP, modulation).',
      'Gray for everything without a type.'
    ]
  },
  tonal: {
    label: 'Tonal: one hue in three lightnesses',
    neutrals: {
      panel: '#f3f7fc',
      block: '#e2eefb',
      strong: '#b9d4f1',
      text: '#1e1e1e',
      line: '#333333',
      muted: '#8c8c8c'
    },
    outline: null,
    radius: 4,
    tonal: true,
    accents: [
      accent(
        'accent',
        'the one module that matters: solid shade, white text',
        250,
        '#c5def8',
        '#7fb0e2',
        '#1263a6',
        '#2784d5',
        { highlight: '#0465af' }
      )
    ],
    rules: [
      'Every block is the picked hue at low chroma; emphasis by lightness.',
      'No second hue; the loss in ink.'
    ]
  },
  'print-mono': {
    label: 'Print mono: grays only',
    neutrals: {
      panel: '#f5f5f5',
      block: '#ebebeb',
      strong: '#c4c4c4',
      text: '#000000',
      line: '#262626',
      muted: '#868686'
    },
    outline: null,
    radius: 2,
    mono: true,
    accents: [
      accent(
        'accent',
        'the contribution: darker gray with an ink outline',
        null,
        '#d1d1d1',
        '#ababab',
        '#000000',
        '#2e2e2e'
      )
    ],
    rules: [
      'No hue at all; emphasis by gray level and outline weight.',
      'Safe in grayscale print and for every colour-vision deficiency.'
    ]
  },
  illustrative: {
    label: 'Illustrative: tinted rounded panels, a rounded sans, coloured key phrases',
    neutrals: {
      panel: '#f4f4f2',
      block: '#ffffff',
      strong: '#ececec',
      text: '#1e1e1e',
      line: '#1e1e1e',
      // Why darker than graphite's: quiet text sits on the panel tints and needs 3:1 there.
      muted: '#767676'
    },
    outline: null,
    radius: 6,
    illustrative: true,
    accents: [
      accent(
        'accent',
        'the method’s key phrase and its glyphs',
        190,
        '#bfe5e3',
        '#6ebcb7',
        '#00706b',
        '#00968f'
      )
    ],
    rules: [
      'For overview and teaser figures: tinted rounded panels per stage or method, drawn data (bubbles, network glyphs), long plain arrows.',
      'One coloured key phrase per panel (callout), in the panel’s or the accent’s ink.'
    ]
  },
  categorical: {
    label: 'Categorical: three kinds, three hues',
    neutrals: {
      panel: '#f7f7f7',
      block: '#f0f0f0',
      strong: '#b7b7b7',
      text: '#1e1e1e',
      line: '#333333',
      muted: '#8c8c8c'
    },
    outline: null,
    radius: 4,
    accents: [
      accent(
        'kind-1',
        'first kind (image, vision)',
        240,
        '#b6d8f1',
        '#65abdb',
        '#006191',
        '#0089c9'
      ),
      accent(
        'kind-2',
        'second kind (text, language)',
        165,
        '#bfecd7',
        '#64c69e',
        '#007252',
        '#00976d'
      ),
      accent('kind-3', 'third kind (action, audio)', 65, '#f0be8e', '#c88b4b', '#7b4700', '#b66c00')
    ],
    rules: [
      'Only when the figure encodes kinds (modalities, sources): one hue per kind, named in the caption.',
      'Modules without a kind stay gray.'
    ]
  }
}

/** Old style names still in scenes. */
export const PRESET_ALIASES = { neutral: 'graphite' }
export const DEFAULT_PRESET = 'graphite'

/** Accent swatches the picker offers, by OKLCH hue; violet is offered, never the default. */
export const ACCENT_SWATCHES = {
  blue: { hue: 250 },
  teal: { hue: 185 },
  green: { hue: 140 },
  amber: { hue: 80 },
  clay: { hue: 50 },
  slate: { hue: 250, chroma: 0.3 },
  violet: { hue: 300 }
}
/**
 * Panel tints for the illustrative style: pale, and each at its own lightness and chroma so a
 * set of panels never reads as one pastel step.
 */
export const PANEL_SWATCHES = {
  rose: { hue: 15, L: 0.925, C: 0.024 },
  teal: { hue: 195, L: 0.94, C: 0.02 },
  sand: { hue: 80, L: 0.95, C: 0.03 },
  sky: { hue: 240, L: 0.935, C: 0.02 },
  sage: { hue: 140, L: 0.94, C: 0.026 },
  lilac: { hue: 300, L: 0.93, C: 0.02 }
}

/** Old accent names: purple, yellow and salmon became violet, amber and clay. */
export const ACCENT_ALIASES = { purple: 'violet', yellow: 'amber', salmon: 'clay' }

// Corpus medians of tint lightness and chroma by hue: [hue, value], interpolated around the circle.
const TINT_L = [
  [18, 0.885],
  [52, 0.915],
  [75, 0.9],
  [91, 0.905],
  [137, 0.9],
  [171, 0.905],
  [233, 0.91],
  [255, 0.885],
  [281, 0.89],
  [301, 0.885],
  [342, 0.91]
]
const TINT_C = [
  [18, 0.048],
  [52, 0.045],
  [75, 0.085],
  [91, 0.09],
  [115, 0.07],
  [137, 0.058],
  [171, 0.045],
  [233, 0.04],
  [255, 0.046],
  [281, 0.04],
  [301, 0.048],
  [342, 0.043]
]

function aroundCircle(anchors, hue) {
  const h = ((hue % 360) + 360) % 360
  const points = [...anchors, [anchors[0][0] + 360, anchors[0][1]]]
  const lifted = h < anchors[0][0] ? h + 360 : h
  for (let index = 1; index < points.length; index += 1) {
    const [h0, v0] = points[index - 1]
    const [h1, v1] = points[index]
    if (lifted >= h0 && lifted <= h1) {
      return v0 + ((v1 - v0) * (lifted - h0)) / (h1 - h0)
    }
  }
  return anchors[0][1]
}

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

/** `#rgb` or `#rrggbb` as channels 0–1, or null. */
export function hexChannels(hex) {
  const value = String(hex ?? '').toLowerCase()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value)
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/.exec(value)
  const pairs = short ? short.slice(1).map((digit) => digit + digit) : long?.slice(1)
  return pairs ? pairs.map((pair) => Number.parseInt(pair, 16) / 255) : null
}

/** OKLCH of a hex colour: `{ L, C, h }` (h in degrees), or null when it is not a colour. */
export function hexToOklch(hex) {
  const rgb = hexChannels(hex)
  if (!rgb) {
    return null
  }
  const [r, g, b] = rgb.map(toLinear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const C = Math.hypot(A, B)
  return { L, C, h: C < 1e-6 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}

function oklchToLinear({ L, C, h }) {
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ]
}

const inGamut = (rgb) => rgb.every((channel) => channel >= -1e-4 && channel <= 1 + 1e-4)

/** A hex colour for OKLCH, brought into sRGB by lowering chroma, never lightness. */
export function oklchToHex({ L, C, h }) {
  let chroma = C
  let rgb = oklchToLinear({ L, C: chroma, h })
  if (!inGamut(rgb)) {
    let low = 0
    let high = C
    for (let step = 0; step < 24; step += 1) {
      chroma = (low + high) / 2
      if (inGamut(oklchToLinear({ L, C: chroma, h }))) {
        low = chroma
      } else {
        high = chroma
      }
    }
    rgb = oklchToLinear({ L, C: low, h })
  }
  return `#${rgb
    .map((channel) =>
      Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, channel))))) * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
}

/** WCAG relative luminance of a hex colour. */
export function luminance(hex) {
  const [r, g, b] = (hexChannels(hex) ?? [0, 0, 0]).map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two hex colours. */
export function contrast(first, second) {
  const [a, b] = [luminance(first), luminance(second)].toSorted((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

/** Degrees between two hues around the circle. */
export function hueDistance(first, second) {
  const d = Math.abs(first - second) % 360
  return Math.min(d, 360 - d)
}

/** How a colour counts: a hue (C ≥ 0.024), a neutral (C < 0.007, or slate ink), or a tinted neutral. */
export function colorClass(hex) {
  const color = hexToOklch(hex)
  if (!color) {
    return null
  }
  // Why dark only: slate ink and lines are a neutral; a pale blue of the same chroma is a hue.
  const slate = color.C < 0.04 && color.h >= 230 && color.h <= 270 && color.L < 0.6
  if (color.C < 0.007 || slate) {
    return { kind: 'neutral', ...color }
  }
  return { kind: color.C >= 0.024 ? 'hue' : 'tinted', ...color }
}

/**
 * The accent for a picked colour (`#hex`) or hue: tint (fills), strong (heavy fills), shade
 * (text, outlines, the contribution's arrow) and solid (markers), from the corpus medians.
 * `neutral` when the pick is nearly gray; `lossClash` when it sits within 35° of the loss red.
 */
export function deriveAccent(pick, { block = '#e9e9e9', chroma } = {}) {
  const picked =
    typeof pick === 'number' ? { L: 0.6, C: 0.15 * (chroma ?? 1), h: pick } : hexToOklch(pick)
  if (!picked) {
    throw new Error(`Not a colour: ${JSON.stringify(pick)}; give a #hex or a hue in degrees`)
  }
  const { h } = picked
  const scale = Math.min(1, picked.C / 0.1)
  let tintL = aroundCircle(TINT_L, h)
  const tintC = aroundCircle(TINT_C, h) * scale
  // Why: the tint must stay apart from the block in grayscale, or it vanishes in print.
  let tint = oklchToHex({ L: tintL, C: tintC, h })
  const grayL = (hex) => Math.cbrt(luminance(hex))
  while (Math.abs(grayL(tint) - grayL(block)) < 0.035 && tintL > 0.84) {
    tintL -= 0.01
    tint = oklchToHex({ L: tintL, C: tintC, h })
  }
  const strong = oklchToHex({ L: tintL - 0.15, C: Math.min(2 * tintC, 0.11), h })
  // Why: yellow darkens into olive-brown; shifting it toward orange keeps it golden.
  const shadeHue = h >= 75 && h <= 125 ? h - 15 : h
  let shadeL = 0.56
  let shade = oklchToHex({ L: shadeL, C: 0.13 * scale, h: shadeHue })
  while ((contrast(shade, '#ffffff') < 4.5 || contrast(shade, tint) < 4.5) && shadeL > 0.2) {
    shadeL -= 0.005
    shade = oklchToHex({ L: shadeL, C: 0.13 * scale, h: shadeHue })
  }
  let solidL = 0.6
  let solid = oklchToHex({ L: solidL, C: 0.15 * scale, h: shadeHue })
  while (contrast(solid, '#ffffff') < 3 && solidL > 0.3) {
    solidL -= 0.01
    solid = oklchToHex({ L: solidL, C: 0.15 * scale, h: shadeHue })
  }
  return {
    hue: Math.round(h * 10) / 10,
    tint,
    strong,
    shade,
    solid,
    neutral: picked.C < 0.03,
    lossClash: picked.C >= 0.03 && hueDistance(h, LOSS_HUE) < LOSS_CLEARANCE
  }
}

/** The accent named by a swatch, an old name or a `#hex`; null when `name` is none of those. */
export function accentFor(name, block) {
  const swatch = ACCENT_SWATCHES[ACCENT_ALIASES[name] ?? name]
  if (swatch) {
    return {
      name: ACCENT_ALIASES[name] ?? name,
      ...deriveAccent(swatch.hue, { block, chroma: swatch.chroma })
    }
  }
  if (typeof name === 'string' && hexChannels(name)) {
    return { name: name.toLowerCase(), ...deriveAccent(name, { block }) }
  }
  return null
}

/** Tonal blocks: the accent's hue at low chroma, pale to mid. */
export function tonalNeutrals(hue) {
  return {
    panel: oklchToHex({ L: 0.972, C: 0.011, h: hue }),
    block: oklchToHex({ L: 0.945, C: 0.022, h: hue }),
    strong: oklchToHex({ L: 0.86, C: 0.05, h: hue })
  }
}

/**
 * A loss in one tone: `text` for its name, symbol or formula, `stroke` for its optional thin
 * frame, `ring` for the frames around what it compares and `link` for its links. Ink is the
 * default; the accent and red are opt-in. `neutrals` (text, line, muted) and `accent` (a shade)
 * come from the figure's preset, graphite when omitted.
 */
export function lossStyle(tone = 'ink', { neutrals, accent } = {}) {
  if (!LOSS_TONES.includes(tone)) {
    throw new Error(`Unknown loss tone "${tone}". Tones: ${LOSS_TONES.join(', ')}`)
  }
  const gray = neutrals ?? PALETTE_PRESETS[DEFAULT_PRESET].neutrals
  if (tone === 'ink') {
    return {
      tone,
      fill: '#ffffff',
      text: gray.text,
      stroke: gray.muted,
      ring: gray.line,
      link: gray.line
    }
  }
  const color =
    tone === 'red' ? LOSS_RED : (accent ?? PALETTE_PRESETS[DEFAULT_PRESET].accents[0].shade)
  return { tone, fill: '#ffffff', text: color, stroke: color, ring: color, link: color }
}

/**
 * A preset's colours with an optional picked accent: neutrals, box outline, accents (the pick
 * replaces the first; print-mono keeps its grays), and the loss in ink; `clash` says the pick
 * sits too near red for a red loss (`tone: 'red'` then stays ink).
 */
export function presetColors(presetName, pick) {
  const id = PRESET_ALIASES[presetName] ?? presetName
  const preset = PALETTE_PRESETS[id] ?? PALETTE_PRESETS[DEFAULT_PRESET]
  const name = PALETTE_PRESETS[id] ? id : DEFAULT_PRESET
  const derived = pick && !preset.mono ? accentFor(pick, preset.neutrals.block) : null
  const first = derived
    ? {
        ...preset.accents[0],
        name: preset.accents[0].name,
        pick: derived.name,
        hue: derived.hue,
        tint: derived.tint,
        strong: derived.strong,
        shade: derived.shade,
        solid: derived.solid,
        highlight: preset.tonal ? derived.shade : undefined
      }
    : preset.accents[0]
  const neutrals =
    preset.tonal && derived
      ? { ...preset.neutrals, ...tonalNeutrals(derived.hue) }
      : preset.neutrals
  const clash = Boolean(derived?.lossClash)
  return {
    name,
    label: preset.label,
    ...neutrals,
    outline: preset.outline,
    outlineWidth: preset.outlineWidth ?? null,
    radius: preset.radius,
    accents: [first, ...preset.accents.slice(1)],
    accentName: derived?.name ?? null,
    loss: { ...lossStyle('ink', { neutrals }), clash },
    rules: preset.rules
  }
}

/** Illustrative panels: each named swatch (or #hex) as a pale fill with an ink for its phrases. */
export function panelColors(names = ['rose', 'teal']) {
  return names.map((name, index) => {
    const swatch = PANEL_SWATCHES[name]
    const picked = swatch ? null : hexToOklch(name)
    if (!swatch && !picked) {
      throw new Error(
        `Unknown panel colour "${name}". Panels: ${Object.keys(PANEL_SWATCHES).join(', ')}, or #hex`
      )
    }
    const { hue, L, C } = swatch ?? { hue: picked.h, L: 0.935, C: Math.min(picked.C, 0.03) }
    const derived = deriveAccent(hue)
    // Why strong: a glyph drawn in a panel colour (nn nodes, bars) needs its mid tone.
    return {
      name: swatch ? name : `panel-${index + 1}`,
      fill: oklchToHex({ L, C, h: hue }),
      strong: derived.strong,
      ink: derived.shade
    }
  })
}
