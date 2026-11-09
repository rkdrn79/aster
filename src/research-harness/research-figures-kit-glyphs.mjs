// The kit's data glyphs, badges and loss node, on top of the kit's add/claim/insert core.
import { makeFrames, makePatches, makePicture, makeTokens } from './research-figures-glyphs.mjs'
import { castPaint } from './research-figures-glyphs-picture.mjs'
import { warnKit } from './research-figures-cards.mjs'
import { badgeSvg, makeAttention, makeFeatures } from './research-figures-marks.mjs'
import { ICON_VARIANTS, iconFile } from './research-figures-icons.mjs'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { inkColor, styleColor } from './research-figures-style.mjs'
import { oneOf } from './research-figures-options.mjs'
import { figureElement } from './research-figures-model.mjs'
import { elementBounds } from './research-figures-geometry.mjs'
import { makeDistribution, makeMatrix } from './research-figures-glyphs-data.mjs'
import { makeDot, makeGrid, makePolyline } from './research-figures-shapes.mjs'
import { photoKind } from './research-figures-photos.mjs'
import { photoPixelsNeeded } from './research-figures-kit-files.mjs'
import {
  cropRegion,
  maskPoints,
  maskPolygons,
  patchCellView,
  patchPicture,
  promptBox,
  promptPoints
} from './research-figures-glyphs-crop.mjs'
import { labelLines, makeLines, texLabel } from './research-figures-type.mjs'

/**
 * The route a loss link takes by geometry: straight when the two share a row or a column,
 * otherwise out sideways and turning in (hv), or out vertically when they are stacked (vh).
 */
const union = (boxes) => {
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.right))
  const bottom = Math.max(...boxes.map((box) => box.bottom))
  return { x, y, width: right - x, height: bottom - y, right, bottom }
}

/** The smallest drawn cell or photo of a glyph: what prints too small to read. */
const MIN_CELL = 12
function smallestCell(elements) {
  const sizes = elements.flatMap((element) => {
    const grid = element.customData?.asterGrid
    if (grid?.rows && grid?.cols) {
      return [element.width / grid.cols, element.height / grid.rows]
    }
    const cell = element.type === 'rectangle' && /-r\d+c\d+$/.test(element.id)
    const photo = element.type === 'image' && element.customData?.asterPhoto
    return cell || photo ? [Math.min(element.width, element.height)] : []
  })
  return Math.min(Infinity, ...sizes)
}

/** Whether a style knows a colour name (`amber-strong` does, `ink-strong` does not). */
function knownStrong(style, name) {
  try {
    return Boolean(styleColor(style, name))
  } catch {
    return false
  }
}

