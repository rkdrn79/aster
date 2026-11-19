// World palettes for AI research figures: several hues with meanings, chosen by the paper's
// world (vision and 3D, generative models, language models, robotics and RL, training and
// optimisation, systems), as in the famous hand-drawn figures (NeRF, Latent Diffusion, SAM,
// DreamFusion): each module type its own hue, warm beside cool, tints at their own lightness and
// chroma, an outline darker than its fill, one hue's light and dark faces for 3D, text in ink.
// Built from OKLCH numbers by one rule (worldHue), so every world reads as one hand drew it. Pure.
import { contrast, hexToOklch, hueDistance, oklchToHex } from './research-figures-color-space.mjs'

/**
 * What each role means, the same in every world: `a` is the paper's own part (warm, the most
 * coloured), `b` what the method produces, `c` the machinery, `d` what is given (inputs, data).
 */
export const WORLD_ROLES = {
  ours: 'a',
  output: 'b',
  model: 'c',
  input: 'd',
  data: 'd',
  frozen: 'frozen'
}
/** The role names a figure may colour by, besides the component hues a–d. */
export const ROLE_NAMES = ['input', 'output', 'data', 'model', 'frozen', 'ours']
const ROLE_NOTES = {
  a: 'the paper’s own part: its module, its tokens, its path',
  b: 'what the method produces: outputs, renders, samples',
  c: 'the machinery: networks and operations without a stake in the claim',
  d: 'what is given: inputs, data, conditions, cameras',
  frozen: 'frozen or pretrained parts: an icy neutral'
}

/** The darkest-first search the inks use: L down from `from` until `ok` holds. */
function darken(color, ok, from, floor = 0.2) {
  let L = from
  let hex = oklchToHex({ ...color, L })
  while (!ok(hex) && L > floor) {
    L -= 0.005
    hex = oklchToHex({ ...color, L })
  }
  return hex
}

/**
 * One hue's colours: `fill` (the tint a box takes), `light` and `dark` (the lit and turned faces
 * of a 3D shape, the same hue), `strong` (a heavier fill), `stroke` (its outline, darker than the
 * fill, as people draw it), `ink` (a key phrase on white or on the fill) and `solid` (a marker,
 * a ray, a plot line).
 */
export function worldHue({ h, L, C, quiet = false }) {
  // Why: yellow darkens into olive; shifting the dark tones toward orange keeps them golden.
  const deep = h >= 75 && h <= 125 ? h - 15 : h
  const fill = oklchToHex({ L, C, h })
  const ink = darken(
    { C: quiet ? 0.05 : Math.max(0.1, Math.min(0.14, C * 1.8)), h: deep },
    (hex) => contrast(hex, '#ffffff') >= 4.5 && contrast(hex, fill) >= 4.5,
    0.52
  )
  const solid = darken(
    { C: quiet ? 0.06 : Math.max(0.12, Math.min(0.16, C * 2.2)), h: deep },
    (hex) => contrast(hex, '#ffffff') >= 3,
    0.66
  )
  return {
    hue: h,
    tint: fill,
    light: oklchToHex({ L: Math.min(0.975, L + 0.05), C: C * 0.6, h }),
    dark: oklchToHex({ L: L - 0.1, C: Math.min(C * 1.25, 0.13), h }),
    strong: oklchToHex({ L: L - 0.17, C: Math.min(C * 1.8, 0.12), h }),
    stroke: oklchToHex({
      L: Math.min(0.56, L - 0.3),
      C: quiet ? 0.025 : Math.min(Math.max(C * 1.3, 0.055), 0.1),
      h: deep
    }),
    shade: ink,
    solid
  }
}

/** A world's grays, tinted toward its hue `h` by `C` (0 for true grays). */
function worldNeutrals(h, C) {
  const gray = (L, scale = 1) => oklchToHex({ L, C: C * scale, h })
  return {
    neutrals: {
      panel: gray(0.975),
      block: gray(0.952),
      strong: gray(0.86, 1.2),
      text: gray(0.235, 0.6),
      line: gray(0.33, 0.8),
      muted: gray(0.62, 1.2)
    },
    outline: gray(0.6, 1.5)
  }
}

const hue = (name, h, L, C) => ({ name, h, L, C })

/**
 * The worlds: mood, the papers they suit (`fits`, for choosing), neutrals tinted toward the
 * world, and four hues (a–d) at their own lightness and chroma, never one pastel step.
 */
