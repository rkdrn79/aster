// Layout lint for figure scenes: what would print wrong, with the element ids to fix.
import {
  PAGE_FRAME_ID,
  PAPER_STYLE,
  checkFigureScene,
  elementLabel,
  figureAreas,
  figurePage
} from './research-figures-model.mjs'
import {
  distanceToBounds,
  elementBounds,
  isInside,
  overlaps
} from './research-figures-geometry.mjs'
import {
  BOUND_TEXT_PADDING,
  boundTextRoom,
  glyphBounds,
  inkHeight,
  measureText,
  missingGlyphs,
  ROUNDED_FONT
} from './research-figures-text.mjs'
import { unbracedScript } from './research-figures-type.mjs'
import { layoutChecks } from './research-figures-lint-layout.mjs'
import { lossLinkChecks } from './research-figures-lint-loss.mjs'
import { runLabelChecks } from './research-figures-lint-boxes.mjs'
import { lookChecks } from './research-figures-lint-look.mjs'
import { panelChecks, printScale } from './research-figures-lint-panels.mjs'
import { chipChecks, faintChecks, glyphSizeChecks } from './research-figures-lint-print.mjs'
import { routeLintChecks } from './research-figures-lint-route.mjs'

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])
/** How far outside an area a neighbour may be and still be listed for connecting arrows. */
export const AREA_NEIGHBOUR_MARGIN = 96
/** What `intentional: true` on an item allows: a shape that carries meaning, a deliberate gap. */
export const INTENTIONAL_CODES = new Set(['empty-box', 'uneven-spacing', 'empty-region'])

const round = (value) => Math.round(value * 10) / 10

function live(scene) {
  return (Array.isArray(scene?.elements) ? scene.elements : []).filter(
    (element) => element && typeof element === 'object' && !element.isDeleted
  )
}

function textChecks(element, byId, add, recreating, scale) {
  const missing = missingGlyphs(element.text ?? '', element.fontFamily)
  if (missing.length) {
    add(
      'error',
      'missing-glyph',
      element,
      `no glyph for ${missing.join(' ')} in the paper font; use the kit's math label or plain letters`
    )
  }
  // Why: 144 units per inch, so a fontSize prints at half its value in points.
  // Why 14: text in a paper figure prints at 7 pt or more at its final width; scripts of math
  // may go to 5.5 pt (a 16-unit label's script), not below: judges read smaller as unreadable.
  // A recreation keeps its reference's sizes down to 5.5 pt.
  const smallest = element.customData?.asterMath ? 11 : recreating ? 11 : 14
  // Why the scale: a page wider than the paper's text prints shrunk to fit it.
  const printed = (element.fontSize * scale) / 2
  if (element.fontSize * scale < smallest - 0.01) {
    add(
      'warning',
      'small-text',
      element,
      scale < 1
        ? `fontSize ${element.fontSize} prints at ${round(printed)} pt once the ${round(1 / scale)}× wider page is shrunk to the column; keep text at ${smallest / 2} pt or more`
        : `fontSize ${element.fontSize} prints under ${smallest / 2} pt`
    )
  }
  if (![PAPER_STYLE.fontFamily, ROUNDED_FONT].includes(element.fontFamily)) {
    add(
      'warning',
      'font',
      element,
      `fontFamily ${element.fontFamily}; the paper font is 9 (6, Nunito, in the illustrative style)`
    )
  }
  const container = element.containerId ? byId.get(element.containerId) : null
  if (container && SHAPES.has(container.type)) {
    // Why: Excalidraw rewraps a label wider than the room, but a taller one only needs its ink
    // inside the box's edges, so small exact boxes from a reference are fine.
    const width = measureText(element.text ?? '', element.fontSize ?? 16, element.fontFamily).width
    const height = inkHeight(element.text ?? '', element.fontSize ?? 16, element.lineHeight)
    const room = boundTextRoom(container)
    const inside = room.height + BOUND_TEXT_PADDING * 2
    if (width > room.width + 0.5 || height > inside + 0.5) {
      add(
        'error',
        'text-overflow',
        element,
        `"${element.text}" needs ${round(width)} wide and ${round(height)} tall but ${container.id} leaves ${round(room.width)} × ${round(inside)}; widen or heighten the box`
      )
    }
    if (!(container.boundElements ?? []).some((bound) => bound?.id === element.id)) {
      add(
        'error',
        'binding',
        element,
        `container ${container.id} does not list this text in boundElements`
      )
    }
  }
}

