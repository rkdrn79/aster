// Colour lint from the colour study (73 human method figures vs. generated ones): what marks a
// palette as machine-made is not the number of hues but pastel cards outlined in their own hue,
// one pastel step for every hue, library default colours, violet by default and bold fills.
// Each signal scores points; two make a warning, three an error.
import { elementBounds } from './research-figures-geometry.mjs'
import {
  colorClass,
  contrast,
  hexToOklch,
  hueDistance,
  LOSS_HUE
} from './research-figures-palette.mjs'
import {
  hasRedLoss,
  isLossRed,
  isLossRole,
  isSemanticColor,
  styleNeutrals
} from './research-figures-style.mjs'

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])
const visible = (color) => Boolean(color) && color !== 'transparent'
const round = (value) => Math.round(value * 1000) / 1000

/** Tailwind 300–600, draw.io strokes, Mermaid and Google/Material: what a model reaches for. */
const LIBRARY = `#93c5fd #60a5fa #3b82f6 #2563eb #a5b4fc #818cf8 #6366f1 #4f46e5 #c4b5fd #a78bfa
#8b5cf6 #7c3aed #d8b4fe #c084fc #a855f7 #9333ea #f9a8d4 #f472b6 #ec4899 #db2777 #fda4af #fb7185
#f43f5e #e11d48 #fca5a5 #f87171 #ef4444 #dc2626 #fdba74 #fb923c #f97316 #ea580c #fcd34d #fbbf24
#f59e0b #d97706 #fde047 #facc15 #eab308 #ca8a04 #86efac #4ade80 #22c55e #16a34a #6ee7b7 #34d399
#10b981 #059669 #5eead4 #2dd4bf #14b8a6 #0d9488 #67e8f9 #22d3ee #06b6d4 #0891b2 #7dd3fc #38bdf8
#0ea5e9 #0284c7 #6c8ebf #82b366 #d79b00 #d6b656 #b85450 #9673a6 #ececff #9370db #4285f4 #34a853
#fbbc04 #fbbc05 #ea4335`
  .split(/\s+/)
  .map(hexToOklch)
  .filter((color) => color && color.C >= 0.05)

const lab = ({ L, C, h }) => [
  L,
  C * Math.cos((h * Math.PI) / 180),
  C * Math.sin((h * Math.PI) / 180)
]

function nearLibrary(hex) {
  if (isSemanticColor(hex)) {
    return false
  }
  const color = hexToOklch(hex)
  if (!color || color.C < 0.05) {
    return false
  }
  const [L, a, b] = lab(color)
  return LIBRARY.some((other) => {
    const [L2, a2, b2] = lab(other)
    return Math.hypot(L - L2, a - a2, b - b2) < 0.015
  })
}

/** Hues grouped into families 28° apart. */
function families(hues) {
  const sorted = hues.toSorted((first, second) => first.h - second.h)
  const groups = []
  for (const item of sorted) {
    const last = groups.at(-1)
    if (last && item.h - last.at(-1).h <= 28) {
      last.push(item)
    } else {
      groups.push([item])
    }
  }
  if (groups.length > 1 && groups[0][0].h + 360 - groups.at(-1).at(-1).h <= 28) {
    groups[0].push(...groups.pop())
  }
  return groups
}

const spread = (values) => {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
}

function filledShapes(elements) {
  return elements.filter(
    (element) =>
      SHAPES.has(element.type) &&
      visible(element.backgroundColor) &&
      !element.customData?.asterBadge &&
      element.width * element.height > 0
  )
}

/** Right and wrong (`good`, `bad`) mean something fixed, so the palette rules leave them out. */
const semantic = (shape) => isSemanticColor(shape.backgroundColor)

/** The smallest filled shape under a point: what a free text sits on. */
function backdrop(shapes, point) {
  return shapes
    .filter((shape) => {
      const box = elementBounds(shape)
      return point[0] > box.x && point[0] < box.right && point[1] > box.y && point[1] < box.bottom
    })
    .toSorted((first, second) => first.width * first.height - second.width * second.height)[0]
}

function contrastChecks(elements, style, add) {
  const shapes = filledShapes(elements)
  const byId = new Map(elements.map((element) => [element.id, element]))
  for (const text of elements.filter((element) => element.type === 'text')) {
    if (!visible(text.strokeColor) || !hexToOklch(text.strokeColor)) {
      continue
    }
    const container = text.containerId ? byId.get(text.containerId) : null
    const box = elementBounds(text)
    const under = container ?? backdrop(shapes, [box.x + box.width / 2, box.y + box.height / 2])
    const fill = under && visible(under.backgroundColor) ? under.backgroundColor : '#ffffff'
    if (!hexToOklch(fill)) {
      continue
    }
    const minimum = text.strokeColor.toLowerCase() === style.muted.toLowerCase() ? 3 : 4.5
    const ratio = contrast(text.strokeColor, fill)
    if (ratio < minimum) {
      add(
        'error',
        'text-contrast',
        text,
        `${text.strokeColor} on ${fill} is ${Math.round(ratio * 10) / 10}:1, under ${minimum}:1; use the ink, or a lighter fill`
      )
    }
  }
}

