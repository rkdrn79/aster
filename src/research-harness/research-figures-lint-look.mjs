// Warnings for what makes a figure look generated rather than drawn for a paper: pastel cards
// outlined in their own hue, a rainbow of hues, red off a red loss, prose and legends, crossed
// placeholders, hairline arrows, and a drawing that leaves much of the page empty.
import { elementBounds, isInside } from './research-figures-geometry.mjs'
import { DOUBLE_COLUMN_MAX_HEIGHT_IN } from './research-figures-model.mjs'
import { SPARSE_SHARE, blankShare, spaceChecks } from './research-figures-lint-space.mjs'
import { backgroundChecks, emptyBoxChecks } from './research-figures-lint-boxes.mjs'
import {
  figureStyle,
  hasRedLoss,
  isLossRed,
  isLossRole,
  isSemanticColor
} from './research-figures-style.mjs'
import { colorChecks } from './research-figures-lint-color.mjs'

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])
/** Units of white space a figure keeps along the page edge. */
const MARGIN = 12
const LOSS_WORDS = /loss|ℒ|\bL\b|\bL\s*[_\d]|mse|\bkl\b|nll|mask|objective|error/i
const visible = (color) => Boolean(color) && color !== 'transparent'
/** The words that label an element: its text, its bound text, and text grouped with it. */
function labelsOf(elements) {
  const byGroup = new Map()
  const byId = new Map(elements.map((element) => [element.id, element]))
  for (const element of elements) {
    if (element.type === 'text') {
      for (const group of element.groupIds ?? []) {
        byGroup.set(group, `${byGroup.get(group) ?? ''} ${element.text ?? ''}`)
      }
    }
  }
  return (element) =>
    [
      element.text,
      ...(element.boundElements ?? []).map((bound) => byId.get(bound.id)?.text),
      ...(element.groupIds ?? []).map((group) => byGroup.get(group))
    ]
      .filter(Boolean)
      .join(' ')
}

/**
 * Red reserved for the loss, only when the figure draws its loss red (`tone: 'red'`). The loss
 * is ink by default, and nothing requires a loss node, a frame or a colour.
 */
function lossChecks(elements, add) {
  if (!hasRedLoss(elements)) {
    return
  }
  const label = labelsOf(elements)
  const byId = new Map(elements.map((element) => [element.id, element]))
  const isLoss = (element) =>
    isLossRole(element?.customData?.asterRole) ||
    isLossRole(byId.get(element?.customData?.asterKit)?.customData?.asterRole) ||
    LOSS_WORDS.test(label(element ?? {}))
  for (const element of elements) {
    // Why not right and wrong: a ✗ or a failed answer is red by meaning, not part of the loss.
    if (
      element.type === 'image' ||
      element.type === 'frame' ||
      isLoss(element) ||
      [element.strokeColor, element.backgroundColor].some(isSemanticColor)
    ) {
      continue
    }
    const red =
      (visible(element.strokeColor) && isLossRed(element.strokeColor)) ||
      (SHAPES.has(element.type) && isLossRed(element.backgroundColor))
    if (!red) {
      continue
    }
    const ends = [element.startBinding, element.endBinding].map((bind) => byId.get(bind?.elementId))
    if (element.type === 'arrow' && ends.some(isLoss)) {
      continue
    }
    add(
      'warning',
      'loss-color',
      element,
      'is red beside a red loss, so it reads as part of the objective; give it another colour'
    )
  }
}

/**
 * Text that is data, not explanation: the words on a card, in an examples grid or a speech
 * bubble, or rows of words in one box (a trajectory's steps, an example). The figure shows them.
 */
function contentText(elements) {
  const holds = (element) =>
    Boolean(
      element.customData?.asterCard ||
      element.customData?.asterContent ||
      element.customData?.asterGlyph === 'examples'
    )
  const owners = new Set(
    elements.filter(holds).map((element) => element.customData?.asterKit ?? element.id)
  )
  const holders = elements
    .filter((element) => SHAPES.has(element.type) && holds(element))
    .map(elementBounds)
  // Why rows of text: a box holding three or more lines of words (a trajectory of steps, an
  // example) shows them as data.
  const texts = elements.filter((element) => element.type === 'text')
  const rows = elements
    .filter(
      (element) =>
        SHAPES.has(element.type) &&
        (visible(element.backgroundColor) || visible(element.strokeColor))
    )
    .map(elementBounds)
    .filter((box) => texts.filter((text) => isInside(elementBounds(text), box, 2)).length >= 3)
  return (text) =>
    owners.has(text.customData?.asterKit) ||
    [...holders, ...rows].some((box) => isInside(elementBounds(text), box, 2))
}