export function glyphMethods(core) {
  const { files, styled } = core
  /**
   * Vendored photos: embed each once and crop the part shown to the element's shape (one rule,
   * research-figures-glyphs-crop.mjs); a patches() cell takes its cell of that grid's crop.
   */
  const placePhotos = (elements) => {
    for (const element of elements) {
      const kind = element.customData?.asterPhotoKind
      if (!kind) {
        continue
      }
      const { asterPatch, ...customData } = element.customData
      const shape = element.width / element.height
      const settle = (size) => {
        const view = asterPatch ? patchCellView(asterPatch, size) : customData.asterView
        return { view, crop: cropRegion(view, size, shape) }
      }
      // Why two passes: the shown share of the photo decides whether the small copy prints at
      // 300 dpi or the HD one is embedded; the crop is then in that file's own pixels.
      const small = files.photo(kind).size
      const first = settle(small)
      const need = photoPixelsNeeded(element.width, first.crop.width / small.width)
      const { fileId, size } = files.photo(kind, need)
      const { view, crop } = size.width === small.width ? first : settle(size)
      element.fileId = fileId
      element.crop = { ...crop, naturalWidth: size.width, naturalHeight: size.height }
      element.customData = { ...customData, asterView: view }
    }
  }
  /**
   * Prompts on a placed image (SAM): `points` as dots with a white rim (foreground in the
   * prompt colour, `negative` points in red), a `box` [x, y, w, h] as an outline; all in shares
   * of the photo (or its pixels), through its crop. Ids: <id>-point<n>, <id>-box.
   */
  const promptElements = (spec, image, size) => {
    const style = styled({}).style
    const { points = [], negative = [], box, color = 'ink' } = spec.prompt
    const dot = (id, [cx, cy], tone) =>
      makeDot(styled({ id, cx, cy, r: 4, color: tone, stroke: '#ffffff', frame: spec.frame }))
    const elements = [
      ...promptPoints(points, image, size).flatMap((point, index) =>
        dot(`${spec.id}-point${index}`, point, color)
      ),
      ...promptPoints(negative, image, size).flatMap((point, index) =>
        dot(`${spec.id}-negative${index}`, point, 'red')
      )
    ]
    const shown = box ? promptBox(box, image, size) : null
    if (shown) {
      elements.push(
        figureElement('rectangle', {
          id: `${spec.id}-box`,
          ...shown,
          strokeColor: inkColor(style, color),
          backgroundColor: 'transparent',
          strokeWidth: 2,
          frameId: spec.frame ?? null
        })
      )
    }
    return elements
  }
  /**
   * Masks over a placed image (segmentation): each polygon, mapped through the image's crop, as a
   * tinted fill under its outline. Ids: <id>-mask<n> (fill) and <id>-mask<n>-edge.
   */
  const maskElements = (spec, image, size) => {
    const style = styled({}).style
    return maskPolygons(spec.mask, image.customData?.asterPhotoKind).flatMap(
      ({ polygon, color }, index) => {
        const points = maskPoints(polygon, image, size)
        if (!points) {
          return []
        }
        const tone = color ?? spec.maskColor ?? 'accent'
        // Why the heavier fill: a pale tint at half strength washes the photo out instead of
        // marking the region.
        const heavy = tone.startsWith('#') ? null : `${tone}-strong`
        const fill = heavy && knownStrong(style, heavy) ? heavy : tone
        const id = `${spec.id}-mask${index}`
        const shape = (suffix, paint) =>
          makePolyline(
            styled({ id: `${id}${suffix}`, points, closed: true, frame: spec.frame, ...paint })
          )
        return [
          {
            ...shape('', { fill: styleColor(style, fill).fill, stroke: 'transparent' }),
            opacity: spec.maskOpacity ?? 55
          },
          shape('-edge', { stroke: inkColor(style, tone), fill: 'transparent', strokeWidth: 1.5 })
        ]
      }
    )
  }
  /**
   * What every data glyph may add: a `label` (TeX; `labelText` plain) on `labelSide` (below,
   * above, left, right) and, for pictures, `predicted: true` or `tint` laid over as a wash.
   */
  const decorate = (spec, result, side = 'below') => {
    const box = union(result.elements.map(elementBounds))
    const extra = []
    const wash = spec.predicted ? (spec.tint ?? 'accent') : null
    if (wash) {
      // Why a cast, not a pale tint: the prediction must read as coloured, the photo intact.
      const cast = castPaint(styled({}).style, wash)
      extra.push(
        figureElement('rectangle', {
          id: `${spec.id}-wash`,
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          strokeColor: 'transparent',
          backgroundColor: cast.color,
          opacity: cast.opacity
        })
      )
    }
    // Why strings and runs only: a matrix's label may be a function or table of its cells.
    const runs = Array.isArray(spec.label) && !Array.isArray(spec.label[0])
    if (typeof spec.label === 'string' || spec.labelText !== undefined || runs) {
      const style = styled({}).style
      const size = spec.labelSize ?? style.smallSize
      // Why TeX by default: x_t names a tensor; words and $…$ in it still print as words.
      const label =
        spec.labelText !== undefined
          ? [String(spec.labelText).replaceAll('$', '\\$')]
          : texLabel(spec.label)
      const lines = labelLines(label, size, undefined, style)
      const where = spec.labelSide ?? side
      const draw = (at) =>
        makeLines(styled({ id: `${spec.id}-label`, size, color: spec.labelColor, ...at }), lines)
      const probe = draw({ x: 0, y: 0 })
      const at =
        where === 'above'
          ? { cx: box.x + box.width / 2, y: box.y - 4 - probe.height }
          : where === 'left'
            ? { x: box.x - 6, align: 'right', cy: box.y + box.height / 2 }
            : where === 'right'
              ? { x: box.right + 6, cy: box.y + box.height / 2 }
              : { cx: box.x + box.width / 2, y: box.bottom + 4 }
      extra.push(...draw(at).elements)
    }
    result.elements.push(...extra)
    return result
  }
  const placeGlyph = (owner, result) => {
    // Why a warning, not a clamp: the agent chose the size, but a cell under 12 units (24 px
    // at print) reads as a speck.
    const warn = core.warn ?? warnKit
    warn(result.warnings ?? [])
    const small = smallestCell(result.elements)
    if (small < MIN_CELL) {
      warn([
        `${owner} draws cells or photos ${Math.round(small * 10) / 10} units across, under ${MIN_CELL} (1/12 in, 24 px at print); give it a larger cell, w or h`
      ])
    }
    core.claim(owner, result.elements)
    files.pictures(result.pictures)
    placePhotos(result.elements)
    core.insert(result.elements)
    return result
  }
  /** An icon image: Noto (colour) or Lucide (line, in `color`), embedded once as vector SVG. */
  const iconImage = (name, spec) => {
    const style = styled({}).style
    // Why line by default: judges read emoji as the clearest sign a figure was generated.
    const variant = oneOf('variant', spec.variant, ICON_VARIANTS) ?? 'line'
    const raw = readFileSync(new URL(iconFile(name, variant), import.meta.url), 'utf8')
    const filled = spec.fill
      ? raw.replace('fill="none"', `fill="${styleColor(style, spec.fill).fill}"`)
      : raw
    // Why its own drawing: a badge must read at 8 pt, which Lucide's outlined flame does not.
    const svg = spec.badge
      ? badgeSvg(name, inkColor(style, spec.color ?? spec.badge))
      : variant === 'line'
        ? filled.replaceAll('currentColor', inkColor(style, spec.color ?? 'ink'))
        : raw
    const fileId = `aster-icon-${createHash('sha256').update(svg).digest('hex').slice(0, 16)}`
    files.svg(fileId, svg)
    const size = spec.size ?? 18
    return figureElement('image', {
      id: spec.id,
      x: spec.cx !== undefined ? spec.cx - size / 2 : (spec.x ?? 0),
      y: spec.cy !== undefined ? spec.cy - size / 2 : (spec.y ?? 0),
      width: size,
      height: size,
      fileId,
      status: 'saved',
      scale: [1, 1],
      crop: null,
      strokeColor: 'transparent',
      boundElements: [],
      frameId: spec.frame ?? null,
      groupIds: spec.groupIds ?? [],
      customData: { asterIcon: name }
    })
  }
  /**
   * Where a badge goes: a corner of the item's box, or the polygon's vertex furthest that way
   * (a trapezoid's); `corner` is top-right (the default), top-left, bottom-right or bottom-left.
   */
  const CORNERS = {
    'top-right': [1, -1],
    'top-left': [-1, -1],
    'bottom-right': [1, 1],
    'bottom-left': [-1, 1]
  }
  const cornerOf = (targetId, name) => {
    const [sx, sy] = CORNERS[name]
    const polygon = core
      .owned(targetId)
      .find((element) => element.type === 'line' && (element.points?.length ?? 0) > 3)
    if (polygon) {
      const points = polygon.points.map(([px, py]) => [polygon.x + px, polygon.y + py])
      return points.reduce((best, point) =>
        sx * point[0] + sy * point[1] > sx * best[0] + sy * best[1] ? point : best
      )
    }
    const bounds = core.bounds(targetId)
    return [sx > 0 ? bounds.right : bounds.x, sy > 0 ? bounds.bottom : bounds.y]
  }
  const badge =
    (name, suffix, color) =>
    (targetId, spec = {}) => {
      const id = `${targetId}-${suffix}`
      // Why a choice of corner: a narrow-top trapezoid's top-right vertex is its waist, and
      // `at` places the badge anywhere when no corner suits.
      const place = oneOf('corner', spec.corner, Object.keys(CORNERS)) ?? 'top-right'
      const [sx, sy] = CORNERS[place]
      const [px, py] = spec.at ?? cornerOf(targetId, place)
      const [dx, dy] = spec.at ? [0, 0] : [-2 * sx, -2 * sy]
      // Why on the corner, the same for every module: the eye finds 🔥 and ❄️ in one place.
      // Why solid signs in the role colours: an outlined flame reads as a swirl at 8 pt; the
      // flame takes the accent (trained) and the snowflake the line gray (frozen).
      const look = spec.variant === 'emoji' ? {} : { badge: color }
      return core.add([iconImage(name, { ...look, ...spec, id, cx: px + dx, cy: py + dy })], id)
    }
  return {
    /**
     * A thumbnail: a `kind` picture (cat, landscape, arm, noise, gradient; `t` moves its
     * subject, `noise` 0–1 adds diffusion noise, `seed`, `view` crops) or `src`, an image from
     * the project. Prefer the project's own images when it has them.
     */
    async image(input) {
      // Why: a patch cut from a patches() grid shows the same crop as that cell.
      const patched =
        input.patch && input.of ? { ...input, ...patchPicture(input.of, input.patch) } : input
      // Why: tint names the colour of a photo's noise, or lays a wash over a plain photo.
      const washed = Boolean(patched.tint && !patched.noise && photoKind(patched.kind))
      const spec = washed ? { ...patched, predicted: true } : patched
      let size = null
      let result = null
      if (spec.src) {
        const source = await files.source(spec.src)
        size = source.size
        const w = spec.w ?? (spec.h ? (spec.h * size.width) / size.height : 64)
        const h = spec.h ?? (w * size.height) / size.width
        result = makePicture(styled({ ...spec, w, h, kind: 'cat' }))
        Object.assign(result.elements[0], {
          fileId: source.fileId,
          customData: { asterPhoto: true }
        })
      } else {
        result = makePicture(styled(spec))
      }
      const image = result.elements[0]
      if (spec.mask !== undefined || spec.prompt !== undefined) {
        const kind = image.customData?.asterPhotoKind
        if (!kind && !spec.src) {
          throw new Error(
            `image ${spec.id}: a mask or prompt needs a photo kind or src, not ${spec.kind}`
          )
        }
        placePhotos([image])
        // Why the placed crop's size: the image may have taken the HD copy of the photo.
        const natural = image.crop && {
          width: image.crop.naturalWidth,
          height: image.crop.naturalHeight
        }
        if (spec.mask !== undefined) {
          result.elements.push(...maskElements(spec, image, size ?? natural))
        }
        if (spec.prompt !== undefined) {
          result.elements.push(...promptElements(spec, image, size ?? natural))
        }
      }
      return placeGlyph(spec.id, decorate(spec, result)).elements[0]
    },
    /** A token strip; returns `{ cells: [{ id, x, y, w, h }], width, height }`. */
    tokens: (spec) => {
      // Why: a strip under another strip lines its tokens up with that strip's tokens.
      const columns = spec.columnsOf
        ? core
            .owned(spec.columnsOf)
            .filter((element) => new RegExp(`^${spec.columnsOf}-\\d+$`).test(element.id))
            .toSorted((a, b) => Number(a.id.split('-').at(-1)) - Number(b.id.split('-').at(-1)))
        : null
      const result = makeTokens(
        styled({
          ...spec,
          centers: columns?.map((element) => element.x + element.width / 2),
          widths: columns?.map((element) => element.width)
        })
      )
      return placeGlyph(
        spec.id,
        (spec.labelSide ?? 'left') === 'left' ? result : decorate(spec, result)
      )
    },
    /** A probability distribution as bars (`values`, `highlight`, `sharp`). */
    distribution: (spec) => placeGlyph(spec.id, decorate(spec, makeDistribution(styled(spec)))),
    /** A matrix with a TeX entry per cell (`label: (i, j) => tex`), fills and a diagonal. */
    matrix: (spec) => placeGlyph(spec.id, decorate(spec, makeMatrix(styled(spec)))),
    /** A grid of cells (see the reference), with a label beside it. */
    grid: (spec) =>
      placeGlyph(spec.id, decorate(spec, { elements: makeGrid(styled(spec)), pictures: [] }))
        .elements[0],

    /** Frames of a picture along a time axis (stacked, or `layout: 'row'`). */
    frames: (spec) => placeGlyph(spec.id, decorate(spec, makeFrames(styled(spec)))),
    /** A patch grid over a picture (or plain cells), `masked` patches greyed out. */
    // Why its own wash: makePatches lays it under the masked cells, which it does not predict.
    patches: (spec) =>
      placeGlyph(spec.id, decorate({ ...spec, predicted: false }, makePatches(styled(spec)))),
    /** An N × D grid of shades of one colour (features, latents). */
    features: (spec) => placeGlyph(spec.id, decorate(spec, makeFeatures(styled(spec)))),
    /** An attention mask with labelled groups of positions. */
    attention: (spec) => placeGlyph(spec.id, decorate(spec, makeAttention(styled(spec)))),
    /** A snowflake on the corner of a module whose weights stay fixed (variant: 'emoji' for ❄️). */
    frozen: badge('snowflake', 'frozen', 'line'),
    /** A solid flame on the corner of a module that is trained (variant: 'emoji' for 🔥). */
    trainable: badge('fire', 'trainable', 'accent-ink'),
    /** An icon (`figures kit icons` lists them) for an actor, a modality or a tool. */
    icon: (name, spec = {}) => {
      if (!spec.id) {
        throw new Error('icon(name, { id, x, y }) needs an id')
      }
      return core.add([iconImage(name, spec)], spec.id)
    }
  }
}