const WORLDS = {
  vision: {
    label: 'Vision: orange, gold, sky blue and leaf, beside photographs and renders',
    mood: 'photographic, lit, saturated marks; NeRF and its renders',
    fits: [
      '3D',
      'NeRF',
      'Gaussian splatting',
      'rendering',
      'video',
      'perception',
      'vision-language'
    ],
    gray: [70, 0.006],
    hues: [
      hue('a', 50, 0.835, 0.095),
      hue('b', 92, 0.915, 0.1),
      hue('c', 242, 0.86, 0.06),
      hue('d', 155, 0.885, 0.055)
    ]
  },
  generative: {
    label: 'Generative: apricot, gold, rose and dusk blue',
    mood: 'warm, glowing; dusk over the data',
    fits: [
      'diffusion',
      'flow matching',
      'image generation',
      'video generation',
      'audio generation'
    ],
    gray: [60, 0.01],
    hues: [
      hue('a', 48, 0.84, 0.085),
      hue('b', 90, 0.915, 0.09),
      hue('c', 0, 0.885, 0.05),
      hue('d', 258, 0.865, 0.045)
    ]
  },
  language: {
    label: 'Language: terracotta, ochre, sage and dusty blue on cream',
    mood: 'printed, editorial, calm; a book diagram',
    fits: ['language models', 'reasoning', 'alignment', 'RLHF', 'LLM agents', 'retrieval'],
    gray: [80, 0.012],
    hues: [
      hue('a', 38, 0.84, 0.07),
      hue('b', 86, 0.915, 0.09),
      hue('c', 140, 0.865, 0.055),
      hue('d', 240, 0.89, 0.04)
    ]
  },
  robotics: {
    label: 'Robotics: moss, wheat, clay and sky on stone',
    mood: 'physical, grown, outdoors; a workshop manual',
    fits: ['robotics', 'embodied agents', 'reinforcement learning', 'world models', 'navigation'],
    gray: [100, 0.01],
    hues: [
      hue('a', 138, 0.835, 0.08),
      hue('b', 90, 0.915, 0.08),
      hue('c', 40, 0.86, 0.055),
      hue('d', 228, 0.885, 0.045)
    ]
  },
  training: {
    label: 'Training: coral on teal, deep blue and sand',
    mood: 'cool, deep, fluid; one warm mark on the sea',
    fits: ['optimisation', 'loss landscapes', 'training dynamics', 'scaling', 'sampling', 'theory'],
    gray: [230, 0.01],
    hues: [
      hue('a', 36, 0.86, 0.068),
      hue('b', 85, 0.915, 0.06),
      hue('c', 195, 0.885, 0.05),
      hue('d', 252, 0.835, 0.06)
    ]
  },
  systems: {
    label: 'Systems: teal, amber, slate blue and coral on clean white',
    mood: 'engineered, exact, clean; a datasheet',
    fits: [
      'efficiency',
      'hardware',
      'memory',
      'parallelism',
      'quantization',
      'serving',
      'data pipelines'
    ],
    gray: [220, 0.006],
    hues: [
      hue('a', 188, 0.84, 0.065),
      hue('b', 80, 0.905, 0.095),
      hue('c', 255, 0.865, 0.05),
      hue('d', 28, 0.875, 0.06)
    ]
  }
}

/** The icy neutral of frozen and pretrained parts: blue-gray, too pale to count as a hue. */
const FROZEN = { h: 235, L: 0.92, C: 0.012, quiet: true }

function presetOf(id, world) {
  const { neutrals, outline } = worldNeutrals(...world.gray)
  const accents = world.hues.map(({ name, h, L, C }) => ({
    name,
    role: ROLE_NOTES[name],
    ...worldHue({ h, L, C })
  }))
  const frozen = worldHue(FROZEN)
  accents.push({ name: 'frozen', role: ROLE_NOTES.frozen, ...frozen, hue: null })
  return {
    label: world.label,
    neutrals,
    outline,
    outlineWidth: 1.5,
    radius: 5,
    world: { mood: world.mood, fits: world.fits, roles: WORLD_ROLES },
    accents,
    // Why panels: a stage or space drawn as a region takes a pale tint of its role (LDM's pixel
    // and latent spaces), never one gray behind everything.
    panels: world.hues.map(({ name, h }) => ({
      name,
      fill: oklchToHex({ L: 0.962, C: 0.02, h }),
      strong: accents.find((item) => item.name === name).strong,
      ink: accents.find((item) => item.name === name).shade
    })),
    rules: [
      'Each module type takes its own hue, the same type the same hue: a ours, b outputs, c the machinery, d inputs and data.',
      'Every box has an outline darker than its fill; text stays ink; 3D faces are one hue lit and turned (-light, -dark).'
    ]
  }
}