/**
 * A swatch is a small filled shape with nothing in it: a step's ring with its digit, a mark, a
 * badge or an icon is a glyph with its own meaning, so a title beside it is not a legend.
 */
function swatchesOf(elements, glyph) {
  const grouped = new Set(
    elements.filter((element) => element.type === 'text').flatMap((text) => text.groupIds ?? [])
  )
  return elements.filter(
    (element) =>
      SHAPES.has(element.type) &&
      visible(element.backgroundColor) &&
      element.width <= 24 &&
      element.height <= 24 &&
      !glyph(element) &&
      !['asterStep', 'asterMark', 'asterBadge', 'asterIcon', 'asterLegend'].some(
        (key) => element.customData?.[key]
      ) &&
      !(element.groupIds ?? []).some((group) => grouped.has(group)) &&
      !(element.boundElements ?? []).some((bound) => bound.type === 'text')
  )
}

function textChecks(elements, add, allowed) {
  // Why not glyphs: a token strip's small boxes sit beside words without being a legend.
  const glyph = (element) =>
    (element.groupIds ?? []).some((group) => group.endsWith('-glyph')) ||
    Boolean(element.customData?.asterKit && element.customData.asterKit !== element.id)
  const swatches = swatchesOf(elements, glyph).filter((swatch) => !allowed(swatch).has('legend'))
  const content = contentText(elements)
  let legendPairs = 0
  const paired = []
  for (const element of elements) {
    if (element.type !== 'text') {
      continue
    }
    const text = String(element.text ?? '').trim()
    const words = text.split(/\s+/).filter(Boolean).length
    const sentences = text
      .split(/[.!?](?:\s|$)/)
      .filter((part) => part.trim().split(/\s+/).length >= 3)
    if (/^legend\b/i.test(text)) {
      legendPairs += 2
      paired.push(element)
    }
    const long = element.containerId ? words > 6 : words > 10 || sentences.length > 1
    if (long && !content(element)) {
      add(
        'warning',
        'prose',
        element,
        `${words} words inside the figure; keep labels to a few words and put explanations in the caption (text on a card or in a bubble is data and passes; fig.allow('prose', ids) for other example text)`
      )
    }
    // Why not fig.legend's words: a legend asked for (3–4 colour roles) is drawn on purpose.
    const swatch =
      !element.containerId &&
      !glyph(element) &&
      !element.customData?.asterLegend &&
      !allowed(element).has('legend') &&
      swatches.find(
        (shape) =>
          element.x >= shape.x + shape.width &&
          element.x <= shape.x + shape.width + 40 &&
          Math.abs(element.y + element.height / 2 - (shape.y + shape.height / 2)) < 12
      )
    if (swatch) {
      legendPairs += 1
      paired.push(swatch)
    }
  }
  if (legendPairs >= 2) {
    const ids = paired.map((element) => element.id)
    add(
      'warning',
      'legend',
      paired[0],
      `a legend inside the figure (${ids.slice(0, 4).join(', ')}${ids.length > 4 ? ', …' : ''}); label the elements themselves and let the caption explain colours, or, when three or four roles need a key, draw it with fig.legend; fig.allow('legend', ids) when these swatches are not a key`
    )
  }
}

function placeholderChecks(elements, add) {
  const diagonals = elements.filter(
    (element) => element.type === 'line' && element.points?.length === 2
  )
  for (const box of elements.filter((element) => element.type === 'rectangle')) {
    const bounds = elementBounds(box)
    const crossing = diagonals.filter((line) => {
      const own = elementBounds(line)
      return (
        Math.abs(own.x - bounds.x) < 1.5 &&
        Math.abs(own.y - bounds.y) < 1.5 &&
        Math.abs(own.width - bounds.width) < 1.5 &&
        Math.abs(own.height - bounds.height) < 1.5
      )
    })
    if (crossing.length >= 2) {
      add(
        'warning',
        'placeholder',
        box,
        'a crossed-out placeholder reads as a missing image; use fig.image (a thumbnail) or a project image'
      )
    }
  }
}

