// The kit's side of the paper look (research-figures-paper): choosing it with fig.style, the face
// read from the manuscript's preamble, and the clip-art substitutes. In the paper look a network
// is drawn as thin bars (or a trapezoid) with its name below, frozen and trainable are a short
// note in words, and icons stay off unless the person asked for them.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { catalogPath } from './research-catalog.mjs'
import { figureElement } from './research-figures-model.mjs'
import { FIGURE_ACCENTS, FIGURE_STYLES, styleColor } from './research-figures-style.mjs'
import { PRESET_ALIASES, accentFor } from './research-figures-palette.mjs'
import { FIGURE_LOOKS, PAPER_STROKE, pageLook } from './research-figures-paper.mjs'
import { PAPER_SERIF, paperSerif, serifForPreamble } from './research-figures-paper-fonts.mjs'
import { labelLines, makeLines, measureLines } from './research-figures-type.mjs'
import { warnKit } from './research-figures-cards.mjs'
import { oneOf } from './research-figures-options.mjs'

/** 'times' or 'cm' from the project's manuscript preamble; null when there is none to read. */
export function manuscriptFace(project) {
  try {
    const catalog = JSON.parse(readFileSync(catalogPath(project), 'utf8'))
    const source = catalog?.manuscript?.source
    if (typeof source !== 'string' || !source) {
      return null
    }
    return serifForPreamble(readFileSync(path.join(project, source), 'utf8').slice(0, 20_000))
  } catch {
    return null
  }
}

const knownStyle = (key) => Object.hasOwn(FIGURE_STYLES, key)

/** The look and face a page opens in: the paper look by default, its face from the manuscript. */
export function openedLook(page, faceOf) {
  const look = pageLook(page)
  return { look, font: look ? (page?.paperFont ?? faceOf()) : null }
}

/**
 * What fig.style(name, options) picks: the preset (`'paper'` keeps the current colours and asks
 * for the paper look), its accent and panels, and the look with its face. The paper look is the
 * default; `look: 'preset'` (or false) asks for the preset's own look, and 'illustrative' takes
 * its own unless `look: 'paper'`. `stored` is what the page keeps (null: the default).
 */
export function styleChoice(name, options, current, page, faceOf) {
  const { accent, panels } = options
  const paper = name === 'paper'
  const key = paper ? current.name : name === undefined ? undefined : (PRESET_ALIASES[name] ?? name)
  if (key !== undefined && !knownStyle(key)) {
    throw new Error(
      `Unknown style "${name}". Styles: ${Object.keys(FIGURE_STYLES).join(', ')}; 'paper' (or look: 'paper') draws any of them as published papers do`
    )
  }
  if (accent !== undefined && !accentFor(accent)) {
    throw new Error(
      `Unknown accent "${accent}". Accents: ${Object.keys(FIGURE_ACCENTS).join(', ')}, or any #hex (figures kit colors)`
    )
  }
  const asked = options.look === false || options.look === 'none' ? 'preset' : options.look
  const stored = paper
    ? 'paper'
    : asked !== undefined && asked !== null
      ? oneOf('look', asked, FIGURE_LOOKS)
      : key === 'illustrative'
        ? null
        : (page?.look ?? null)
  const look = pageLook({ look: stored, style: key ?? current.name, reference: page?.reference })
  if (options.font !== undefined && !paperSerif(options.font)) {
    throw new Error(
      `Unknown font "${options.font}": 'cm' (${PAPER_SERIF.cm.name}) or 'times' (${PAPER_SERIF.times.name})`
    )
  }
  const font = look ? (paperSerif(options.font)?.key ?? current.paperFont ?? faceOf()) : null
  const same = !key || key === current.name
  return {
    key: key ?? current.name,
    accent: accent ?? (same ? current.accentName : undefined),
    panels: panels ?? (same ? current.panels.map((panel) => panel.name) : undefined),
    look,
    stored,
    font
  }
}

/** Where a note goes on a corner of `box`: outside it, flush with that side. */
function notePlace(box, corner, width, height) {
  const top = corner.startsWith('top')
  const left = corner.endsWith('left')
  return { x: left ? box.x : box.right - width, y: top ? box.y - 2 - height : box.bottom + 2 }
}

