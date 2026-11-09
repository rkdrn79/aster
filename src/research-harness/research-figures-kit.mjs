// A drawing kit for agents: open a figure, add boxes, text, math labels, data glyphs and bound
// arrows in the figure's style, and save it back keeping every other element and id. Adding an
// id that exists replaces it (keeping the arrows bound to it), so a script can be rerun; save()
// returns the layout lint.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveProjectRoot } from './research-catalog.mjs'
import {
  FIGURE_UNITS_PER_INCH,
  PAGE_FRAME_ID,
  figureAreas,
  figurePage,
  figureSizeLabel
} from './research-figures-model.mjs'
import { imageSize } from './research-figures-image.mjs'
import {
  makeChevron,
  makeDot,
  makeNode,
  makePhoto,
  makePolyline,
  makeRoundedEnd,
  makeStack,
  makeTrapezoid
} from './research-figures-shapes.mjs'
import { FIGURE_PARTS, buildFigurePart } from './research-figures-parts.mjs'
import {
  placeLibraryPart,
  readLibraryFolder,
  userLibraryDirectory,
  writeLibraryPart
} from './research-figures-library.mjs'
import { figureLibraryFolders } from './research-figures-folders.mjs'
import { TEMPLATES, relabelTemplate } from './research-figures-templates.mjs'
import { oneOf } from './research-figures-options.mjs'
import { elementBounds } from './research-figures-geometry.mjs'
import { lintFigureScene, areaNeighbours } from './research-figures-lint.mjs'
import { hasInlineMath, labelLines, needsTex } from './research-figures-type.mjs'
import { makeBox, makeLines, makeMath, makeText } from './research-figures-draw.mjs'
import { absolutePoints, clearOfHeads, headLength } from './research-figures-labels.mjs'
import { alignJunction, junctionPoint } from './research-figures-route.mjs'
import {
  FIGURE_ACCENTS,
  FIGURE_STYLES,
  figureStyle,
  styleColor,
  stylePalette
} from './research-figures-style.mjs'
import { PRESET_ALIASES, accentFor } from './research-figures-palette.mjs'
import { layoutMethods } from './research-figures-kit-layout.mjs'
import { figureFileStore } from './research-figures-kit-files.mjs'
import { loadTexRenderer } from './research-figures-tex.mjs'
import { stopGradMethod } from './research-figures-kit-stopgrad.mjs'
import { glyphMethods } from './research-figures-kit-glyphs.mjs'
import { illustrateMethods } from './research-figures-kit-illustrate.mjs'
import { genreMethods } from './research-figures-kit-genres.mjs'
import { lossMethods } from './research-figures-kit-loss.mjs'
import { linkMethods } from './research-figures-kit-links.mjs'
import { measureMethods } from './research-figures-kit-measure.mjs'
import { allowMethods, clearAllowances } from './research-figures-kit-allow.mjs'
import { assertFiniteItems, trackKitCalls } from './research-figures-kit-validate.mjs'
import { arrowMethods } from './research-figures-kit-arrow.mjs'
import { legendMethods } from './research-figures-kit-legend.mjs'

export {
  TEXT_BASELINE,
  TEXT_LINE_HEIGHT,
  measureText as measure,
  missingGlyphs
} from './research-figures-text.mjs'
export {
  ARROWHEAD_LENGTH,
  makeArrow,
  makeBox,
  makeLines,
  makeMath,
  makeRuns,
  makeText,
  parseMath
} from './research-figures-draw.mjs'
export * from './research-figures-shapes.mjs'
export * from './research-figures-glyphs.mjs'
export * from './research-figures-marks.mjs'
export {
  FIGURE_ACCENTS,
  FIGURE_STYLES,
  LOSS_COLOR,
  figureStyle
} from './research-figures-style.mjs'

const REFERENCE_FILE_ID = 'aster-reference'
const BINDABLE = new Set(['rectangle', 'diamond', 'ellipse', 'image', 'frame', 'text'])