/** The page edges an element comes within `MARGIN` of, by name. */
function tightEdges(box, page) {
  return [
    ['left', box.x - page.x],
    ['top', box.y - page.y],
    ['right', page.x + page.width - box.right],
    ['bottom', page.y + page.height - box.bottom]
  ]
    .filter(([, gap]) => gap >= -0.5 && gap < MARGIN - 0.5)
    .map(([name]) => name)
}

/** Whether the drawing leaves its page sparse: under 80% of its height, or much of it blank. */
function sparseDrawing(elements, page, gaps) {
  const boxes = elements.filter((element) => element.type !== 'frame').map(elementBounds)
  const top = Math.max(page.y, Math.min(...boxes.map((box) => box.y)))
  const bottom = Math.min(page.y + page.height, Math.max(...boxes.map((box) => box.bottom)))
  return (bottom - top) / page.height < 0.8 || blankShare(elements, page, gaps) >= SPARSE_SHARE
}

/**
 * Page checks. `sized` says the agent set the page size itself (`fig.setPage`, `figures new`);
 * otherwise Aster or the person did, and the agent fills the page and asks before resizing it.
 */
function pageChecks(elements, page, add, { sized = false, gaps = [] } = {}) {
  const thin = elements.filter(
    (element) => element.type === 'arrow' && (element.strokeWidth ?? 1) < 1.5
  )
  if (thin.length) {
    add(
      'warning',
      'thin-line',
      thin[0],
      `${thin.length} arrow(s) under 1.5 units (0.75 pt) wide (${thin
        .slice(0, 4)
        .map((element) => element.id)
        .join(', ')}); paper figures use about 2 (1 pt)`
    )
  }
  const content = elements.filter((element) => element.type !== 'frame').map(elementBounds)
  // Why only a sparse drawing on a page someone else set: they chose its height, so the agent
  // fills it and raises the size only when the drawing cannot fill it, never in every reply.
  const tallPage = page && page.widthIn > 5 && page.heightIn > DOUBLE_COLUMN_MAX_HEIGHT_IN + 0.005
  if (tallPage && (sized || (content.length && sparseDrawing(elements, page, gaps)))) {
    add(
      sized ? 'warning' : 'note',
      'tall-figure',
      null,
      sized
        ? `a double-column figure ${page.heightIn} in tall takes most of a page; aim for ${DOUBLE_COLUMN_MAX_HEIGHT_IN} in or less (fig.setPage({ heightIn }))`
        : `the page you were given is ${page.heightIn} in tall and the drawing leaves much of it empty; fill it, and suggest ${DOUBLE_COLUMN_MAX_HEIGHT_IN} in or less once in your reply (keep the size)`
    )
  }
  if (!page || !content.length) {
    return
  }
  const tight = elements
    .filter((element) => element.type !== 'frame' && !element.customData?.asterPanel)
    .map((element) => ({ element, edges: tightEdges(elementBounds(element), page) }))
    .filter((entry) => entry.edges.length)
  if (tight.length) {
    const edges = [...new Set(tight.flatMap((entry) => entry.edges))]
    add(
      'warning',
      'margin',
      tight[0].element,
      `${tight
        .slice(0, 4)
        .map((entry) => `${entry.element.id} (${entry.edges.join(', ')})`)
        .join(
          ', '
        )} ${tight.length > 1 ? 'are' : 'is'} within ${MARGIN} units of the page's ${edges.join(' and ')} edge${edges.length > 1 ? 's' : ''}; keep a ${MARGIN}-unit margin`
    )
  }
  const x = Math.max(page.x, Math.min(...content.map((box) => box.x)))
  const y = Math.max(page.y, Math.min(...content.map((box) => box.y)))
  const right = Math.min(page.x + page.width, Math.max(...content.map((box) => box.right)))
  const bottom = Math.min(page.y + page.height, Math.max(...content.map((box) => box.bottom)))
  const wide = (right - x) / page.width
  const tall = (bottom - y) / page.height
  if (wide < 0.88 || tall < 0.8) {
    const heightIn = Math.round(((bottom - y + 24) / 144) * 100) / 100
    const resize =
      tall < 0.8
        ? sized
          ? ` or make the page about ${heightIn} in tall with fig.setPage({ heightIn: ${heightIn} })`
          : `; the page was set for you, so keep its size, rebalance rows and columns, enlarge the data glyphs, and suggest about ${heightIn} in in your reply`
        : ''
    add(
      'warning',
      'page-fill',
      null,
      `the drawing spans ${Math.round(wide * 100)}% of the page width and ${Math.round(tall * 100)}% of its height; spread it out (12 units of margin is enough)${resize}`
    )
  }
}