export function paperMethods(core, fig) {
  const styleNow = () => core.styled({}).style
  const paper = () => styleNow().look === 'paper'
  const original = {
    nn: fig.nn,
    frozen: fig.frozen,
    trainable: fig.trainable,
    icon: fig.icon
  }
  /** "frozen" or "trainable" in words on a corner of the item, in the muted ink. */
  const note =
    (word) =>
    (targetId, spec = {}) => {
      const style = styleNow()
      const id = `${targetId}-${word}`
      // Why not spec.size: a badge's size is the sign's; the note is small text either way.
      const size = style.smallSize
      const lines = labelLines(spec.text ?? word, size, undefined, style)
      const probe = measureLines(lines, size, style)
      const corner =
        oneOf('corner', spec.corner, ['top-right', 'top-left', 'bottom-right', 'bottom-left']) ??
        'top-right'
      const where = spec.at
        ? { x: spec.at[0], y: spec.at[1] }
        : notePlace(core.bounds(targetId), corner, probe.width, probe.height)
      const placed = makeLines(
        core.styled({ id, size, color: spec.color ?? 'muted', frame: spec.frame, ...where }),
        lines
      )
      // Why the note's own id: scripts find a badge as <id>-frozen, and so they find the note.
      placed.elements[0].id = id
      core.claim(id, placed.elements)
      core.insert(placed.elements)
      return placed.elements[0]
    }
  /** A network as thin upright bars (layers) or a trapezoid, its name below: as papers draw it. */
  const bars = (spec) => {
    const style = styleNow()
    const { id, x = 0, y = 0, w = 72, h = 64 } = spec
    const count = Math.max(1, Math.min(6, (spec.layers ?? [3, 4, 3]).length))
    const paint = styleColor(style, spec.color ?? 'block')
    const stroke = paint.stroke && paint.stroke !== 'transparent' ? paint.stroke : style.line
    const shape = oneOf('shape', spec.shape, ['bars', 'trapezoid']) ?? 'bars'
    // Why three quarters of w: the bars read as one network, not as loose sticks.
    const gap = 4
    const barW = Math.max(6, Math.min(22, (w * 0.75 - gap * (count - 1)) / count))
    const total = count * barW + (count - 1) * gap
    const left = x + (w - total) / 2
    const body = {
      x: shape === 'bars' ? left : x,
      y,
      width: shape === 'bars' ? total : w,
      height: h
    }
    const items = [
      figureElement('rectangle', {
        id,
        ...body,
        strokeColor: 'transparent',
        backgroundColor: 'transparent',
        boundElements: [],
        customData: { asterGlyph: 'nn', asterPaper: shape }
      })
    ]
    const common = { strokeColor: stroke, backgroundColor: paint.fill, strokeWidth: PAPER_STROKE }
    if (shape === 'trapezoid') {
      const inset = h * 0.22
      items.push(
        figureElement('line', {
          id: `${id}-body`,
          x,
          y,
          width: w,
          height: h,
          points: [
            [0, 0],
            [w, inset],
            [w, h - inset],
            [0, h],
            [0, 0]
          ],
          ...common
        })
      )
    } else {
      for (let index = 0; index < count; index += 1) {
        items.push(
          figureElement('rectangle', {
            id: `${id}-b${index}`,
            x: left + index * (barW + gap),
            y,
            width: barW,
            height: h,
            ...common
          })
        )
      }
    }
    if (spec.label !== undefined) {
      const size = spec.size ?? style.textSize
      const lines = labelLines(spec.label, size, undefined, style)
      const side = oneOf('labelSide', spec.labelSide, ['above', 'center', 'below']) ?? 'below'
      const probe = measureLines(lines, size, style)
      const cy =
        side === 'above'
          ? y - 4 - probe.height / 2
          : side === 'center'
            ? y + h / 2
            : y + h + 4 + probe.height / 2
      items.push(
        ...makeLines(core.styled({ id: `${id}-label`, size, cx: x + w / 2, cy }), lines).elements
      )
      // Why the name inside the bound box: an arrow to the network's side ends past its name.
      if (side !== 'center') {
        const top = Math.min(y, cy - probe.height / 2)
        const bottom = Math.max(y + h, cy + probe.height / 2)
        Object.assign(items[0], {
          y: top,
          height: bottom - top,
          customData: { ...items[0].customData, asterBody: { ...body } }
        })
      }
    }
    core.add(items, id)
    return { id, ...body, x, width: w }
  }
  const asked = (spec) => spec?.asked === true
  const skipped = (what, spec) => {
    warnKit([
      `${spec?.id ?? what}: the paper look draws no ${what}; say it in words, or pass asked: true when the person asked for one`
    ])
    return null
  }
  return {
    nn: (spec) => (paper() && spec.shape !== 'nodes' ? bars(spec) : original.nn(spec)),
    frozen: (targetId, spec = {}) =>
      paper() && !asked(spec) ? note('frozen')(targetId, spec) : original.frozen(targetId, spec),
    trainable: (targetId, spec = {}) =>
      paper() && !asked(spec)
        ? note('trainable')(targetId, spec)
        : original.trainable(targetId, spec),
    icon: (name, spec = {}) =>
      paper() && !asked(spec) ? skipped('icons', spec) : original.icon(name, spec)
  }
}
