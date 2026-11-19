// The parts of the drawn glyphs (research-figures-kit-drawn): one cuboid with its faces, grid,
// picture and size labels; one stack of planes; the frames of a filmstrip; and the names placed
// over or under a glyph. Pure: they return elements and the pictures still to place.
import { PAPER_STROKE } from './research-figures-paper.mjs'
import {
  FACE_SHADE,
  boxOf,
  cuboidFaces,
  depthOffset,
  gridLines,
  pixelate,
  pixelateKind,
  ramp,
  roleTones,
  shade
} from './research-figures-drawn.mjs'

const GRID_WIDTH = 1
export const num = (value, fallback) => (Number.isFinite(value) ? value : fallback)

/** `photo` as given ('data/x.png', { src | kind, view, noise }) → an image spec, or null. */
export function photoSpec(photo) {
  if (!photo) {
    return null
  }
  return typeof photo === 'string' ? { src: photo } : { ...photo }
}

/** Moves the elements under `ids` (an image a kit call drew) to just before element `beforeId`. */
export function moveBefore(core, ids, beforeId) {
  const wanted = new Set(ids)
  const moving = core.elements.filter(
    (element) => wanted.has(element.id) || wanted.has(element.customData?.asterKit)
  )
  if (!moving.length) {
    return
  }
  const rest = core.elements.filter((element) => !moving.includes(element))
  const at = rest.findIndex((element) => element.id === beforeId)
  core.elements.length = 0
  core.elements.push(
    ...(at === -1 ? [...rest, ...moving] : [...rest.slice(0, at), ...moving, ...rest.slice(at)])
  )
}

/** Moves elements by dx, dy (a label measured first and placed after). */
export function shiftAll(elements, dx, dy) {
  for (const element of elements) {
    element.x += dx
    element.y += dy
  }
  return elements
}

/**
 * One cuboid of the family: its faces, grid, cells, picture and labels as elements, plus the
 * image it still needs placed (`photo`) and where (`under`: the first grid line drawn over it).
 */