/** A short dashed link prints solid. */
function sizeChecks(elements, add) {
  for (const arrow of elements.filter(
    (element) => element.type === 'arrow' && element.strokeStyle === 'dashed'
  )) {
    const points = arrow.points ?? []
    const length = points
      .slice(1)
      .reduce(
        (sum, point, index) =>
          sum + Math.hypot(point[0] - points[index][0], point[1] - points[index][1]),
        0
      )
    if (length < 40) {
      add(
        'warning',
        'short-dash',
        arrow,
        `is dashed but only ${Math.round(length)} long, so it prints solid; make it 40 or longer, or dotted`
      )
    }
  }
}

/** 🔥 means something only beside ❄️: trained parts among frozen ones. */
function badgeChecks(elements, add) {
  const count = (name) =>
    elements.filter((element) => element.customData?.asterIcon === name).length
  const trained = count('fire')
  if (trained && !count('snowflake')) {
    add(
      'warning',
      'badge-noise',
      null,
      `${trained} 🔥 badge(s) but nothing frozen; 🔥/❄️ mark trained parts beside frozen ones, so drop them when every module trains`
    )
  }
}

/**
 * Text in the style's sizes only: labels and small text (16 and 14) on every page, plus the
 * illustrative style's own title and key-phrase sizes. One finding names every other size.
 */
function textSizeChecks(elements, style, add) {
  const allowed = new Set([style.textSize, style.smallSize, style.titleSize, style.calloutSize])
  const odd = elements.filter(
    (element) =>
      element.type === 'text' &&
      typeof element.fontSize === 'number' &&
      !allowed.has(Math.round(element.fontSize))
  )
  if (odd.length) {
    const sizes = [...new Set(odd.map((element) => Math.round(element.fontSize)))].toSorted(
      (first, second) => first - second
    )
    add(
      'warning',
      'text-size',
      odd[0],
      `text at size ${sizes.join(', ')} (${odd
        .slice(0, 3)
        .map((element) => element.id)
        .join(
          ', '
        )}${odd.length > 3 ? ', …' : ''}); the ${style.name} style uses ${[...allowed].toSorted((first, second) => first - second).join(', ')} (labels ${style.textSize}, small text ${style.smallSize}, titles ${style.titleSize}, key phrases ${style.calloutSize})`
    )
  }
}

/** Style warnings for a figure drawn from scratch; a recreation keeps its reference's look. */
export function lookChecks(elements, page, add, pageFrame = null, allowed = () => new Set()) {
  const style = figureStyle(page?.style, page?.accent)
  // Why: the agent may resize only a page it sized itself (figures new, fig.setPage).
  const sized = page?.sizeBy === 'agent'
  const gaps = (pageFrame?.customData?.asterAllowAreas ?? [])
    .filter((entry) => entry?.rule === 'empty-region')
    .map(({ x, y, width, height }) => ({ x, y, width, height }))
  colorChecks(elements, style, page, add)
  lossChecks(elements, add)
  textChecks(elements, add, allowed)
  textSizeChecks(elements, style, add)
  placeholderChecks(elements, add)
  pageChecks(elements, page, add, { sized, gaps })
  spaceChecks(elements, page, add, { sized, gaps })
  sizeChecks(elements, add)
  emptyBoxChecks(elements, add)
  backgroundChecks(elements, add)
  badgeChecks(elements, add)
}
