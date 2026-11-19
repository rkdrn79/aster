// Generated art in a hybrid figure (`figures art` makes it): `fig.art` places one keyed, textless
// illustration whole, at its shape, and returns a handle whose anchor points (shares [u, v] of
// the art from its top-left, read off the grid image; tl, tr, br, bl found from its pixels)
// become page points for arrows, labels and exact vector grids over it. `fig.quadGrid` draws
// such a grid inside any four page points.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { photoPixelsNeeded } from './research-figures-kit-files.mjs'
import { decodePng, encodePngRgba } from './research-figures-png.mjs'

/** The opacity mask a label check reads: MASK × MASK cells, '1' where the art is drawn. */
export const ART_MASK = 24

const shapes = new Map()

/**
 * What the kit reads from the art's pixels (alpha 128 and up is drawn): `mask`, MASK × MASK cells
 * with '1' where a quarter of the cell is drawn (the label check), and `corners`, the drawn
 * region's four extreme points as shares [u, v] (tl, tr, br, bl: the corners of a photo plane in
 * any oblique view), or null for a file it cannot read.
 */
export function artShape(file) {
  if (!shapes.has(file)) {
    let shape = null
    try {
      const image = decodePng(readFileSync(file))
      if (image) {
        const counts = Array.from({ length: ART_MASK * ART_MASK }, () => 0)
        const step = Math.max(1, Math.floor(Math.min(image.width, image.height) / (ART_MASK * 6)))
        const best = { tl: [Infinity], tr: [-Infinity], br: [-Infinity], bl: [Infinity] }
        const keep = (key, score, u, v, larger) => {
          if (larger ? score > best[key][0] : score < best[key][0]) {
            best[key] = [score, u, v]
          }
        }
        for (let y = 0; y < image.height; y += step) {
          for (let x = 0; x < image.width; x += step) {
            if (image.at(x, y)[3] < 128) {
              continue
            }
            const u = x / (image.width - 1 || 1)
            const v = y / (image.height - 1 || 1)
            counts[
              Math.min(ART_MASK - 1, Math.floor(v * ART_MASK)) * ART_MASK +
                Math.min(ART_MASK - 1, Math.floor(u * ART_MASK))
            ] += 1
            keep('tl', u + v, u, v, false)
            keep('tr', u - v, u, v, true)
            keep('br', u + v, u, v, true)
            keep('bl', u - v, u, v, false)
          }
        }
        const per = (Math.ceil(image.width / step) * Math.ceil(image.height / step)) / ART_MASK ** 2
        const round = (value) => Math.round(value * 1000) / 1000
        shape = {
          width: image.width,
          height: image.height,
          mask: counts.map((count) => (count >= per / 4 ? '1' : '0')).join(''),
          corners: Number.isFinite(best.tl[0])
            ? Object.fromEntries(
                Object.entries(best).map(([key, [, u, v]]) => [key, [round(u), round(v)]])
              )
            : null
        }
      }
    } catch {
      shape = null
    }
    shapes.set(file, shape)
  }
  return shapes.get(file)
}

/**
 * The art at about 300 dpi for a slot `width` units wide: a box-filtered copy in the art's
 * .print folder when the generated image is over 1.5 times that (a 1536 px image in a half-inch
 * slot would make the figure's files megabytes larger), else the file itself.
 */
function printCopy(file, folder, width) {
  const image = decodePng(readFileSync(file))
  const needed = photoPixelsNeeded(width, 1)
  if (!image || image.width <= needed * 1.5) {
    return file
  }
  const factor = image.width / needed
  const w = needed
  const h = Math.max(1, Math.round(image.height / factor))
  const copy = path.join(folder, '.print', `${path.basename(file, '.png')}-${String(w)}.png`)
  if (!existsSync(copy)) {
    const rgba = image.rgba()
    const out = new Uint8Array(w * h * 4)
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const [x0, x1] = [
          Math.floor(x * factor),
          Math.max(Math.floor(x * factor) + 1, Math.floor((x + 1) * factor))
        ]
        const [y0, y1] = [
          Math.floor(y * factor),
          Math.max(Math.floor(y * factor) + 1, Math.floor((y + 1) * factor))
        ]
        const sum = [0, 0, 0, 0]
        let weight = 0
        for (let sy = y0; sy < Math.min(y1, image.height); sy += 1) {
          for (let sx = x0; sx < Math.min(x1, image.width); sx += 1) {
            const at = (sy * image.width + sx) * 4
            const alpha = rgba[at + 3]
            // Why premultiplied: clear pixels must not darken the edge with their hidden colour.
            for (let c = 0; c < 3; c += 1) {
              sum[c] += rgba[at + c] * alpha
            }
            sum[3] += alpha
            weight += 1
          }
        }
        const at = (y * w + x) * 4
        for (let c = 0; c < 3; c += 1) {
          out[at + c] = sum[3] ? Math.round(sum[c] / sum[3]) : 255
        }
        out[at + 3] = Math.round(sum[3] / weight)
      }
    }
    mkdirSync(path.dirname(copy), { recursive: true })
    writeFileSync(path.join(path.dirname(copy), '.gitignore'), '*\n')
    writeFileSync(copy, encodePngRgba(w, h, out))
  }
  return copy
}

const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]

function share(id, anchors, anchor) {
  const value = typeof anchor === 'string' ? anchors[anchor] : anchor
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((v) => typeof v === 'number' && Number.isFinite(v))
  ) {
    throw new Error(
      `art ${id}: no anchor ${JSON.stringify(anchor)} (named: ${Object.keys(anchors).join(', ') || 'none'}; or give [u, v], shares of the art from its top-left)`
    )
  }
  return value
}

