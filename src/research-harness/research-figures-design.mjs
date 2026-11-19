// The design layer: emphasis by declaration and colour by meaning. The agent names the paper's
// contribution (fig.focus) and, at most, one dimension a second colour encodes (fig.colourBy);
// save() then draws the focus in the accent, a little heavier and larger, and everything else
// in ink on white or a light neutral, whatever preset, world or template coloured it. Numbers
// from round 17's study of 16 published figures (round17/design-edit/research.md). Pure.
import { hexToOklch, hueDistance, oklchToHex } from './research-figures-color-space.mjs'
import { BOUND_TEXT_PADDING, measureText } from './research-figures-text.mjs'
import { isSemanticColor } from './research-figures-style.mjs'
import { PAPER_STROKE } from './research-figures-paper.mjs'
import { PAGE_FRAME_ID } from './research-figures-model.mjs'

/**
 * Published norms: hues (median 3, 12 of 16 at most 3), box styles and text sizes (median 3,
 * never above 5), a focus 2–6× a peer when it is emphasised (1.6× with its own accent), an
 * accent that colours at most 30% of the items and nothing else, peers equal within 15%.
 */
export const DESIGN_LIMITS = {
  hues: 3,
  boxStyles: 3,
  textSizes: 3,
  focusArea: 1.6,
  accentShare: 0.3,
  peerRatio: 1.15,
  gapSteps: 4
}
/** The focus's stroke: 1 pt beside everyone else's 0.75 pt. */
export const FOCUS_STROKE = 2
/** The focus's labels one step up: 9 pt beside 8 pt. */
export const FOCUS_TEXT_STEP = 2
/** Chroma from which a colour counts as a hue (pale tinted grays stay neutral). */
export const HUE_CHROMA = 0.03
/** Values a dimension may colour; a third needs its own reason (lint: design-hues). */
const MAX_DIMENSION_VALUES = 2
const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])
const LINES = new Set(['arrow', 'line', 'freedraw'])

const visible = (color) =>
  typeof color === 'string' && color !== 'transparent' && color !== 'none' && color !== ''
const hexColor = (color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)

/** The OKLCH colour of a #rrggbb that is a hue (chroma at least HUE_CHROMA), else null. */
export function hueOf(color) {
  if (!hexColor(color)) {
    return null
  }
  const oklch = hexToOklch(color)
  return oklch && oklch.C >= HUE_CHROMA ? oklch : null
}

const ids = (value) => [value ?? []].flat().map(String).filter(Boolean)

/**
 * A design brief as the page keeps it: `focus` ids, `colourBy` { dimension, values: [{ name,
 * ids, neutral }] }, `data` ids whose colours are values, `brief` (one sentence: the claim).
 */
export function normalizeDesign(input = {}) {
  const focus = ids(input.focus)
  const data = ids(input.data)
  let colourBy = null
  if (input.colourBy && Array.isArray(input.colourBy.values)) {
    // Why: a brief the page already keeps comes back in this form when a later call adds to it.
    colourBy = {
      dimension: input.colourBy.dimension,
      values: input.colourBy.values.map((value) => ({ ...value, ids: ids(value.ids) }))
    }
  } else if (input.colourBy) {
    const { dimension, neutral, gray: grays, ...groups } = input.colourBy
    if (typeof dimension !== 'string' || !dimension.trim()) {
      throw new Error(
        "colourBy needs the dimension its colour encodes: colourBy('stream', { text: [...], image: [...] })"
      )
    }
    const plain = new Set(ids(neutral))
    // Why frozen is gray unless said otherwise: the kit's frozen parts are a light gray.
    const quiet = new Set([...ids(grays), ...(plain.has('frozen') ? [] : ['frozen'])])
    const values = Object.entries(groups).map(([name, members]) => ({
      name,
      ids: ids(members),
      neutral: plain.has(name) || quiet.has(name),
      ...(quiet.has(name) && !plain.has(name) ? { gray: true } : {})
    }))
    if (!values.length) {
      throw new Error(`colourBy('${dimension}') names no values: { value: [ids], … }`)
    }
    const coloured = values.filter((value) => !value.neutral)
    if (coloured.length > MAX_DIMENSION_VALUES) {
      throw new Error(
        `colourBy('${dimension}') colours ${coloured.length} values; one dimension takes one or two colours: leave the rest neutral ({ neutral: ['${coloured.at(-1).name}'] })`
      )
    }
    colourBy = { dimension: dimension.trim(), values }
  }
  return {
    focus,
    colourBy,
    data,
    brief: typeof input.brief === 'string' ? input.brief.trim() : null
  }
}

