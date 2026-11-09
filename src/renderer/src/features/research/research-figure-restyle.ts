import {
  FIGURE_LINE_WIDTH,
  isLossRed,
  isLossRole,
  styleColor,
  type FigureStyle
} from '../../../../research-harness/research-figures-style.mjs'

/**
 * Recolours a figure from one paper style to another by role. An element's role is its mark
 * (`asterRole`, `asterLine`, a trained or frozen badge on it) or the kit colour it was drawn
 * in, read back from the page's recorded style (the kit records no colour names, so `accent` is
 * the accent's tint and `strong` the heavy gray). Colours the style does not name (a hex the
 * person or the agent picked, a photo) stay as they are. Pure, so the canvas and tests share it.
 */

/** The element fields a restyle reads; Excalidraw elements and plain test objects fit. */
export type RestyleElement = {
  readonly id: string
  readonly type: string
  readonly isDeleted?: boolean
  readonly strokeColor: string
  readonly backgroundColor: string
  readonly strokeWidth?: number
  readonly roundness?: { readonly type: number; readonly value?: number } | null
  readonly customData?: Readonly<Record<string, unknown>> | null
  readonly containerId?: string | null
}

export type RestylePatch = {
  strokeColor?: string
  backgroundColor?: string
  strokeWidth?: number
  /** Excalidraw's adaptive radius (3): a fixed corner, as the kit draws boxes. */
  roundness?: { type: 3; value: number }
}

export type RestylePlan = {
  patches: Map<string, RestylePatch>
  /** Coloured elements no role reached: they keep their colours. */
  kept: number
}

type Kind = 'shape' | 'text' | 'line' | 'other'
type Paint = { fill: string; stroke: string }

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])
/** Kit colours a box can be drawn in, by position so they carry across presets. */
const BOX_NAMES = new Set([
  'block',
  'strong',
  'white',
  'accent',
  'accent-strong',
  'accent2',
  'accent2-strong',
  'accent3',
  'accent3-strong',
  'highlight'
])
/** Shape roles (the Inspector's, the kit's badges) and the kit colour each stands for. */
const ROLE_NAMES: Record<string, string> = {
  block: 'block',
  emphasis: 'accent',
  frozen: 'strong',
  panel: 'panel',
  loss: 'loss'
}
/** Line roles and the ink each takes. */
const LINE_INKS: Record<string, string> = {
  data: 'line',
  main: 'ink',
  side: 'muted',
  aux: 'muted'
}

const norm = (color: unknown): string | null =>
  typeof color === 'string' ? color.trim().toLowerCase() : null
/** A colour of its own: not transparent, and not the page's white. */
const coloured = (color: string): boolean =>
  !['transparent', '', '#ffffff', '#fff'].includes(norm(color) ?? '')

function kindOf(element: RestyleElement): Kind {
  if (SHAPES.has(element.type)) {
    return 'shape'
  }
  if (element.type === 'text') {
    return 'text'
  }
  if (element.type === 'arrow' || element.type === 'line' || element.type === 'freedraw') {
    // Why: a closed, filled polyline (the kit's trapezoids) is a box.
    return element.type === 'line' && coloured(element.backgroundColor) ? 'shape' : 'line'
  }
  return 'other'
}

/** The kit colours a style paints boxes in, with the fill and outline of each. */
function shapePaints(style: FigureStyle): Map<string, Paint> {
  const names = [
    'block',
    'strong',
    'panel',
    'white',
    'accent',
    'accent-strong',
    ...style.accents.slice(1, 3).flatMap((_, index) => {
      const name = `accent${index + 2}`
      return [name, `${name}-strong`]
    }),
    'highlight',
    ...style.panels.map((_, index) => `panel-${index + 1}`),
    'loss'
  ]
  return new Map(
    names.map((name) => {
      const paint = styleColor(style, name)
      return [name, { fill: paint.fill, stroke: paint.stroke }]
    })
  )
}

/** The inks a style draws text, lines and outlines in, by name. */
function inkSlots(style: FigureStyle): Map<string, string> {
  const slots = new Map<string, string>([
    ['ink', style.ink],
    ['line', style.line],
    ['muted', style.muted],
    ['outline', style.boxStroke],
    // Why: a white box without outlines gets the heavy gray as its edge.
    ['edge', style.boxStroke === 'transparent' ? style.strong : style.boxStroke]
  ])
  style.accents.slice(0, 3).forEach((accent, index) => {
    const name = index === 0 ? 'accent' : `accent${index + 1}`
    slots.set(`${name}-ink`, accent.ink)
    slots.set(`${name}-solid`, accent.solid)
  })
  style.panels.forEach((panel, index) => slots.set(`panel-${index + 1}-ink`, panel.ink))
  return slots
}