/** A grid or matrix cell (<id>-r<i>c<j>): data, not a module. */
const CELL = /-r\d+c\d+$/

/**
 * One meaning per hue: a hue that fills modules (trained ones, in the accent) and also marks
 * cells of a matrix or grid (CLIP's matched pairs) says two things.
 */
function meaningChecks(elements, add) {
  const hueOf = (shape) => {
    const color = colorClass(shape.backgroundColor)
    return color?.kind === 'hue' ? color.h : null
  }
  const labelled = (shape) =>
    (shape.boundElements ?? []).some((bound) => bound.type === 'text') ||
    elements.some(
      (text) =>
        text.type === 'text' && text.customData?.asterKit === shape.id && text.id !== shape.id
    )
  const modules = filledShapes(elements).filter(
    (shape) =>
      !CELL.test(shape.id) &&
      !shape.customData?.asterPanel &&
      !isLossRole(shape.customData?.asterRole) &&
      !semantic(shape) &&
      (shape.customData?.asterKit ?? shape.id) === shape.id &&
      shape.width >= 24 &&
      shape.height >= 16 &&
      hueOf(shape) !== null &&
      labelled(shape)
  )
  const byId = new Map(elements.map((element) => [element.id, element]))
  const glyphOf = (cell) => byId.get(cell.customData?.asterKit)
  const all = filledShapes(elements).filter((shape) => CELL.test(shape.id))
  const entries = new Set(
    elements
      .filter((element) => /-t\d+-\d+(?:-\d+)?$/.test(element.id))
      .map((element) => element.customData?.asterKit)
  )
  // Why only some cells: a hue marking a few cells of a matrix (the diagonal) is a highlight with
  // its own meaning; a prediction a loss compares, tinted where it predicts, is the kit's
  // "predicted" tint.
  const predicted = (shape) =>
    isLossRole(glyphOf(shape)?.customData?.asterRole) && !entries.has(shape.customData?.asterKit)
  const cells = all.filter(
    (shape) =>
      hueOf(shape) !== null &&
      !predicted(shape) &&
      all.some(
        (other) =>
          other.customData?.asterKit === shape.customData?.asterKit &&
          (hueOf(other) === null || hueDistance(hueOf(other), hueOf(shape)) >= 28)
      )
  )
  for (const module of modules) {
    const cell = cells.find((other) => hueDistance(hueOf(other), hueOf(module)) < 28)
    if (cell) {
      add(
        'warning',
        'hue-meaning',
        cell,
        `${cell.customData?.asterKit ?? cell.id}'s cells take the hue of ${module.id} (${module.backgroundColor}), so one hue says two things; mark the cells with another hue or the ink, or colour the modules another way`
      )
      return
    }
  }
}

/**
 * The colour study's scene rules. Points: an outline in the fill's hue 2, one pastel step for
 * three or more hues 2, library colours 1, violet by default 1, four or more hues 1, every box
 * coloured 1, bold fills 1, tinted ink 1; 2 points warn, 3 are an error.
 */
