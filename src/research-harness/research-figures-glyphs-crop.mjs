// One crop rule for every photo the kit draws (image(), token images, patches(), frames): a
// `view` (0–1 of the photo) trimmed around its centre to the element's shape. A patches() cell
// is a cell of what the patches picture shows, and a mask lands on the same pixels at any crop.
// Pure, and resolution-independent: everything is in fractions of the photo until the kit knows
// the file's natural size.

const FULL = { x: 0, y: 0, w: 1, h: 1 }

/** The part of the photo a picture shows before its crop: `view`, or `t` panning across it. */
export function photoView(spec) {
  const t = spec.t ?? 0
  return spec.view ?? (t ? { x: 0.3 * t, y: 0, w: 0.7, h: 1 } : FULL)
}

/**
 * The crop (photo pixels) a picture of `aspect` (width / height) shows of `view` on a photo of
 * `size`: the view trimmed around its centre to that shape, so nothing is stretched.
 */
export function cropRegion(view, size, aspect) {
  let [x, y] = [view.x * size.width, view.y * size.height]
  let [width, height] = [view.w * size.width, view.h * size.height]
  if (width / height > aspect) {
    x += (width - height * aspect) / 2
    width = height * aspect
  } else {
    y += (height - width / aspect) / 2
    height = width / aspect
  }
  return { x, y, width, height }
}

/** A crop as a view (0–1 of the photo). */
const asView = (region, size) => ({
  x: region.x / size.width,
  y: region.y / size.height,
  w: region.width / size.width,
  h: region.height / size.height
})

/**
 * What a picture records to show cell [row, col] of a patches() grid drawn with `of`: the
 * patches picture's view and shape, and the cell. The kit turns it into a view once it knows the
 * photo's size (`patchCellView`).
 */
export function patchOf(of, [row, col]) {
  return {
    view: photoView(of),
    aspect: (of.w ?? 64) / (of.h ?? 64),
    row,
    col,
    rows: of.rows ?? 4,
    cols: of.cols ?? 4
  }
}

/** The view (0–1 of the photo) of one patches() cell: a cell of the patches picture's crop. */
export function patchCellView(patch, size) {
  const shown = cropRegion(patch.view, size, patch.aspect)
  const width = shown.width / patch.cols
  const height = shown.height / patch.rows
  return asView(
    { x: shown.x + patch.col * width, y: shown.y + patch.row * height, width, height },
    size
  )
}

/**
 * The view of a generated picture's patches() cell. A generated picture is drawn from its view
 * at the element's shape, so a cell is a plain share of it.
 */
export function generatedCellView(patch) {
  const { view } = patch
  return {
    x: view.x + (patch.col / patch.cols) * view.w,
    y: view.y + (patch.row / patch.rows) * view.h,
    w: view.w / patch.cols,
    h: view.h / patch.rows
  }
}

/**
 * The picture options that show cell `patch` ([row, col]) of a patches() grid drawn with `of`:
 * its kind and seed, the cell's view for a generated picture, and `patchOf` for a photo, whose
 * crop the kit settles from the photo's size.
 */
export function patchPicture(of, patch) {
  const cell = patchOf(of, patch)
  return {
    kind: of.kind ?? 'landscape',
    seed: of.seed,
    view: generatedCellView(cell),
    patchOf: cell
  }
}

/** Points (0–1 of the photo) clipped to the crop's rectangle (Sutherland–Hodgman). */
function clipToCrop(points, crop, size) {
  const [left, top] = [crop.x / size.width, crop.y / size.height]
  const [right, bottom] = [left + crop.width / size.width, top + crop.height / size.height]
  const edges = [
    [(p) => p[0] >= left, (a, b) => cut(a, b, 0, left)],
    [(p) => p[0] <= right, (a, b) => cut(a, b, 0, right)],
    [(p) => p[1] >= top, (a, b) => cut(a, b, 1, top)],
    [(p) => p[1] <= bottom, (a, b) => cut(a, b, 1, bottom)]
  ]
  let out = points
  for (const [inside, cross] of edges) {
    const input = out
    out = []
    for (const [index, point] of input.entries()) {
      const previous = input.at(index - 1)
      if (inside(point)) {
        if (!inside(previous)) {
          out.push(cross(previous, point))
        }
        out.push(point)
      } else if (inside(previous)) {
        out.push(cross(previous, point))
      }
    }
  }
  return out
}