/** The design the page frame keeps, or null when it declared none (the layer stays off). */
export function pageDesign(frame) {
  const design = frame?.customData?.asterDesign ?? null
  return design && (design.focus?.length || design.colourBy) ? design : null
}

/** The page frame among a scene's elements. */
export function designFrame(elements) {
  return (
    elements.find(
      (element) =>
        !element.isDeleted &&
        element.type === 'frame' &&
        (element.id === PAGE_FRAME_ID || element.customData?.asterPage !== undefined)
    ) ?? null
  )
}

/** The neutral and accent colours the layer paints with, from the figure's style. */
export function designColors(style) {
  const accent = style.accents[0]
  // Why the given-data hue first: in a world `d` is the cool hue of inputs and conditions, the
  // calmest second colour; otherwise the hue farthest from the accent.
  const apart = (item) => hueDistance(item.hue, accent.hue ?? 0)
  const others = style.accents
    .slice(1)
    .filter((item) => Number.isFinite(item.hue))
    .toSorted((first, second) => {
      const given = (item) => (item.name === 'd' && apart(item) >= 60 ? 1 : 0)
      return given(second) - given(first) || apart(second) - apart(first)
    })
  // Why paler than the focus: a dimension's colour groups parts; it never competes with it.
  const quiet = (item) => {
    const base = hexToOklch(item.fill)
    return {
      fill: oklchToHex({ L: Math.max(base.L, 0.9), C: Math.min(base.C, 0.05), h: base.h }),
      ink: item.ink
    }
  }
  const region = (hex) => {
    const base = hexToOklch(hex)
    // Why this pale: a region is a background; at 3% of chroma it groups without shouting.
    return oklchToHex({ L: Math.max(base.L, 0.972), C: Math.min(base.C, 0.024), h: base.h })
  }
  return {
    accent: {
      fill: accent.fill,
      ink: accent.ink,
      solid: accent.solid ?? accent.ink,
      hue: accent.hue
    },
    region: region(accent.fill),
    dimensions: others.map(quiet),
    dimensionRegions: others.map((item) => region(item.fill)),
    white: '#ffffff',
    soft: '#eeeeee',
    softRegion: '#f4f4f4',
    line: style.line,
    ink: style.ink
  }
}

/** Whether `id` names this element: its own id, its owner's, or a named part of its owner. */
function names(element, id) {
  const owner = element.customData?.asterKit ?? element.id
  return (
    owner === id ||
    element.id === id ||
    (element.id.startsWith(`${id}-`) && id.startsWith(owner) && id !== owner)
  )
}

/**
 * Each element's role under the design: 'focus', 'dim' (with the value's index), 'data'
 * (colours that are values) or 'plain'. A part named in two places takes the first: focus,
 * then data, then the dimension.
 */
export function designRoles(elements, design) {
  const roles = new Map()
  const declared = [
    ...design.focus.map((id) => ({ id, role: 'focus' })),
    ...(design.data ?? []).map((id) => ({ id, role: 'data' })),
    ...(design.colourBy?.values ?? []).flatMap((value, index) =>
      value.ids.map((id) => ({
        id,
        role: value.gray ? 'quiet' : value.neutral ? 'plain' : 'dim',
        value: value.name,
        index
      }))
    )
  ]
  for (const element of elements) {
    if (element.isDeleted || element.type === 'frame') {
      continue
    }
    const hit = declared.find((entry) => names(element, entry.id))
    // Why: a drawn glyph's colour that encodes something (a memory tier, a source layer, a
    // picture's pixels) is a value, kept as drawn unless the part is the focus.
    const meaning = Boolean(element.customData?.asterMeaning)
    roles.set(
      element.id,
      meaning && hit?.role === 'focus'
        ? { ...hit, keep: true }
        : meaning
          ? { role: 'data' }
          : hit
            ? { ...hit }
            : { role: 'plain' }
    )
  }
  return roles
}

/** Which declared ids name nothing in the scene: a typo the kit reports. */
export function unknownDesignIds(elements, design) {
  const all = [
    ...design.focus,
    ...(design.data ?? []),
    ...(design.colourBy?.values ?? []).flatMap((value) => value.ids)
  ]
  const live = elements.filter((element) => !element.isDeleted)
  return all.filter((id) => !live.some((element) => names(element, id)))
}