/** Opens a scene to edit with the kit; `save()` writes it back and returns the lint report. */
export async function openFigure(file) {
  // Why a URL too: `new URL('../method.excalidraw', import.meta.url)` finds the scene beside the
  // script, whatever directory the script runs from.
  const target = file instanceof URL ? fileURLToPath(file) : path.resolve(file)
  const scene = JSON.parse(await readFile(target, 'utf8'))
  const elements = scene.elements
  const claimed = new Set()
  const tex = await loadTexRenderer()
  const renderTex = tex?.renderTex ?? null
  /** The style; the kit adds TeX rendering to it once MathJax is loaded. */
  const styleFor = (name, accent, panels) => ({
    ...figureStyle(name, accent, { panels }),
    renderTex
  })
  const opened = figurePage(elements)
  let style = styleFor(opened?.style, opened?.accent, opened?.panels)
  const styled = (spec) => ({ ...spec, style })
  const find = (id) => elements.find((element) => element.id === id && !element.isDeleted)
  const ownerOf = (element) => element.customData?.asterKit ?? element.id
  /**
   * Everything drawn under an id; for an id that names a part drawn inside another item (a
   * frame's `y-t3` label, a glyph's `<id>-label`), the elements whose ids start with it.
   */
  const owned = (id) => {
    const direct = elements.filter(
      (element) => !element.isDeleted && (element.id === id || ownerOf(element) === id)
    )
    return direct.length
      ? direct
      : elements.filter((element) => !element.isDeleted && element.id.startsWith(`${id}-`))
  }
  const need = (id) => {
    const element = find(id)
    if (!element) {
      throw new Error(`No element ${id} in ${file}`)
    }
    return element
  }
  const bounds = (id, { own = false } = {}) => {
    const parts = (own ? [need(id)] : owned(id)).map(elementBounds)
    if (!parts.length) {
      need(id)
    }
    const x = Math.min(...parts.map((part) => part.x))
    const y = Math.min(...parts.map((part) => part.y))
    const right = Math.max(...parts.map((part) => part.right))
    const bottom = Math.max(...parts.map((part) => part.bottom))
    return { x, y, width: right - x, height: bottom - y, right, bottom }
  }
  /** An arrow end: an element, or what is drawn under an id (math) bound through its first text. */
  const lookup = (id) => {
    const element = find(id)
    if (element) {
      return element
    }
    const text = owned(id).find((item) => item.type === 'text' || item.type === 'image')
    return { ...bounds(id), id: text?.id ?? id, type: 'rectangle', unbindable: !text }
  }
  const keep = (test) => {
    const kept = elements.filter(test)
    elements.length = 0
    elements.push(...kept)
  }
  // Why: arrows keep pointing at an id that is replaced, none may point at one that is gone,
  // and each shape lists exactly the arrows bound to it.
  const settleBindings = () => {
    const present = new Map(elements.map((element) => [element.id, element]))
    const binds = (arrow, shape) =>
      arrow?.startBinding?.elementId === shape.id || arrow?.endBinding?.elementId === shape.id
    for (const element of elements) {
      if (element.boundElements) {
        element.boundElements = element.boundElements.filter((bound) =>
          bound.type === 'text' ? present.has(bound.id) : binds(present.get(bound.id), element)
        )
      }
    }
    for (const element of elements) {
      for (const side of ['startBinding', 'endBinding']) {
        const shape = present.get(element[side]?.elementId)
        if (element[side] && !shape) {
          element[side] = null
        } else if (element[side] && BINDABLE.has(shape.type)) {
          shape.boundElements ??= []
          if (!shape.boundElements.some((bound) => bound.id === element.id)) {
            shape.boundElements.push({ type: 'arrow', id: element.id })
          }
        }
      }
    }
  }
  // Why: the kit call running now, named when an item it drew holds NaN.
  let currentCall = () => null
  /** Takes `owner` for this run, dropping what an earlier run drew under it or with these ids. */
  const claim = (owner, items) => {
    for (const item of items) {
      if (!item.id || item.id.startsWith('undefined')) {
        throw new Error('Every kit element needs an id')
      }
    }
    assertFiniteItems(items, { owner, call: currentCall() })
    if (claimed.has(owner)) {
      throw new Error(`Id ${owner} is used twice in this script; give each item its own id`)
    }
    claimed.add(owner)
    const fresh = new Set([owner, ...items.map((item) => item.id)])
    const gone = new Set()
    for (const element of elements) {
      if (fresh.has(element.id) || element.customData?.asterKit === owner) {
        gone.add(element.id)
        for (const bound of element.boundElements ?? []) {
          if (bound.type === 'text') {
            gone.add(bound.id)
          }
        }
      }
    }
    keep((element) => !gone.has(element.id))
    for (const item of items) {
      item.customData = { ...item.customData, asterKit: owner }
    }
  }
  const pageIndex = () => elements.findIndex((element) => element.id === PAGE_FRAME_ID)
  /** Just under the lowest of these items (all of each one's elements), never under the page. */
  const under = (ids) => {
    const indices = ids.flatMap((id) => {
      const element = find(id)
      const owner = element ? ownerOf(element) : id
      return elements.flatMap((item, index) =>
        item.id === id || ownerOf(item) === owner ? [index] : []
      )
    })
    return indices.length ? Math.max(Math.min(...indices), pageIndex() + 1) : elements.length
  }
  const insert = (items, at = elements.length) => {
    elements.splice(at, 0, ...items)
    for (const item of items) {
      const svg = item.type === 'image' ? tex?.svgFor(item.fileId) : null
      if (svg) {
        files.svg(item.fileId, svg)
      }
    }
    settleBindings()
  }
  const add = (items, mainId = items[0]?.id) => {
    claim(mainId, items)
    insert(items)
    return items.find((item) => item.id === mainId) ?? items[0]
  }
  const placed = (owner, result) => {
    claim(owner, result.elements)
    insert(result.elements)
    return result
  }
  const project = await resolveProjectRoot(undefined, path.dirname(target))
  const files = figureFileStore(scene, project)
  let reference = null
  const loadReference = async () => {
    const relative = figurePage(elements)?.reference
    if (!relative) {
      throw new Error('This figure has no reference image; setPage({ reference }) first')
    }
    if (!reference || reference.relative !== relative) {
      const bytes = await readFile(path.join(project, relative))
      reference = { relative, bytes, size: imageSize(bytes) }
    }
    return reference
  }
  const remove = (...ids) => {
    const gone = new Set(ids.flatMap((id) => owned(id).map((element) => element.id)))
    for (const id of gone) {
      for (const bound of find(id)?.boundElements ?? []) {
        if (bound.type === 'text') {
          gone.add(bound.id)
        }
      }
    }
    keep((element) => !gone.has(element.id))
    settleBindings()
  }
  /**
   * `{ on: id, at | x | y }`: a point on another arrow or line, for a junction: `at` a fraction
   * along it ('mid'; 'auto' slides level with `other`), `x` / `y` on the run that crosses it.
   */
  const junction = (end, other) => {
    if (!end || typeof end !== 'object' || Array.isArray(end)) {
      return null
    }
    // Why exactly one: `at`, `x` and `y` each pick a point; two would contradict each other.
    const given = ['at', 'x', 'y'].filter((key) => end[key] !== undefined)
    if (given.length !== 1) {
      throw new Error(`A junction takes exactly one of at, x or y: ${JSON.stringify(end)}`)
    }
    const line = need(end.on)
    const clear = clearOfHeads(line)
    // Why the drawn path: `at` is a share of the line as it looks, and a y it shows is on it;
    // only a point on a head moves to the head's base.
    const cut = (atStart) => (headLength(line, atStart) ? headLength(line, atStart) + 4 : 0)
    const point = junctionPoint(absolutePoints(line), end, { start: cut(true), end: cut(false) })
    const shape = typeof other === 'string' ? lookup(other) : null
    // Why only 'auto' slides: a number or a coordinate is where the agent wants the dot.
    return { ...alignJunction(clear, point, shape, end.at === 'auto'), color: line.strokeColor }
  }
  const core = {
    elements,
    files,
    styled,
    need,
    owned,
    lookup,
    bounds,
    claim,
    insert,
    under,
    add,
    back: () => pageIndex() + 1,
    page: () => figurePage(elements),
    junction: (end, other) => junction(end, other),
    /** Just under the lowest element a box overlaps (frames aside): where a background goes. */
    underBox: (box) => {
      const right = box.x + box.width
      const bottom = box.y + box.height
      const index = elements.findIndex((element) => {
        if (element.type === 'frame' || element.isDeleted) {
          return false
        }
        const other = elementBounds(element)
        return other.x < right && other.right > box.x && other.y < bottom && other.bottom > box.y
      })
      return index === -1 ? elements.length : Math.max(index, pageIndex() + 1)
    },
    paint: (name) => styleColor(style, name).fill
  }
  const glyphs = glyphMethods(core)
  const measures = measureMethods(core)
  const projectLibraries = await figureLibraryFolders(project, path.dirname(target))
  const library = [
    ...(
      await Promise.all(projectLibraries.map((folder) => readLibraryFolder(folder, 'project')))
    ).flat(),
    ...(await readLibraryFolder(userLibraryDirectory(), 'user'))
  ]
  const fig = {
    scene,
    elements,
    get page() {
      return figurePage(elements)
    },
    get: need,
    /**
     * Bounds of everything drawn under an id (a loss with its rings and links, a glyph with its
     * label); `{ own: true }` measures only the element with that id.
     */
    bounds,
    /**
     * The figure's colour preset for what is drawn next and on later runs (`figures kit
     * colors`); `accent` is a swatch or #hex, `panels` the illustrative style's panel tints.
     */
    style(name, { accent, panels } = {}) {
      const key = PRESET_ALIASES[name] ?? name
      if (name !== undefined && !Object.hasOwn(FIGURE_STYLES, key)) {
        throw new Error(`Unknown style "${name}". Styles: ${Object.keys(FIGURE_STYLES).join(', ')}`)
      }
      if (accent !== undefined && !accentFor(accent)) {
        throw new Error(
          `Unknown accent "${accent}". Accents: ${Object.keys(FIGURE_ACCENTS).join(', ')}, or any #hex (figures kit colors)`
        )
      }
      const same = !key || key === style.name
      style = styleFor(
        key ?? style.name,
        accent ?? (same ? style.accentName : undefined),
        panels ?? (same ? style.panels.map((panel) => panel.name) : undefined)
      )
      const page = find(PAGE_FRAME_ID)
      if (page) {
        const current = page.customData?.asterPage ?? {}
        page.customData = {
          ...page.customData,
          asterPage: {
            ...current,
            style: style.name,
            agentStyle: style.name,
            accent: style.accentName,
            ...(style.panels.length ? { panels: style.panels.map((panel) => panel.name) } : {})
          }
        }
      }
      return style
    },
    /** The current style's colours as hex: neutrals, accents (fill, strong, ink, solid), loss. */
    palette: () => stylePalette(style),
    /** Clears everything but the page and its areas, for a script that redraws the figure. */
    reset() {
      keep(
        (element) =>
          element.type === 'frame' &&
          (element.id === PAGE_FRAME_ID || element.customData?.asterArea)
      )
      settleBindings()
      scene.files = {}
      claimed.clear()
      // Why: a redraw states its allowances again with fig.allow, so none outlive the script.
      clearAllowances(find(PAGE_FRAME_ID))
    },
    box: (spec) => add(makeBox(styled(spec)), spec.id),
    /**
     * Free text, or with `runs` text of several sizes (and `{ tex }`) on one line; `$…$` in the
     * text is TeX, and a character the font lacks (⋮) is typeset by TeX too. Returns the text
     * element (x, y, width, height), or with runs or math `{ elements, x, y, width, height }`.
     */
    text: (spec) => {
      const runs =
        spec.runs ??
        (hasInlineMath(spec.text) || needsTex(spec.text, style) ? [String(spec.text)] : null)
      if (!runs) {
        return add(makeText(styled(spec)), spec.id)
      }
      const result = placed(
        spec.id,
        makeLines(styled(spec), labelLines(runs, spec.size ?? style.textSize, undefined, style))
      )
      const box = bounds(spec.id)
      return { ...result, x: box.x, y: box.y, right: box.right, bottom: box.bottom }
    },
    /** Math in the paper font; returns `{ elements, width, height, x, baseline }`. */
    math: (spec) => placed(spec.id, makeMath(styled(spec))),
    polyline: (spec) => add([makePolyline(styled(spec))], spec.id),
    dot: (spec) => add(makeDot(styled(spec)), spec.id),
    ...arrowMethods(core),
    trapezoid: (spec) => add(makeTrapezoid(styled(spec)), spec.id),
    rounded: (spec) => add(makeRoundedEnd(styled(spec)), spec.id),
    stack: (spec) => add(makeStack(styled(spec)), spec.id),
    node: (spec) => add(makeNode(styled(spec)), spec.id),
    /** A library part (`figures parts` lists them) with the kit's `w`/`h`/`frame` names. */
    /** A library part: built in (`figures parts`) or saved (`figures kit library`), with fresh ids. */
    part(name, spec) {
      if (!spec?.id) {
        throw new Error('part(name, { id, x, y }) needs an id')
      }
      if (!FIGURE_PARTS.some((entry) => entry.id === name)) {
        const saved = library.find((entry) => entry.name === name)
        if (!saved) {
          throw new Error(
            `No part "${name}". Built in: ${FIGURE_PARTS.map((entry) => entry.id).join(', ')}; saved: ${library.map((entry) => entry.name).join(', ') || 'none'}`
          )
        }
        return add(placeLibraryPart(saved, { ...spec, frame: spec.frame ?? null }), spec.id)
      }
      const options = { ...spec, width: spec.w ?? spec.width, height: spec.h ?? spec.height }
      return add(
        buildFigurePart(name, styled({ ...options, frameId: spec.frame ?? spec.frameId })),
        spec.id
      )
    },
    /** Two slashes across an arrow with an "sg" label, clear of its label and heads. */
    stopGrad: stopGradMethod(core),
    /** An open chevron head on an existing arrow (`at: 'start'` for its tail). */
    chevron: (arrowId, spec = {}) => add([makeChevron(need(arrowId), styled(spec))]),
    /** Moves items (with everything drawn under their ids) to the back or the front. */
    order(position, ...ids) {
      const moving = ids.flatMap(owned)
      const movingIds = new Set(moving.map((element) => element.id))
      keep((element) => !movingIds.has(element.id))
      elements.splice(position === 'back' ? pageIndex() + 1 : elements.length, 0, ...moving)
    },
    ...glyphs,
    ...illustrateMethods(core),
    ...genreMethods(core, () => fig),
    ...lossMethods(core, () => fig),
    ...linkMethods(core, () => fig),
    ...allowMethods(core),
    ...legendMethods(core, () => fig),
    measure: measures.measure,
    ...layoutMethods(core),
    /**
     * A photo: with `crop` (reference pixels) cut from the reference, with `src` an image from
     * the project, otherwise a generated thumbnail (`kind`, default landscape).
     */
    async photo(spec) {
      if (!spec.crop) {
        return spec.placeholder
          ? add(makePhoto(styled(spec)), spec.id)
          : glyphs.image({ kind: 'landscape', ...spec })
      }
      const { relative, bytes, size } = await loadReference()
      files.reference(REFERENCE_FILE_ID, relative, bytes)
      const crop = { ...spec.crop, naturalWidth: size.width, naturalHeight: size.height }
      return add(makePhoto(styled({ ...spec, fileId: REFERENCE_FILE_ID, crop })), spec.id)
    },
    /** The reference image's path, pixel size, and scene units per reference pixel. */
    async reference() {
      const { relative, size } = await loadReference()
      const page = figurePage(elements)
      return { path: path.join(project, relative), ...size, unitsPerPixel: page.width / size.width }
    },
    /**
     * Resizes the page (inches). `matchReference` keeps the width and takes the reference
     * image's aspect ratio; `reference` (project-relative) marks the figure as a recreation.
     */
    async setPage({ widthIn, heightIn, reference: referencePath, matchReference } = {}) {
      const page = need(PAGE_FRAME_ID)
      const current = page.customData?.asterPage ?? {}
      const nextReference = referencePath ?? current.reference
      const width = widthIn ?? current.widthIn ?? page.width / FIGURE_UNITS_PER_INCH
      let height = heightIn ?? current.heightIn ?? page.height / FIGURE_UNITS_PER_INCH
      page.customData = {
        ...page.customData,
        asterPage: { ...current, widthIn: width, heightIn: height, reference: nextReference }
      }
      if (matchReference) {
        const { size } = await loadReference()
        height = Math.round(((width * size.height) / size.width) * 100) / 100
        page.customData.asterPage.heightIn = height
      }
      // Why: the lint tells the agent to resize only a page it sized itself.
      page.customData.asterPage.agentSize = { widthIn: width, heightIn: height }
      page.width = Math.round(width * FIGURE_UNITS_PER_INCH)
      page.height = Math.round(height * FIGURE_UNITS_PER_INCH)
      page.name = `Figure · ${figureSizeLabel(width, height)}`
      style = styleFor(
        style.name,
        style.accentName,
        style.panels.map((panel) => panel.name)
      )
      return figurePage(elements)
    },
    remove,
    area(id) {
      const frame = need(id)
      const children = () =>
        elements.filter((element) => element.frameId === id && !element.isDeleted)
      return {
        frame,
        children,
        neighbours: (margin) => areaNeighbours(elements, frame, margin),
        clear: () => remove(...children().map((element) => element.id))
      }
    },
    areas: () => figureAreas(elements),
    /** Writes the scene and returns the lint; `dryRun: true` writes nothing and adds `bounds`. */
    async save({ dryRun = false } = {}) {
      if (dryRun) {
        return { ...lintFigureScene(scene), bounds: measures.allBounds() }
      }
      // Why again on save: an element moved by hand (fig.get(id).x = …) skipped the draw check.
      for (const element of elements) {
        assertFiniteItems([element], { owner: ownerOf(element) })
      }
      files.prune(elements)
      await writeFile(target, `${JSON.stringify(scene, null, 2)}\n`)
      return lintFigureScene(scene)
    }
  }
  /** Saves items (with their labels) as a reusable part: in the project, or `scope: 'user'`. */
  fig.savePart = async (name, ids, { scope = 'project' } = {}) => {
    oneOf('scope', scope, ['project', 'user'])
    const chosen = new Set(ids.flatMap((id) => owned(id)).map((element) => element.id))
    for (const id of chosen) {
      for (const bound of find(id)?.boundElements ?? []) {
        if (bound.type === 'text') {
          chosen.add(bound.id)
        }
      }
    }
    const parts = structuredClone(elements.filter((element) => chosen.has(element.id)))
    const folder =
      scope === 'user' ? userLibraryDirectory() : path.join(path.dirname(target), 'library')
    const file = await writeLibraryPart(folder, name, parts)
    library.unshift({ name, scope, file, elements: parts })
    return file
  }
  /** A module template (`figures kit templates`): its parts' ids and where data enters and leaves. */
  fig.template = (name, spec) => {
    const entry = TEMPLATES[name]
    if (!entry) {
      throw new Error(`Unknown template "${name}". Templates: ${Object.keys(TEMPLATES).join(', ')}`)
    }
    if (!spec?.id) {
      throw new Error('template(name, { id, x, y }) needs an id')
    }
    // Why: a rerun with fewer parts must not leave the old ones behind.
    keep(
      (element) =>
        claimed.has(element.customData?.asterKit) ||
        !String(element.customData?.asterKit ?? '').startsWith(`${spec.id}-`)
    )
    settleBindings()
    return relabelTemplate(fig, { id: spec.id, ...entry[0](fig, spec) }, spec.labels)
  }
  currentCall = trackKitCalls(fig)
  return fig
}

export { PAGE_FRAME_ID }