function arrowChecks(element, byId, add) {
  const points = element.points ?? []
  for (const [side, index] of [
    ['startBinding', 0],
    ['endBinding', points.length - 1]
  ]) {
    const binding = element[side]
    if (!binding) {
      continue
    }
    const target = byId.get(binding.elementId)
    if (!target) {
      continue
    }
    if (!(target.boundElements ?? []).some((bound) => bound?.id === element.id)) {
      add(
        'error',
        'binding',
        element,
        `${side} is ${target.id}, which does not list this arrow in boundElements`
      )
    }
    const point = points[index]
    const distance = point
      ? distanceToBounds([element.x + point[0], element.y + point[1]], elementBounds(target))
      : 0
    if (distance > 16) {
      add(
        'warning',
        'binding-gap',
        element,
        `${side === 'startBinding' ? 'start' : 'end'} is ${round(distance)} units from ${target.id}`
      )
    }
  }
}

function shapeBindingChecks(element, byId, add) {
  for (const bound of element.boundElements ?? []) {
    const other = byId.get(bound?.id)
    if (!other) {
      continue
    }
    const pointsBack =
      bound.type === 'text'
        ? other.containerId === element.id
        : other.startBinding?.elementId === element.id || other.endBinding?.elementId === element.id
    if (!pointsBack) {
      add('error', 'binding', element, `boundElements lists ${other.id}, which is not bound to it`)
    }
  }
}

/** Invisible boxes (arrow targets over polygons, stack outlines) have no edge to cross. */
function visibleShape(element) {
  return (
    SHAPES.has(element.type) &&
    !(element.strokeColor === 'transparent' && element.backgroundColor === 'transparent')
  )
}

/** A recreation keeps the reference's own heads, so only paper-style rules relax. */
function styleChecks(element, add, recreating) {
  if (!recreating && [element.startArrowhead, element.endArrowhead].includes('arrow')) {
    add('warning', 'arrowhead', element, 'open "arrow" heads print crude; use "triangle"')
  }
  if (
    element.type === 'rectangle' &&
    element.roundness?.type === 3 &&
    !element.roundness.value &&
    element.height > 64
  ) {
    add(
      'warning',
      'roundness',
      element,
      'roundness {"type":3} without "value" rounds a tall box into a blob; use {"type":3,"value":8}'
    )
  }
  if (element.roughness !== undefined && element.roughness !== 0) {
    add('warning', 'roughness', element, `roughness ${element.roughness}; paper figures use 0`)
  }
}

/** The rule codes an element (or the item that owns it) was allowed: `fig.allow`, `intentional`. */
function allowedCodes(element, byId) {
  const owner = byId.get(element?.customData?.asterKit)
  const codes = new Set()
  for (const item of [element, owner]) {
    for (const code of item?.customData?.asterAllow ?? []) {
      codes.add(code)
    }
    if (item?.customData?.asterIntentional) {
      for (const code of INTENTIONAL_CODES) {
        codes.add(code)
      }
    }
  }
  return codes
}

/**
 * Errors would print wrong (outside the page, clipped or unreadable labels, broken bindings);
 * warnings are style; notes say what the agent cannot fix alone (a page someone else sized).
 * `area` limits the report to that area's elements and their arrows. `fig.allow(rule, ids)`
 * and `intentional: true` drop the findings the person or the agent chose on purpose.
 */