const ACCENT_INKS = ['accent-ink', 'accent2-ink', 'accent3-ink']
const SOLIDS = ['accent-solid', 'accent2-solid', 'accent3-solid']
const PANEL_INKS = ['panel-1-ink', 'panel-2-ink', 'panel-3-ink', 'panel-4-ink']

/** Which ink a colour most likely is, by what is drawn with it (one hex can fill several). */
const INK_ORDER: Record<'text' | 'line' | 'stroke' | 'icon', string[]> = {
  text: ['ink', ...ACCENT_INKS, ...PANEL_INKS, 'muted', 'line', ...SOLIDS],
  line: ['line', 'ink', 'muted', ...ACCENT_INKS, ...SOLIDS, ...PANEL_INKS],
  stroke: ['outline', 'ink', 'line', 'muted', ...ACCENT_INKS, ...SOLIDS, 'edge', ...PANEL_INKS],
  icon: ['ink', ...ACCENT_INKS, 'line', 'muted', ...SOLIDS, ...PANEL_INKS]
}

/** A paint or ink name the target style lacks, as the nearest one it has. */
function fallbackName(name: string): string {
  if (/^accent[23]-ink$/.test(name)) {
    return 'ink'
  }
  if (/^accent[23]-solid$/.test(name)) {
    return 'line'
  }
  if (/^accent[23](-strong)?$/.test(name)) {
    return 'strong'
  }
  if (/^panel-\d+-ink$/.test(name)) {
    return 'accent-ink'
  }
  if (/^panel-\d+$/.test(name)) {
    return 'panel'
  }
  return name
}

function paintIn(paints: Map<string, Paint>, name: string): Paint | undefined {
  return paints.get(name) ?? paints.get(fallbackName(name))
}

function inkIn(slots: Map<string, string>, name: string): string | undefined {
  return slots.get(name) ?? slots.get(fallbackName(name))
}

function inkName(
  slots: Map<string, string>,
  color: string,
  order: readonly string[]
): string | null {
  const value = norm(color)
  return order.find((name) => norm(slots.get(name)) === value) ?? null
}

/** Ids of loss nodes, so their symbols, labels and links restyle as the loss does. */
function lossOwners(elements: readonly RestyleElement[]): Set<string> {
  return new Set(
    elements
      .filter((element) => element.customData?.asterRole === 'loss')
      .map((element) => element.id)
  )
}

function badgeRoles(elements: readonly RestyleElement[]): Map<string, string> {
  const roles = new Map<string, string>()
  for (const element of elements) {
    const match = /^(.+)-(trainable|frozen)$/.exec(element.id)
    if (match && element.type === 'image') {
      roles.set(match[1], match[2] === 'trainable' ? 'accent' : 'strong')
    }
  }
  return roles
}

type Context = {
  from: FigureStyle
  to: FigureStyle
  fromPaints: Map<string, Paint>
  toPaints: Map<string, Paint>
  fromInks: Map<string, string>
  toInks: Map<string, string>
  losses: Set<string>
  badges: Map<string, string>
}

/** An ink in the new style, or undefined when the colour is not one of the old style's. */
function mapInk(context: Context, color: string, order: readonly string[]): string | undefined {
  const name = inkName(context.fromInks, color, order)
  return name ? inkIn(context.toInks, name) : undefined
}

/** A red loss stays red, unless the new accent sits too near red to tell them apart. */
function lossRed(context: Context, color: string, ink: string): string | undefined {
  return isLossRed(color) && context.to.loss.clash ? ink : undefined
}

function isLossPart(element: RestyleElement, context: Context): boolean {
  const owner = element.customData?.asterKit
  return (
    isLossRole(element.customData?.asterRole) ||
    (typeof element.containerId === 'string' && context.losses.has(element.containerId)) ||
    (typeof owner === 'string' && context.losses.has(owner))
  )
}

/** A ring round what a loss compares: red stays red unless the accent clashes, ink maps. */
function ringInk(element: RestyleElement, context: Context): string | undefined {
  return (
    lossRed(context, element.strokeColor, context.to.loss.ring) ??
    mapInk(context, element.strokeColor, INK_ORDER.line)
  )
}