export function cuboidParts(parts, spec, style, project) {
  const w = num(spec.w, 48)
  const h = num(spec.h, 48)
  const d = num(spec.d, 32)
  const [dx, dy] = depthOffset(d, spec.view)
  const fx = spec.cx !== undefined ? spec.cx - (w + dx) / 2 : num(spec.x, 0)
  const fy = spec.base !== undefined ? spec.base - h : num(spec.y, 0) - dy
  const faces = cuboidFaces(fx, fy, w, h, d, spec.view)
  const tones = roleTones(style, spec.role ?? 'block')
  const front =
    spec.fill ??
    (spec.tone === 'strong' ? tones.strong : spec.tone === 'solid' ? tones.solid : tones.fill)
  const stroke = spec.stroke ?? style.line
  const width = spec.strokeWidth ?? PAPER_STROKE
  const id = spec.id
  const opacity = spec.opacity
  const elements = [
    parts.poly(`${id}-top`, faces.top, {
      fill: shade(front, FACE_SHADE.top),
      stroke,
      width,
      shade: FACE_SHADE.top,
      opacity
    }),
    parts.poly(`${id}-side`, faces.side, {
      fill: shade(front, FACE_SHADE.side),
      stroke,
      width,
      shade: FACE_SHADE.side,
      opacity
    }),
    parts.rect(`${id}-front`, fx, fy, w, h, { fill: front, stroke, width, opacity })
  ]
  const grid = spec.grid === false || spec.grid === 0 ? null : (spec.grid ?? 4)
  const [cols, rows, layers] = Array.isArray(grid)
    ? [grid[0], grid[1] ?? grid[0], grid[2] ?? Math.max(1, Math.round((grid[0] * d) / w))]
    : grid
      ? [grid, Math.max(1, Math.round((grid * h) / w)), Math.max(1, Math.round((grid * d) / w))]
      : [0, 0, 0]
  const image = photoSpec(spec.photo)
  let photo = null
  if (image) {
    const n = spec.pixelate === true ? Math.max(cols, 1) : num(spec.pixelate, 0)
    const colors = !n
      ? null
      : image.src
        ? pixelate(project, image.src, n, n)
        : pixelateKind(image.kind, n, n)
    if (colors) {
      colors.forEach((row, r) =>
        row.forEach((color, c) =>
          elements.push(
            parts.rect(`${id}-r${r}c${c}`, fx + (c * w) / n, fy + (r * h) / n, w / n, h / n, {
              fill: color,
              stroke: color,
              width: 0.5,
              meaning: 'picture'
            })
          )
        )
      )
    } else {
      photo = { ...image, id: `${id}-photo`, x: fx, y: fy, w, h, fit: 'cover' }
    }
  }
  for (const [index, cell] of (spec.cells ?? []).entries()) {
    const [r0, r1] = cell.rows ?? [cell.at?.[0] ?? 0, cell.at?.[0] ?? 0]
    const [c0, c1] = cell.cols ?? [cell.at?.[1] ?? 0, cell.at?.[1] ?? 0]
    const cw = w / Math.max(cols, 1)
    const ch = h / Math.max(rows, 1)
    const cellTones = roleTones(style, cell.role ?? 'accent')
    elements.push(
      parts.rect(
        `${id}-cell${index}`,
        fx + c0 * cw,
        fy + r0 * ch,
        (c1 - c0 + 1) * cw,
        (r1 - r0 + 1) * ch,
        {
          fill: cell.tone === 'fill' ? cellTones.fill : cellTones.strong,
          stroke,
          width: GRID_WIDTH,
          meaning: cell.meaning ?? 'highlight'
        }
      )
    )
  }
  const gridColor = spec.gridColor ?? (photo ? '#ffffff' : shade(front, -0.32))
  const backGrid = gridColor === '#ffffff' ? shade(front, -0.3) : gridColor
  const frontGrid = gridLines(parts, `${id}-grid-front`, faces.front, cols, rows, {
    stroke: gridColor,
    width: GRID_WIDTH
  })
  const firstGrid = frontGrid[0]?.id ?? `${id}-edge`
  if (cols > 1 || rows > 1) {
    elements.push(
      ...frontGrid,
      ...gridLines(
        parts,
        `${id}-grid-top`,
        [faces.top[0], faces.top[3], faces.top[2], faces.top[1]],
        cols,
        layers,
        { stroke: backGrid, width: GRID_WIDTH }
      ),
      ...gridLines(parts, `${id}-grid-side`, faces.side, layers, rows, {
        stroke: backGrid,
        width: GRID_WIDTH
      })
    )
    // Why the outline again on top: the grid ends on the edge, so the edge stays one weight.
    elements.push(parts.rect(`${id}-edge`, fx, fy, w, h, { stroke, width }))
  }
  const labels = spec.labels === true ? { w: '$W$', h: '$H$', d: '$C$' } : (spec.labels ?? {})
  const small = spec.size ?? style.smallSize
  if (labels.h) {
    elements.push(
      ...parts.words(
        `${id}-h`,
        labels.h,
        { x: fx - 4, cy: fy + h / 2, align: 'right' },
        { size: small }
      ).elements
    )
  }
  if (labels.w) {
    elements.push(
      ...parts.words(`${id}-w`, labels.w, { cx: fx + w / 2, y: fy + h + 2 }, { size: small })
        .elements
    )
  }
  if (labels.d) {
    elements.push(
      ...parts.words(
        `${id}-d`,
        labels.d,
        { x: fx + w + dx / 2 + 4, cy: fy + h + dy / 2 + 4 },
        { size: small }
      ).elements
    )
  }
  const geometry = {
    x: fx,
    y: fy + dy,
    width: w + dx,
    height: h - dy,
    right: fx + w + dx,
    bottom: fy + h,
    front: { x: fx, y: fy, w, h },
    faces,
    anchors: {
      center: [fx + w / 2, fy + h / 2],
      left: [fx, fy + h / 2],
      right: [fx + w + dx / 2, fy + h / 2 + dy / 2],
      top: [fx + (w + dx) / 2, fy + dy / 2],
      bottom: [fx + w / 2, fy + h]
    }
  }
  return { elements, photo, under: cols > 1 || rows > 1 ? firstGrid : `${id}-edge`, geometry }
}

/** The height a name over a glyph takes: x, y is the top-left of everything drawn. */
export function labelRoom(spec, style) {
  return spec.label && spec.labelSide === 'above' ? (spec.labelSize ?? style.textSize) * 1.4 + 4 : 0
}

/** A name under (or over) a glyph, at the body size. */
export function nameLabel(parts, spec, box, style) {
  if (!spec.label) {
    return []
  }
  const placed = parts.words(
    `${spec.id}-label`,
    spec.label,
    { cx: box.x + box.width / 2, y: 0 },
    { size: spec.labelSize ?? style.textSize }
  )
  const top = spec.labelSide === 'above' ? box.y - placed.height - 4 : box.bottom + 4
  return shiftAll(placed.elements, 0, top - placed.y)
}
/** The frames of a filmstrip: `frames` as given, or `count` views panning across one picture. */
export function filmFrames(spec) {
  if (Array.isArray(spec.frames)) {
    return spec.frames.map((frame) => (typeof frame === 'string' ? { src: frame } : { ...frame }))
  }
  const count = num(spec.count, num(spec.frames, 5))
  const base =
    photoSpec(spec.photo) ?? (spec.src ? { src: spec.src } : { kind: spec.kind ?? 'landscape' })
  const noisy = new Set(
    spec.noise === 'first' ? [0] : spec.noise === 'last' ? [count - 1] : (spec.noise ?? [])
  )
  return Array.from({ length: count }, (_, index) => {
    const t = count > 1 ? index / (count - 1) : 0
    const view = { x: 0.15 * t, y: 0.05, w: 0.85, h: 0.9 }
    return noisy.has(index) ? { kind: 'noise', seed: index + 1 } : { ...base, view }
  })
}