export function artMethods(core, context) {
  const quadGrid = (spec) => {
    const {
      id,
      corners,
      rows,
      cols,
      color = 'line',
      strokeWidth = 1,
      outline = true,
      dashed,
      veil = 0
    } = spec
    if (!id || !Array.isArray(corners) || corners.length !== 4 || !(rows >= 1 && cols >= 1)) {
      throw new Error('quadGrid({ id, corners: [tl, tr, br, bl], rows, cols }) needs all four')
    }
    const { fig } = context()
    const [tl, tr, br, bl] = corners
    const point = (u, v) => lerp(lerp(tl, tr, u), lerp(bl, br, u), v)
    if (veil > 0) {
      // Why: thin lines over a busy photo do not read at print; a pale veil under them does.
      fig.polyline({
        id: `${id}-veil`,
        points: corners,
        closed: true,
        color: 'white',
        opacity: veil
      })
    }
    const paint = String(color).startsWith('#') ? { stroke: color } : { color }
    const line = (key, points) =>
      fig.polyline({
        id: `${id}-${key}`,
        points,
        fill: 'none',
        ...paint,
        strokeWidth,
        ...(dashed ? { dashed: true } : {})
      })
    const first = outline ? 0 : 1
    for (let c = first; c <= cols - first; c += 1) {
      line(`c${c}`, [point(c / cols, 0), point(c / cols, 1)])
    }
    for (let r = first; r <= rows - first; r += 1) {
      line(`r${r}`, [point(0, r / rows), point(1, r / rows)])
    }
    return { id, point, cell: (r, c) => point((c + 0.5) / cols, (r + 0.5) / rows) }
  }

  return {
    /**
     * Places generated art (`part`: <figures>/art/<slug>/<part>.png, or `src` from the project)
     * whole at its shape and returns { id, box, at, quad, label, grid }.
     */
    art(spec) {
      const { project, target, fig } = context()
      const { id, part, src, x, y, cx, cy, w, h, anchors = {}, opacity, ...rest } = spec ?? {}
      if (!id || (!part && !src)) {
        throw new Error(
          "art({ id, part: 'camera' | src, x, y | cx, cy, w | h, anchors }) needs an id and a part"
        )
      }
      if (!w && !h) {
        throw new Error(`art ${id}: give w or h (the art keeps its shape; both: it fits inside)`)
      }
      const slug = path.basename(target).replace(/\.excalidraw$/, '')
      const folder = path.join(path.dirname(target), 'art', slug)
      const file = part
        ? path.join(folder, `${part}.png`)
        : path.isAbsolute(src)
          ? src
          : path.join(project, src)
      const shape = artShape(file)
      if (!shape) {
        throw new Error(
          `art ${id}: no PNG Aster can read at ${file} (figures art --figure ${slug} makes one)`
        )
      }
      // Why exact: w and h fit to the art's shape, so x, y (or the centre) is where it lands.
      const scale = Math.min(w ? w / shape.width : Infinity, h ? h / shape.height : Infinity)
      const size = { w: shape.width * scale, h: shape.height * scale }
      const left = cx === undefined ? (x ?? 0) : cx - size.w / 2
      const top = cy === undefined ? (y ?? 0) : cy - size.h / 2
      fig.image({
        id,
        src: printCopy(file, folder, size.w),
        x: left,
        y: top,
        ...size,
        fit: 'contain',
        ...rest
      })
      const element = core.need(id)
      if (typeof opacity === 'number') {
        element.opacity = Math.min(100, Math.max(0, opacity))
      }
      // Why: the drawn region's corners (a photo plane's) are anchors already; named ones win.
      const named = { ...shape?.corners, ...anchors }
      element.customData = {
        ...element.customData,
        asterArt: {
          part: part ?? path.basename(file, '.png'),
          anchors: named,
          mask: shape?.mask ?? null,
          maskSize: ART_MASK
        }
      }
      const b = fig.bounds(id, { own: true })
      const box = {
        x: b.x,
        y: b.y,
        w: b.width,
        h: b.height,
        right: b.x + b.width,
        bottom: b.y + b.height
      }
      const at = (anchor) => {
        const [u, v] = share(id, named, anchor)
        return [box.x + u * box.w, box.y + v * box.h]
      }
      const label = (anchor, labelSpec) => {
        const {
          id: labelId,
          text,
          side = 'right',
          gap = 6,
          size,
          color,
          leader = false
        } = labelSpec
        const [px, py] = at(anchor)
        const m = fig.measure('text', { text, ...(size ? { size } : {}) })
        const place = {
          left: { x: px - gap - m.width, cy: py, end: [px - gap + 1, py] },
          above: { cx: px, y: py - gap - m.height, end: [px, py - gap + 1] },
          below: { cx: px, y: py + gap, end: [px, py + gap - 1] },
          right: { x: px + gap, cy: py, end: [px + gap - 1, py] }
        }[side]
        if (!place) {
          throw new Error(`art ${id}: label side is left, right, above or below, not ${side}`)
        }
        const { end, ...where } = place
        const placed = fig.text({
          id: labelId,
          text,
          ...where,
          ...(size ? { size } : {}),
          ...(color ? { color } : {})
        })
        if (leader && gap >= 12) {
          fig.polyline({
            id: `${labelId}-leader`,
            points: [[px, py], end],
            fill: 'none',
            color: 'line',
            strokeWidth: 0.75
          })
        }
        return placed
      }
      const grid = (gridSpec) =>
        quadGrid({
          ...gridSpec,
          corners: (gridSpec.corners ?? ['tl', 'tr', 'br', 'bl']).map((corner) => at(corner))
        })
      return { id, box, anchors: named, at, quad: (...names) => names.map(at), label, grid }
    },
    /** Grid lines inside four page points (an oblique plane): exact counts as vector. */
    quadGrid
  }
}