const gray = (color) => {
  const oklch = hexToOklch(color)
  return oklch ? oklchToHex({ L: oklch.L, C: 0, h: 0 }) : color
}

/** A grid's cell (a density, a mask, a patch grid): its values are its pattern. */
const isGridCell = (element) => /-r\d+c\d+$/.test(element.id)

/** A glyph's cell or chip (a grid, a token strip, a patch): it keeps its pattern in gray. */
const isCell = (element) => {
  const owner = element.customData?.asterKit
  return Boolean(
    owner &&
    owner !== element.id &&
    (/-r\d+c\d+$/.test(element.id) ||
      /-\d+$/.test(element.id) ||
      (element.groupIds ?? []).includes(`${owner}-glyph`))
  )
}
const isPanel = (element) => Boolean(element.customData?.asterPanel)
const isHighlight = (element) => Boolean(element.customData?.asterHighlight)
const exempt = (element) =>
  element.type === 'image' ||
  element.customData?.asterSwatch ||
  isSemanticColor(element.backgroundColor) ||
  isSemanticColor(element.strokeColor)

/** A focus label one step larger, kept centred, when it still fits its box. */
function enlargeLabel(text, container) {
  const size = (text.fontSize ?? 16) + FOCUS_TEXT_STEP
  const measured = measureText(text.text ?? '', size, text.fontFamily)
  const height = (measured.height / 1.25) * (text.lineHeight ?? 1.25)
  if (
    container &&
    (measured.width > container.width - BOUND_TEXT_PADDING * 2 ||
      height > container.height - BOUND_TEXT_PADDING)
  ) {
    return false
  }
  const cx = text.x + text.width / 2
  const cy = text.y + text.height / 2
  Object.assign(text, {
    fontSize: size,
    width: measured.width,
    height,
    x: cx - measured.width / 2,
    y: cy - height / 2
  })
  return true
}