function shapePatch(element: RestyleElement, context: Context): RestylePatch | null {
  const role = element.customData?.asterRole
  const fill = norm(element.backgroundColor)
  const stroke = norm(element.strokeColor)
  // Why apart: a box a loss compares keeps its own fill; only its outline is the loss's ring.
  const compared = role === 'compared'
  const lossNode = !compared && isLossPart(element, context)
  const preferred =
    (typeof role === 'string' ? ROLE_NAMES[role] : undefined) ?? context.badges.get(element.id)
  const matches = [...context.fromPaints].filter(
    ([name, paint]) => norm(paint.fill) === fill && lossNode === (name === 'loss')
  )
  const pair = compared ? [] : matches.filter(([, paint]) => norm(paint.stroke) === stroke)
  // Why white needs its outline too: plain white is the page, not a colour the style names.
  const fillOnly = fill === '#ffffff' && !compared ? [] : matches
  const pick = (list: typeof matches) =>
    list.find(([name]) => name === preferred)?.[0] ?? list[0]?.[0] ?? null
  const name = pick(pair) ?? pick(fillOnly)
  const patch: RestylePatch = {}
  if (name) {
    const next = paintIn(context.toPaints, name)
    if (next) {
      patch.backgroundColor = next.fill
      patch.strokeColor = compared
        ? (ringInk(element, context) ?? element.strokeColor)
        : norm(context.fromPaints.get(name)?.stroke) === stroke
          ? next.stroke
          : (mapInk(context, element.strokeColor, INK_ORDER.stroke) ?? element.strokeColor)
    }
    if (BOX_NAMES.has(name)) {
      Object.assign(patch, boxShape(element, context, compared))
    }
  } else if (fill === 'transparent' || lossNode || compared) {
    // Why: an outline-only shape (a ring, a note, a hand-drawn frame) carries its ink.
    const ink = compared
      ? ringInk(element, context)
      : ((lossNode ? lossRed(context, element.strokeColor, context.to.loss.stroke) : undefined) ??
        mapInk(context, element.strokeColor, INK_ORDER.line))
    if (ink) {
      patch.strokeColor = ink
    }
  }
  // Why an empty patch: a loss's part has a role even when it keeps its colour (red stays red).
  return Object.keys(patch).length || lossNode || compared ? patch : null
}

/** The new style's corner radius and outline width, where the box had the old style's. */
function boxShape(element: RestyleElement, context: Context, ringed: boolean): RestylePatch {
  const patch: RestylePatch = {}
  const { from, to } = context
  if (
    element.type === 'rectangle' &&
    element.roundness?.type === 3 &&
    element.roundness.value === from.radius &&
    to.radius !== from.radius
  ) {
    patch.roundness = { type: 3, value: to.radius }
  }
  const fromWidth = from.outlineWidth ?? FIGURE_LINE_WIDTH
  const toWidth = to.outlineWidth ?? FIGURE_LINE_WIDTH
  if (!ringed && element.strokeWidth === fromWidth && toWidth !== fromWidth) {
    patch.strokeWidth = toWidth
  }
  return patch
}

function textPatch(element: RestyleElement, context: Context): RestylePatch | null {
  const loss = isLossPart(element, context)
  const ink =
    (loss ? lossRed(context, element.strokeColor, context.to.loss.text) : undefined) ??
    mapInk(context, element.strokeColor, INK_ORDER.text)
  return ink ? { strokeColor: ink } : loss ? {} : null
}

function linePatch(element: RestyleElement, context: Context): RestylePatch | null {
  const role = element.customData?.asterRole
  const line = element.customData?.asterLine
  const lossLink = role === 'loss-link' || (role === 'loss' && element.type === 'arrow')
  const roleInk =
    typeof role === 'string' && LINE_INKS[role]
      ? LINE_INKS[role]
      : typeof line === 'string' && LINE_INKS[line]
        ? LINE_INKS[line]
        : null
  let ink: string | undefined
  if (lossLink || isLossPart(element, context)) {
    ink =
      lossRed(context, element.strokeColor, context.to.loss.link) ??
      mapInk(context, element.strokeColor, INK_ORDER.line)
  } else if (roleInk && inkName(context.fromInks, element.strokeColor, INK_ORDER.line)) {
    // Why the role decides: one hex can be both ink and line (outline, illustrative).
    ink = inkIn(context.toInks, roleInk)
  } else {
    ink = mapInk(context, element.strokeColor, INK_ORDER.line)
  }
  if (!ink) {
    return lossLink || isLossPart(element, context) ? {} : null
  }
  const fill = norm(element.backgroundColor)
  return {
    strokeColor: ink,
    // Why: an arrow's filled head takes its line's colour.
    ...(fill === norm(element.strokeColor) ? { backgroundColor: ink } : {})
  }
}