export function colorChecks(elements, style, page, add) {
  const neutrals = styleNeutrals(style)
  const own = (hex) => neutrals.has(String(hex).toLowerCase())
  const shapes = filledShapes(elements)
  const points = []
  const exempt = (shape) =>
    isLossRole(shape.customData?.asterRole) ||
    semantic(shape) ||
    (shape.width < 24 && shape.height < 24)
  const cards = shapes.filter((shape) => {
    const fill = colorClass(shape.backgroundColor)
    const stroke = visible(shape.strokeColor) ? colorClass(shape.strokeColor) : null
    return (
      !exempt(shape) &&
      fill?.kind === 'hue' &&
      stroke?.kind === 'hue' &&
      hueDistance(fill.h, stroke.h) < 35 &&
      stroke.L < fill.L - 0.12
    )
  })
  if (cards.length) {
    points.push(['outline in the fill’s hue', 2])
    add(
      'error',
      'outline-hue',
      cards[0],
      `${cards
        .map((shape) => shape.id)
        .slice(0, 4)
        .join(
          ', '
        )} ${cards.length > 1 ? 'are' : 'is'} outlined in a darker shade of the fill’s own hue, the generated-card look; drop the outline or use the ink`
    )
  }
  const redLoss = hasRedLoss(elements)
  const hued = shapes
    .filter(
      (shape) =>
        !own(shape.backgroundColor) &&
        !semantic(shape) &&
        !(redLoss && isLossRed(shape.backgroundColor))
    )
    .map((shape) => ({ shape, ...colorClass(shape.backgroundColor) }))
    .filter((item) => item.kind === 'hue')
  const groups = families(hued)
  const tints = groups
    .map((group) => group.filter((item) => item.L >= 0.75))
    .filter((group) => group.length)
  if (tints.length >= 3) {
    const L = tints.map((group) => group[0].L)
    const C = tints.map((group) => group[0].C)
    if (Math.hypot(spread(L), spread(C)) < 0.022) {
      points.push(['one pastel step for every hue', 2])
      add(
        'error',
        'uniform-tints',
        null,
        `${tints.length} hues share one lightness and chroma (${tints.map((group) => group[0].shape.backgroundColor).join(', ')}), the generated-pastel look; use a preset (figures kit colors), whose tints differ in lightness`
      )
    }
  }
  if (groups.length >= 4) {
    points.push([`${groups.length} hues`, 1])
    const level = groups.length >= 5 && style.name !== 'categorical' ? 'error' : 'warning'
    add(
      level,
      'hue-count',
      null,
      `${groups.length} fill hues (${groups.map((group) => group[0].shape.backgroundColor).join(', ')}); give each hue one meaning, three at most`
    )
  }
  const area = (shape) => shape.width * shape.height
  // Why not panels: a tinted background is not a coloured box.
  const box = (shape) => !shape.customData?.asterPanel
  const coloured = hued
    .filter((item) => box(item.shape))
    .reduce((sum, item) => sum + area(item.shape), 0)
  const total = shapes.filter(box).reduce((sum, shape) => sum + area(shape), 0)
  if (groups.length >= 3 && total && coloured / total > 0.85) {
    points.push(['every box coloured', 1])
    add(
      'warning',
      'every-box-coloured',
      null,
      'every box has a hue; leave the ordinary modules gray'
    )
  }
  const library = elements.filter(
    (element) =>
      element.type !== 'image' &&
      (element.width >= 16 || element.height >= 16) &&
      ((SHAPES.has(element.type) && nearLibrary(element.backgroundColor)) ||
        (visible(element.strokeColor) && nearLibrary(element.strokeColor)))
  )
  if (library.length) {
    points.push(['library default colours', 1])
    add(
      'warning',
      'library-color',
      library[0],
      `${library
        .map((element) => element.id)
        .slice(0, 4)
        .join(
          ', '
        )} use a library default colour (Tailwind, Mermaid, Material); take the style's roles instead`
    )
  }
  const violet = hued.filter((item) => item.h >= 270 && item.h <= 330)
  const userViolet = style.accents[0].hue >= 270 && style.accents[0].hue <= 330
  if (
    !userViolet &&
    coloured &&
    violet.reduce((sum, item) => sum + area(item.shape), 0) / coloured >= 0.5
  ) {
    points.push(['violet by default', 1])
    add(
      'warning',
      'violet-default',
      null,
      'violet dominates the colours, a generated default; use the style’s accent'
    )
  }
  const pageArea = page ? page.width * page.height : total
  // Why opaque only: a prediction's cast (the accent at a third over a photo) tints, not fills.
  const bold = shapes.filter(
    (shape) =>
      (shape.opacity ?? 100) >= 60 &&
      !semantic(shape) &&
      (colorClass(shape.backgroundColor)?.C ?? 0) >= 0.12
  )
  if (pageArea && bold.reduce((sum, shape) => sum + area(shape), 0) / pageArea > 0.03) {
    points.push(['bold fills', 1])
    add(
      'warning',
      'bold-fills',
      bold[0],
      `saturated fills (${bold
        .map((shape) => shape.id)
        .slice(0, 4)
        .join(', ')}) cover more than 3% of the page; use tints, and one solid highlight at most`
    )
  }
  const tinted = elements.some((element) => {
    const color = ['text', 'arrow'].includes(element.type) ? hexToOklch(element.strokeColor) : null
    return color && color.C >= 0.025 && color.h >= 250 && color.h < 290 && style.name !== 'slate'
  })
  if (tinted) {
    points.push(['blue-violet tinted ink', 1])
  }
  // Why only beside a red loss: then red marks the loss, as text, frame and links, never a fill.
  const red = redLoss
    ? shapes.filter(
        (shape) =>
          isLossRed(shape.backgroundColor) &&
          hueDistance(colorClass(shape.backgroundColor).h, LOSS_HUE) < 20
      )
    : []
  for (const shape of red) {
    add(
      'error',
      'red-fill',
      shape,
      'is filled red beside a red loss; red marks the loss, as its text, frame and links, never a fill'
    )
  }
  const score = points.reduce((sum, [, value]) => sum + value, 0)
  if (score >= 2) {
    add(
      score >= 3 ? 'error' : 'warning',
      'generated-palette',
      null,
      `the colours score ${score} points of the generated look (${points.map(([name, value]) => `${name} ${value}`).join(', ')}); switch to a preset: figures kit colors`
    )
  }
  contrastChecks(elements, style, add)
  meaningChecks(elements, add)
  return round(score)
}