/** The world presets, in the shape of the quiet ones (palette.mjs merges them). */
export const WORLD_PRESETS = Object.fromEntries(
  Object.entries(WORLDS).map(([id, world]) => [id, presetOf(id, world)])
)

/**
 * A picked accent in a world: the pick becomes `a` (a world hue, lit and turned like the rest);
 * a component hue within 35° of the pick takes the world's own `a` hue at its own lightness and
 * chroma, so the hues stay apart and every tone stays one the checks passed.
 */
export function worldAccents(accents, pickHex) {
  const pick = hexToOklch(pickHex)
  if (!pick || pick.C < 0.03) {
    return accents
  }
  const own = accents[0]
  const L = hexToOklch(own.tint).L
  const C = Math.max(0.045, Math.min(0.1, pick.C * 0.45))
  const first = { ...own, ...worldHue({ h: pick.h, L, C }), hue: Math.round(pick.h * 10) / 10 }
  return [
    first,
    ...accents.slice(1).map((item) =>
      item.hue !== null && hueDistance(item.hue, pick.h) < 35
        ? {
            ...item,
            ...worldHue({ h: own.hue, L: hexToOklch(item.tint).L, C: hexToOklch(item.tint).C }),
            hue: own.hue
          }
        : item
    )
  ]
}

/** Series colours for plots: ours (a) first, then the given (d), the machinery (c), outputs (b). */
export function worldSeries(accents) {
  const byName = (name) => accents.find((item) => item.name === name)
  return ['a', 'd', 'c', 'b'].map((name) => byName(name)?.solid).filter(Boolean)
}

/**
 * A world's colour maps for plots, light to dark like the quiet ones: `seq` (paper to a's ink),
 * `div` (d's ink, paper, a's ink), `world` (paper through the world's hues to d's ink, lightness
 * always falling) and `surface` (a 3D surface, dark to light in d: one hue, lit and turned).
 */
export function worldMaps(preset) {
  const [a, b, c, d] = preset.accents
  const paper = preset.neutrals.panel
  const L = (hex) => hexToOklch(hex).L
  const falling = [paper, b.tint, c.tint, c.solid, d.shade].toSorted((x, y) => L(y) - L(x))
  return {
    seq: [paper, a.light, a.tint, a.strong, a.solid, a.shade],
    div: [d.shade, d.strong, d.tint, paper, a.tint, a.strong, a.shade],
    world: falling,
    surface: [d.strong, d.dark, d.tint, d.light]
  }
}

/**
 * The checks every world passes, all about looking drawn by a person: ink readable on every fill
 * and heavy fill, each key-phrase ink readable on white and on its fill, outlines darker than
 * fills, a warm hue beside a cool one, and tints at their own lightness (never one pastel step).
 */
export function worldChecks(preset) {
  const problems = []
  const ink = preset.neutrals.text
  const hues = preset.accents.filter((item) => item.hue !== null)
  for (const item of preset.accents) {
    const fail = (what) => problems.push(`${item.name}: ${what}`)
    if (contrast(ink, item.tint) < 7 || contrast(ink, item.strong) < 4.5) {
      fail('ink is under 7:1 on its fill or 4.5:1 on its heavy fill')
    }
    if (contrast(item.shade, '#ffffff') < 4.5 || contrast(item.shade, item.tint) < 4.5) {
      fail('its ink is under 4.5:1')
    }
    if (hexToOklch(item.stroke).L > hexToOklch(item.tint).L - 0.25) {
      fail('its outline is not darker than its fill')
    }
  }
  if (!hues.some((item) => item.hue < 110 || item.hue >= 330)) {
    problems.push('no warm hue')
  }
  if (!hues.some((item) => item.hue >= 150 && item.hue < 300)) {
    problems.push('no cool hue')
  }
  const tints = hues.map((item) => hexToOklch(item.tint).L)
  if (Math.max(...tints) - Math.min(...tints) < 0.05) {
    problems.push('the tints share one lightness, the generated-pastel look')
  }
  return problems
}