/**
 * What changes when a figure drawn in `from` takes `to`: a patch per element that has a role,
 * and how many coloured elements had none and stay as they were. The page frame is left out.
 */
export function restylePlan(
  elements: readonly RestyleElement[],
  from: FigureStyle,
  to: FigureStyle,
  pageId: string | null = null
): RestylePlan {
  const live = elements.filter((element) => !element.isDeleted && element.id !== pageId)
  const context: Context = {
    from,
    to,
    fromPaints: shapePaints(from),
    toPaints: shapePaints(to),
    fromInks: inkSlots(from),
    toInks: inkSlots(to),
    losses: lossOwners(live),
    badges: badgeRoles(live)
  }
  const patches = new Map<string, RestylePatch>()
  let kept = 0
  for (const element of live) {
    const kind = kindOf(element)
    const patch =
      kind === 'shape'
        ? shapePatch(element, context)
        : kind === 'text'
          ? textPatch(element, context)
          : kind === 'line'
            ? linePatch(element, context)
            : null
    const changed = patch
      ? Object.fromEntries(
          Object.entries(patch).filter(
            ([key, value]) =>
              JSON.stringify(value) !== JSON.stringify(Reflect.get(element, key) ?? null)
          )
        )
      : {}
    if (Object.keys(changed).length) {
      patches.set(element.id, changed)
    } else if (
      !patch &&
      kind !== 'other' &&
      (coloured(element.strokeColor) || coloured(element.backgroundColor))
    ) {
      kept += 1
    }
  }
  return { patches, kept }
}

/**
 * An icon's or a math label's SVG inked in the new style: every hex that is one of the old
 * style's inks becomes the new one. The snowflake badge is drawn in the line gray, the flame
 * in the accent; other icons and math in ink.
 */
export function restyleSvg(
  svg: string,
  from: FigureStyle,
  to: FigureStyle,
  icon: string | null = null,
  /** For a loss's own symbol: the ink its red turns to (the accent clashes with red). */
  lossInk: string | null = null
): string {
  const fromInks = inkSlots(from)
  const toInks = inkSlots(to)
  const order =
    icon === 'snowflake'
      ? ['line', ...INK_ORDER.icon]
      : icon === 'fire'
        ? ['accent-ink', ...INK_ORDER.icon]
        : INK_ORDER.icon
  return svg.replace(/#[0-9a-f]{6}\b/gi, (hex) => {
    if (lossInk && isLossRed(hex)) {
      return lossInk
    }
    const name = inkName(fromInks, hex, order)
    return (name ? inkIn(toInks, name) : undefined) ?? hex
  })
}

/** How an inked image (an icon, a badge, a math label) is re-inked: its icon and loss ink. */
export type ImageInk = { icon: string | null; lossInk: string | null }

/**
 * The images a restyle re-inks, by element id: line icons, badges and math, which the kit
 * inks in the style; photos and drawn pictures keep their colours.
 */
export function inkedImages(
  elements: readonly RestyleElement[],
  to: FigureStyle
): Map<string, ImageInk> {
  const losses = lossOwners(elements.filter((element) => !element.isDeleted))
  const images = new Map<string, ImageInk>()
  for (const element of elements) {
    const icon = element.customData?.asterIcon
    const math = element.customData?.asterMath
    if (element.isDeleted || element.type !== 'image' || (icon === undefined && !math)) {
      continue
    }
    const owner = element.customData?.asterKit
    const lossPart = typeof owner === 'string' && losses.has(owner)
    images.set(element.id, {
      icon: typeof icon === 'string' ? icon : null,
      lossInk: lossPart && to.loss.clash ? to.loss.text : null
    })
  }
  return images
}

/** The page's record of a style the person chose: the agent keeps it (`styleBy: 'person'`). */
export function pageWithStyle(
  asterPage: Readonly<Record<string, unknown>> | undefined,
  style: Pick<FigureStyle, 'name' | 'accentName'>
): Record<string, unknown> {
  // Why drop agentStyle: the page model reads a style without it as the person's choice.
  const { agentStyle: _agent, ...rest } = asterPage ?? {}
  return { ...rest, style: style.name, accent: style.accentName }
}