/** The paint of one element under its role; returns how many properties changed. */
function paint(element, role, colors) {
  const before = `${element.strokeColor}|${element.backgroundColor}|${element.strokeWidth}`
  const filled = visible(element.backgroundColor) && element.backgroundColor !== '#ffffff'
  const closed = SHAPES.has(element.type) || (element.type === 'line' && filled)
  const dimFill = (index) => colors.dimensions[index % Math.max(1, colors.dimensions.length)]
  if (role.keep) {
    // Why: a focus whose colours are values (skip arcs by source, tiers) keeps them and leads
    // by weight instead.
    if (element.type !== 'text' && visible(element.strokeColor)) {
      element.strokeWidth = Math.max(element.strokeWidth ?? 0, FOCUS_STROKE)
    }
  } else if (element.type === 'text') {
    // Why ink for every word: colour belongs to shapes and paths; words stay readable.
    if (hueOf(element.strokeColor)) {
      element.strokeColor = colors.ink
    }
  } else if (isPanel(element)) {
    const tint =
      role.role === 'focus'
        ? colors.region
        : role.role === 'dim'
          ? colors.dimensionRegions[role.index % Math.max(1, colors.dimensionRegions.length)]
          : role.role === 'quiet'
            ? colors.softRegion
            : null
    if (tint) {
      // Why no outline: a tinted region is set apart by its tint, as papers draw it.
      element.backgroundColor = tint
      element.strokeColor = 'transparent'
    } else if (hueOf(element.backgroundColor)) {
      element.backgroundColor = 'transparent'
    }
    if (hueOf(element.strokeColor)) {
      element.strokeColor = colors.line
    }
  } else if (LINES.has(element.type) && !closed) {
    if (role.role === 'focus') {
      if (visible(element.strokeColor)) {
        element.strokeColor = colors.accent.solid
        // Why not a glyph's fine lines (a voxel lattice): thickened they read as bars.
        if (!element.customData?.asterFine) {
          element.strokeWidth = Math.max(element.strokeWidth ?? 0, FOCUS_STROKE)
        }
      }
    } else if (hueOf(element.strokeColor)) {
      element.strokeColor = role.role === 'dim' ? dimFill(role.index).ink : colors.line
    }
  } else if (closed && !visible(element.strokeColor) && !visible(element.backgroundColor)) {
    // Why: an invisible holder (a strip's or a label's bound box) stays invisible.
    return 0
  } else if (closed && isHighlight(element)) {
    element.backgroundColor =
      role.role === 'focus'
        ? colors.accent.fill
        : role.role === 'dim'
          ? dimFill(role.index).fill
          : colors.soft
  } else if (closed) {
    const fill = hexColor(element.backgroundColor) ? hexToOklch(element.backgroundColor) : null
    // Why apart: a junction dot or a filled marker is ink, not a module's fill.
    const dark = Boolean(fill && fill.L < 0.5)
    const light = Boolean(fill && fill.L >= 0.8 && element.backgroundColor !== '#ffffff')
    const cell = isCell(element)
    if (role.role === 'focus') {
      if (dark) {
        element.backgroundColor = colors.accent.solid
        element.strokeColor = visible(element.strokeColor)
          ? colors.accent.solid
          : element.strokeColor
      } else {
        // Why gray cells stay: a pattern (density, a mask) keeps its values inside the focus.
        if (!(cell && fill && !hueOf(element.backgroundColor))) {
          element.backgroundColor = colors.accent.fill
        }
        element.strokeColor = colors.ink
        element.strokeWidth = FOCUS_STROKE
      }
    } else if (dark) {
      if (hueOf(element.backgroundColor)) {
        element.backgroundColor = colors.ink
      }
    } else if (role.role === 'dim' || role.role === 'quiet') {
      element.backgroundColor = role.role === 'dim' ? dimFill(role.index).fill : colors.soft
      if (visible(element.strokeColor)) {
        element.strokeColor = colors.line
      }
    } else {
      // Why one style for every other module: white with the line's outline; a cell keeps its
      // pattern in gray; a mid gray that means something (a masked token) stays.
      if (hueOf(element.backgroundColor)) {
        // Why chips white: a plain token is a word, not a value; a grid's cell keeps its value.
        element.backgroundColor = isGridCell(element) ? gray(element.backgroundColor) : colors.white
      } else if (light && !cell) {
        element.backgroundColor = colors.white
      }
      if (visible(element.strokeColor) && !isGridCell(element)) {
        element.strokeColor = colors.line
      } else if (hueOf(element.strokeColor)) {
        element.strokeColor = colors.line
      }
    }
  }
  // Why after the paint, and only when it repainted: a cuboid's top and side faces stay one step
  // lighter and darker than its front whatever the front became, so the solid reads as one.
  const step = element.customData?.asterShade
  const repainted = !before.includes(`|${element.backgroundColor}|`)
  if (Number.isFinite(step) && step !== 0 && repainted && hexColor(element.backgroundColor)) {
    const base = hexToOklch(element.backgroundColor)
    element.backgroundColor = oklchToHex({
      ...base,
      L: Math.min(0.985, Math.max(0.05, base.L + step))
    })
  }
  return before === `${element.strokeColor}|${element.backgroundColor}|${element.strokeWidth}`
    ? 0
    : 1
}

/**
 * What save() does to a page that declared a design: the focus in the accent (fill, ink outline
 * at 1 pt, labels a step larger), a dimension's values in their pale colours, every other
 * colour turned neutral (modules white, cells gray, lines and words ink), pictures and data
 * colours untouched. Marks each element's role (customData.asterDesign) for the lint.
 */
export function designFinish(elements, style, design) {
  if (!design) {
    return 0
  }
  const colors = designColors(style)
  const roles = designRoles(elements, design)
  const byId = new Map(elements.map((element) => [element.id, element]))
  let changed = 0
  for (const element of elements) {
    const role = roles.get(element.id)
    if (!role) {
      continue
    }
    element.customData = { ...element.customData, asterDesign: role.role }
    if (role.role === 'data' || exempt(element)) {
      continue
    }
    changed += paint(element, role, colors)
  }
  for (const element of elements) {
    if (element.type !== 'text' || roles.get(element.id)?.role !== 'focus') {
      continue
    }
    const container = byId.get(element.containerId)
    const owner = byId.get(element.customData?.asterKit)
    const box = container ?? (owner && SHAPES.has(owner.type) ? owner : null)
    if (box && !isPanel(box) && box.id !== element.id && enlargeLabel(element, box)) {
      changed += 1
    }
  }
  return changed
}

/** The stroke a focus part may carry above the paper's one weight (the paper-stroke check). */
export function isFocusStroke(element) {
  return element.customData?.asterDesign === 'focus' && element.strokeWidth <= FOCUS_STROKE
}

export { PAPER_STROKE }