function cut(a, b, axis, at) {
  const t = (at - a[axis]) / (b[axis] - a[axis])
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/** Points as shares of the photo: 0–1 as given, or its pixels when any coordinate is above 1. */
function asShares(points, size) {
  const pixels = points.some(([px, py]) => px > 1 || py > 1)
  return pixels ? points.map(([px, py]) => [px / size.width, py / size.height]) : points
}

/** Where a share of the photo lands on an image element, through its crop. */
function onElement([px, py], element, crop, size) {
  const round = (value) => Math.round(value * 100) / 100
  return [
    round(element.x + ((px * size.width - crop.x) / crop.width) * element.width),
    round(element.y + ((py * size.height - crop.y) / crop.height) * element.height)
  ]
}

const cropOf = (element, size) =>
  element.crop ?? { x: 0, y: 0, width: size.width, height: size.height }

/**
 * A mask polygon (0–1 of the photo, or its pixels when any coordinate is above 1) drawn on an
 * image element: scene points, clipped to what the element shows; null when none of it shows.
 */
export function maskPoints(polygon, element, size) {
  const crop = cropOf(element, size)
  const shown = clipToCrop(asShares(polygon, size), crop, size)
  if (shown.length < 3) {
    return null
  }
  return shown.map((point) => onElement(point, element, crop, size))
}

/**
 * Prompt points (0–1 of the photo, or its pixels) on an image element, through its crop; those
 * outside what it shows are left out.
 */
export function promptPoints(points, element, size) {
  const crop = cropOf(element, size)
  const inside = (value, from, span) => value >= from - 1e-6 && value <= from + span + 1e-6
  return asShares(points, size)
    .filter(
      ([px, py]) =>
        inside(px * size.width, crop.x, crop.width) && inside(py * size.height, crop.y, crop.height)
    )
    .map((point) => onElement(point, element, crop, size))
}

// Why fractions: the photos may be swapped for larger copies of the same files; a share of the
// photo stays on the same pixels at any resolution. Traced on the 320-px copies.
const traced = (width, height, points) => points.map(([x, y]) => [x / width, y / height])

/** Built-in masks per stock photo: what a segmentation figure outlines on it. */
export const PHOTO_MASKS = {
  cat: {
    head: traced(320, 213, [
      [112, 75],
      [121, 8],
      [165, 40],
      [195, 38],
      [228, 46],
      [279, 24],
      [263, 100],
      [258, 150],
      [232, 182],
      [180, 200],
      [130, 182],
      [108, 135]
    ])
  },
  bird: {
    bird: traced(320, 212, [
      [98, 72],
      [118, 62],
      [135, 68],
      [162, 85],
      [135, 88],
      [140, 110],
      [130, 145],
      [118, 160],
      [95, 178],
      [82, 170],
      [75, 145],
      [78, 110],
      [90, 88]
    ]),
    branch: traced(320, 212, [
      [92, 186],
      [104, 160],
      [130, 148],
      [175, 146],
      [235, 155],
      [320, 176],
      [320, 196],
      [262, 178],
      [200, 166],
      [140, 162],
      [112, 172],
      [100, 188]
    ])
  },
  dog: {
    dog: traced(320, 213, [
      [98, 148],
      [118, 134],
      [150, 129],
      [156, 121],
      [167, 121],
      [171, 130],
      [162, 140],
      [160, 168],
      [154, 168],
      [150, 152],
      [128, 152],
      [122, 176],
      [115, 176],
      [116, 153],
      [102, 152]
    ])
  },
  flower: {
    butterfly: traced(320, 240, [
      [55, 42],
      [75, 40],
      [110, 60],
      [135, 90],
      [148, 105],
      [140, 120],
      [120, 135],
      [95, 155],
      [75, 165],
      [58, 150],
      [50, 110],
      [50, 70]
    ]),
    blossom: traced(320, 240, [
      [100, 150],
      [120, 120],
      [170, 115],
      [215, 125],
      [242, 150],
      [225, 190],
      [205, 205],
      [170, 200],
      [140, 195],
      [105, 180]
    ])
  },
  food: {
    cake1: traced(320, 240, [
      [68, 40],
      [150, 35],
      [160, 50],
      [158, 88],
      [75, 95],
      [66, 75]
    ]),
    cake2: traced(320, 240, [
      [160, 38],
      [238, 32],
      [245, 45],
      [244, 108],
      [168, 115],
      [160, 100]
    ]),
    cake3: traced(320, 240, [
      [95, 110],
      [170, 138],
      [152, 212],
      [66, 188]
    ]),
    cake4: traced(320, 240, [
      [190, 116],
      [246, 117],
      [240, 203],
      [186, 190]
    ])
  },
  car: {
    lamp: traced(
      320,
      233,
      Array.from({ length: 16 }, (_, index) => {
        const angle = (index / 16) * 2 * Math.PI
        return [158 + 36 * Math.cos(angle), 84 + 34 * Math.sin(angle)]
      })
    )
  }
}

/**
 * The masks a `mask` option names, each `{ polygon, color }`: a built-in name, a polygon
 * [[x, y], …], `{ points | name, color }`, or a list of these.
 */
export function maskPolygons(mask, kind) {
  const named = PHOTO_MASKS[kind] ?? {}
  const isPolygon = (value) =>
    Array.isArray(value) && value.every((point) => Array.isArray(point) && point.length === 2)
  const items = typeof mask === 'string' || isPolygon(mask) || !Array.isArray(mask) ? [mask] : mask
  return items.map((item) => {
    const entry = item && typeof item === 'object' && !Array.isArray(item) ? item : { points: item }
    const source = entry.name ?? entry.points
    const polygon = typeof source === 'string' ? named[source] : source
    if (typeof source === 'string' && !polygon) {
      const known = Object.keys(named)
      throw new Error(
        `No mask "${source}" on the ${kind ?? 'source'} photo. ${known.length ? `Built in: ${known.join(', ')}` : 'It has no built-in masks'}; or give a polygon [[x, y], …] (0–1 of the photo, or its pixels)`
      )
    }
    if (!isPolygon(polygon) || polygon.length < 3) {
      throw new Error(
        'A mask is a built-in name or a polygon [[x, y], …] of three points or more (0–1 of the photo, or its pixels)'
      )
    }
    return { polygon, color: entry.color }
  })
}

/**
 * A prompt box [x, y, w, h] (0–1 of the photo, or its pixels) on an image element, cut to what
 * it shows: { x, y, width, height } in the scene, or null when none of it shows.
 */
export function promptBox([bx, by, bw, bh], element, size) {
  const crop = cropOf(element, size)
  const [[x0, y0], [x1, y1]] = asShares(
    [
      [bx, by],
      [bx + bw, by + bh]
    ],
    size
  )
  const clampX = (value) =>
    Math.min(Math.max(value, crop.x / size.width), (crop.x + crop.width) / size.width)
  const clampY = (value) =>
    Math.min(Math.max(value, crop.y / size.height), (crop.y + crop.height) / size.height)
  const [left, top] = onElement([clampX(x0), clampY(y0)], element, crop, size)
  const [right, bottom] = onElement([clampX(x1), clampY(y1)], element, crop, size)
  return right - left > 1 && bottom - top > 1
    ? { x: left, y: top, width: right - left, height: bottom - top }
    : null
}