export function lintFigureScene(scene, { area: areaId } = {}) {
  const errors = []
  const warnings = []
  const notes = []
  const elements = live(scene)
  const byId = new Map(elements.map((element) => [element.id, element]))
  const pageFrame = elements.find(
    (element) =>
      element.type === 'frame' &&
      (element.id === PAGE_FRAME_ID || element.customData?.asterPage !== undefined)
  )
  const pageAllowed = new Set(pageFrame?.customData?.asterAllow ?? [])
  // Why extra: a finding about a stretch of the page carries its regions for the lint PNG.
  const add = (level, code, element, message, extra = {}) => {
    if (pageAllowed.has(code) || (element && allowedCodes(element, byId).has(code))) {
      return
    }
    const list = level === 'error' ? errors : level === 'note' ? notes : warnings
    list.push({ code, id: element?.id ?? null, message, ...extra })
  }
  for (const issue of checkFigureScene(scene)) {
    errors.push({ code: 'invalid', id: null, message: issue })
  }
  if (errors.length) {
    return { errors, warnings, notes }
  }
  const page = figurePage(elements)
  const recreating = Boolean(page?.reference)
  const areas = figureAreas(elements)
  const area = areaId ? areas.find((entry) => entry.id === areaId) : null
  if (areaId && !area) {
    return {
      errors: [{ code: 'area', id: areaId, message: `no area frame ${areaId}` }],
      warnings,
      notes
    }
  }
  const scale = printScale(page)
  const inScope = (element) =>
    !area ||
    element.id === area.id ||
    element.frameId === area.id ||
    ['startBinding', 'endBinding'].some(
      (side) => byId.get(element[side]?.elementId)?.frameId === area.id
    )
  const texts = []
  const warnedTex = new Set()
  for (const element of elements) {
    if (!inScope(element) || element.id === PAGE_FRAME_ID) {
      continue
    }
    const bounds = elementBounds(element)
    // Why not frames: areas never print, and the agent may not move one.
    if (page && element.type !== 'frame' && !isInside(bounds, page)) {
      add(
        'error',
        'outside-page',
        element,
        `extends outside the page frame (${round(bounds.x)}, ${round(bounds.y)}, ${round(bounds.width)} × ${round(bounds.height)})`
      )
    }
    const owner = element.frameId ? areas.find((entry) => entry.id === element.frameId) : null
    if (owner && !isInside(bounds, owner)) {
      add('error', 'outside-area', element, `has frameId ${owner.id} but extends outside that area`)
    }
    const container = areas.find((entry) => entry.id !== element.id && isInside(bounds, entry))
    if (
      container &&
      element.type !== 'frame' &&
      element.frameId !== container.id &&
      !element.containerId
    ) {
      add(
        'warning',
        'frame-id',
        element,
        `lies inside area ${container.id} but has frameId ${element.frameId ?? 'null'}`
      )
    }
    const tex = element.customData?.asterMath
    if (unbracedScript(tex) && !warnedTex.has(tex)) {
      warnedTex.add(tex)
      add(
        'warning',
        'math-script',
        element,
        `"${tex}": ^( or _( scripts only the "("; write ^{(i)}`
      )
    }
    if (element.type === 'text') {
      textChecks(element, byId, add, recreating, scale)
      if (!element.containerId) {
        texts.push({ element, bounds: glyphBounds(element) })
      }
    }
    if (element.type === 'arrow' || element.type === 'line') {
      arrowChecks(element, byId, add)
    }
    if (SHAPES.has(element.type)) {
      shapeBindingChecks(element, byId, add)
    }
    // Why these pass: photos, typeset math and icons are drawn on purpose; a pasted image is not.
    const drawn = ['asterPhoto', 'asterTex', 'asterIcon'].some((key) => element.customData?.[key])
    if (element.type === 'image' && !drawn) {
      add(
        'warning',
        'image',
        element,
        'an image element is left; redraw it as shapes and delete it'
      )
    }
    if (element.type !== 'frame') {
      styleChecks(element, add, recreating)
    }
  }
  for (const [index, { element, bounds }] of texts.entries()) {
    for (const other of texts.slice(index + 1)) {
      const sameLabel = (element.groupIds ?? []).some((group) =>
        other.element.groupIds?.includes(group)
      )
      if (!sameLabel && overlaps(bounds, other.bounds)) {
        add('warning', 'text-overlap', element, `overlaps the text ${other.element.id}`)
      }
    }
    const owner = element.customData?.asterKit
    const groups = new Set(element.groupIds ?? [])
    const crossed = elements.filter((shape) => {
      // Why: a glyph's own label sits over its own parts on purpose (a network's name), and a
      // label grouped with its shape (a step marker's digit in its ring) is one item with it.
      if (
        !visibleShape(shape) ||
        (owner && shape.customData?.asterKit === owner && shape.id !== owner) ||
        (shape.groupIds ?? []).some((group) => groups.has(group))
      ) {
        return false
      }
      const shapeBounds = elementBounds(shape)
      return overlaps(bounds, shapeBounds) && !isInside(bounds, shapeBounds)
    })
    // Why one finding: a label over a glyph crosses each of its cells; it is one overlap.
    if (crossed.length) {
      const items = [...new Set(crossed.map((shape) => shape.customData?.asterKit ?? shape.id))]
      add(
        'warning',
        'text-over-shape',
        element,
        crossed.length === 1
          ? `crosses the edge of ${crossed[0].id}`
          : `crosses the edges of ${crossed.length} shapes of ${items.slice(0, 3).join(', ')}${items.length > 3 ? ', …' : ''}; move it clear of them`
      )
    }
  }
  const scoped = elements.filter((element) => inScope(element) && element.id !== PAGE_FRAME_ID)
  layoutChecks(scoped, add)
  runLabelChecks(scoped, add)
  routeLintChecks(scoped, add, (element) => allowedCodes(element, byId))
  panelChecks(scoped, page, add, { recreating })
  if (!recreating) {
    chipChecks(scoped, add, scale)
    glyphSizeChecks(scoped, add, scale)
    faintChecks(scoped, add)
  }
  if (!recreating) {
    lossLinkChecks(scoped, add)
  }
  if (!recreating && !area) {
    lookChecks(scoped, page, add, pageFrame, (element) => allowedCodes(element, byId))
  }
  if (!area) {
    const used = new Set(
      elements.filter((entry) => entry.type === 'image').map((entry) => entry.fileId)
    )
    for (const fileId of Object.keys(scene.files ?? {})) {
      if (!used.has(fileId)) {
        warnings.push({
          code: 'orphan-file',
          id: fileId,
          message: `files.${fileId} is not used by any image; delete it`
        })
      }
    }
  }
  return { errors, warnings, notes }
}

/** Elements outside an area but within `margin` of it: what new arrows may connect to. */
export function areaNeighbours(elements, area, margin = AREA_NEIGHBOUR_MARGIN) {
  const grown = {
    x: area.x - margin,
    y: area.y - margin,
    width: area.width + margin * 2,
    height: area.height + margin * 2
  }
  const items = live({ elements })
  return items
    .filter(
      (element) =>
        SHAPES.has(element.type) &&
        element.frameId !== area.id &&
        element.id !== PAGE_FRAME_ID &&
        overlaps(elementBounds(element), grown, 0) &&
        !isInside(elementBounds(element), area)
    )
    .map((element) => {
      const bounds = elementBounds(element)
      return {
        id: element.id,
        type: element.type,
        label: elementLabel(element, items).replace(/\s+/g, ' ').trim().slice(0, 80),
        x: round(bounds.x),
        y: round(bounds.y),
        width: round(bounds.width),
        height: round(bounds.height)
      }
    })
}