/** The levels of fig.planes: `levels` as given, a number of shrinking levels, or one stack. */
export function levelList(spec) {
  if (Array.isArray(spec.levels)) {
    return spec.levels
  }
  if (Number.isFinite(spec.levels)) {
    const shrink = num(spec.shrink, 0.72)
    return Array.from({ length: spec.levels }, (_, index) => ({
      w: num(spec.w, 56) * shrink ** index,
      h: num(spec.h, 72) * shrink ** index,
      grid: spec.grid
        ? Math.max(
            1,
            Math.round((Array.isArray(spec.grid) ? spec.grid[0] : spec.grid) * shrink ** index)
          )
        : spec.grid
    }))
  }
  return [{}]
}

const slopeOf = (view) => Math.tan(((view?.angle ?? 35) * Math.PI) / 180) * 0.6

/** The page size of one stack of planes. */
export function stackSize(level, spec) {
  const count = num(level.count, num(spec.count, 3))
  const w = num(level.w, num(spec.w, 56))
  const h = num(level.h, num(spec.h, 72))
  const gap = num(level.gap, num(spec.gap, 8))
  if ((level.facing ?? spec.facing) === 'side') {
    const drop = num(spec.drop, gap * 0.35)
    return { width: w + (count - 1) * gap, height: h + w * slopeOf(spec.view) + (count - 1) * drop }
  }
  const angle = ((spec.view?.angle ?? 35) * Math.PI) / 180
  return {
    width: w + (count - 1) * gap * Math.cos(angle),
    height: h + (count - 1) * gap * Math.sin(angle)
  }
}

/** One stack of planes at x, y (its top-left): elements, its picture, and its geometry. */
export function stackParts(parts, spec, style, project, x, y) {
  const count = num(spec.count, 3)
  const w = num(spec.w, 56)
  const h = num(spec.h, 72)
  const gap = num(spec.gap, 8)
  const tones = roleTones(style, spec.role ?? 'a')
  const fills =
    spec.fills ??
    (spec.ramp === false
      ? Array.from({ length: count }, () => tones.fill)
      : ramp(tones.strong, tones.fill, count))
  const stroke = spec.stroke ?? style.line
  const elements = []
  const photos = []
  const planes = []
  const side = spec.facing === 'side'
  const slope = slopeOf(spec.view)
  const drop = num(spec.drop, gap * 0.35)
  const angle = ((spec.view?.angle ?? 35) * Math.PI) / 180
  const [ox, oy] = [gap * Math.cos(angle), -gap * Math.sin(angle)]
  for (let index = 0; index < count; index += 1) {
    const id = `${spec.id}-p${index}`
    let corners
    if (side) {
      const px = x + index * gap
      const py = y + w * slope + index * drop
      corners = [
        [px, py],
        [px + w, py - w * slope],
        [px + w, py + h - w * slope],
        [px, py + h]
      ]
    } else {
      const back = count - 1 - index
      const px = x + back * ox
      const py = y + (count - 1) * -oy + back * oy
      corners = [
        [px, py],
        [px + w, py],
        [px + w, py + h],
        [px, py + h]
      ]
    }
    elements.push(
      parts.poly(id, corners, {
        fill: fills[index],
        stroke,
        opacity: spec.opacity,
        meaning: spec.meaning
      })
    )
    planes.push({
      id,
      corners,
      center: [(corners[0][0] + corners[2][0]) / 2, (corners[0][1] + corners[2][1]) / 2]
    })
  }
  const front = planes.at(-1)
  const grid = spec.grid
    ? Array.isArray(spec.grid)
      ? spec.grid
      : [spec.grid, Math.max(1, Math.round((spec.grid * h) / w))]
    : null
  const image = photoSpec(spec.photo)
  if (image && !side) {
    const [[px, py]] = front.corners
    photos.push({
      photo: { ...image, id: `${spec.id}-photo`, x: px, y: py, w, h, fit: 'cover' },
      under: grid ? `${spec.id}-grid-u` : `${spec.id}-grid`
    })
  }
  const gridIds = []
  if (grid) {
    const gridPlanes = spec.gridAll ? planes : [front]
    for (const plane of gridPlanes) {
      const gid = plane === front ? `${spec.id}-grid` : `${plane.id}-grid`
      const lines = gridLines(parts, gid, plane.corners, grid[0], grid[1], {
        stroke: image && !side ? '#ffffff' : shade(fills[planes.indexOf(plane)], -0.3),
        width: GRID_WIDTH
      })
      elements.push(...lines)
      gridIds.push(...lines.map((item) => item.id))
    }
  }
  if (photos.length && !gridIds.length) {
    elements.push(parts.poly(`${spec.id}-grid`, front.corners, { stroke }))
  }
  const box = boxOf(planes.flatMap((plane) => plane.corners))
  return {
    elements,
    photos,
    geometry: {
      ...box,
      planes,
      front: front.corners,
      anchors: {
        center: front.center,
        left: [box.x, front.center[1]],
        right: [box.right, front.center[1]],
        top: [(box.x + box.right) / 2, box.y],
        bottom: [(box.x + box.right) / 2, box.bottom]
      }
    }
  }
}
