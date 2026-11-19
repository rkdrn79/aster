// Photos on planes. SVG cannot warp an image projectively, so a photo on a plane is drawn as
// affine pieces: one affine map for the whole plane when that is within a fraction of a unit of
// the true projection (any parallel view, a plane facing the camera), otherwise the picture is
// cut into an n × n grid of triangles, each mapped by its own affine transform and clipped to
// its (slightly grown) triangle, so the seams close and the result follows the perspective.

const r3 = (value) => Math.round(value * 1000) / 1000
const r2 = (value) => Math.round(value * 100) / 100

/** The affine map [a, b, c, d, e, f] taking three source points to three destination points. */
export function affineFrom(src, dst) {
  const [[u0, v0], [u1, v1], [u2, v2]] = src
  const det = u0 * (v1 - v2) - v0 * (u1 - u2) + (u1 * v2 - u2 * v1)
  if (Math.abs(det) < 1e-12) {
    return null
  }
  const solve = (w0, w1, w2) => [
    (w0 * (v1 - v2) - v0 * (w1 - w2) + (w1 * v2 - w2 * v1)) / det,
    (u0 * (w1 - w2) - w0 * (u1 - u2) + (u1 * w2 - u2 * w1)) / det,
    (u0 * (v1 * w2 - v2 * w1) - v0 * (u1 * w2 - u2 * w1) + w0 * (u1 * v2 - u2 * v1)) / det
  ]
  const [a, c, e] = solve(dst[0][0], dst[1][0], dst[2][0])
  const [b, d, f] = solve(dst[0][1], dst[1][1], dst[2][1])
  return [a, b, c, d, e, f]
}

const apply = ([a, b, c, d, e, f], [u, v]) => [a * u + c * v + e, b * u + d * v + f]

/**
 * How finely a photo must be cut so each piece's affine map stays within `tolerance` units of
 * the true projection: 1 (one affine map) up to 16. `at(s, t)` is the projected point at shares.
 */
export function photoSubdivision(at, tolerance = 0.3) {
  for (const n of [1, 2, 3, 4, 6, 8, 12, 16]) {
    let worst = 0
    for (let i = 0; i < n && worst <= tolerance; i += 1) {
      for (let j = 0; j < n && worst <= tolerance; j += 1) {
        const s0 = i / n
        const t0 = j / n
        const step = 1 / n
        const map = affineFrom(
          [
            [s0, t0],
            [s0 + step, t0],
            [s0, t0 + step]
          ],
          [at(s0, t0), at(s0 + step, t0), at(s0, t0 + step)]
        )
        if (!map) {
          continue
        }
        for (const [s, t] of [
          [s0 + step / 2, t0 + step / 2],
          [s0 + step, t0 + step]
        ]) {
          const [x, y] = apply(map, [s, t])
          const [tx, ty] = at(s, t)
          worst = Math.max(worst, Math.hypot(x - tx, y - ty))
        }
      }
    }
    if (worst <= tolerance) {
      return n
    }
  }
  return 16
}

/** A triangle grown by `pad` units from its centroid, so neighbouring pieces overlap. */
function grown(triangle, pad) {
  const cx = (triangle[0][0] + triangle[1][0] + triangle[2][0]) / 3
  const cy = (triangle[0][1] + triangle[1][1] + triangle[2][1]) / 3
  return triangle.map(([x, y]) => {
    const d = Math.hypot(x - cx, y - cy) || 1
    return [x + ((x - cx) / d) * pad, y + ((y - cy) / d) * pad]
  })
}

/**
 * The SVG of a photo on a plane: `photo` { key, href, width, height, crop: [x0, y0, x1, y1]
 * pixels, opacity }, `at(s, t)` the projected point (figure units) at shares of the plane from
 * its top-left corner. `ids` makes document-unique ids. Returns { defs, body, pieces }: the
 * image is defined once per key (`images` remembers which are defined).
 */
export function photoSvg(photo, at, { ids, images, tolerance = 0.3 }) {
  const image = imageDef(photo, ids, images)
  const imageId = image.imageId
  const defs = image.defs
  const [x0, y0, x1, y1] = photo.crop
  const n = photoSubdivision(at, tolerance)
  const source = (s, t) => [x0 + (x1 - x0) * s, y0 + (y1 - y0) * t]
  const pieces = []
  const pad = n === 1 ? 0 : 0.45
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const s0 = i / n
      const t0 = j / n
      const s1 = (i + 1) / n
      const t1 = (j + 1) / n
      const triangles =
        n === 1
          ? [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1]
              ]
            ]
          : [
              [
                [s0, t0],
                [s1, t0],
                [s0, t1]
              ],
              [
                [s1, t0],
                [s1, t1],
                [s0, t1]
              ]
            ]
      for (const shares of triangles) {
        const destination = shares.map(([s, t]) => at(s, t))
        const map = affineFrom(
          shares.slice(0, 3).map(([s, t]) => source(s, t)),
          destination.slice(0, 3)
        )
        if (!map) {
          continue
        }
        const clip = n === 1 ? destination : grown(destination, pad)
        pieces.push({ map, clip })
      }
    }
  }
  const drawn = piecesSvg(pieces, imageId, ids, photo.opacity)
  return { defs: defs + drawn.defs, body: drawn.body, pieces: pieces.length, subdivision: n }
}

/** Clipped, affine-mapped uses of one defined image; an opacity wraps them in one group. */
function piecesSvg(pieces, imageId, ids, opacity) {
  let defs = ''
  let body = ''
  for (const piece of pieces) {
    const clipId = ids('clip')
    const d = `M${piece.clip.map(([x, y]) => `${r2(x)} ${r2(y)}`).join('L')}Z`
    defs += `<clipPath id="${clipId}"><path d="${d}"/></clipPath>`
    body += `<g clip-path="url(#${clipId})"><use href="#${imageId}" transform="matrix(${piece.map.map(r3).join(' ')})"/></g>`
  }
  if (opacity !== undefined && opacity < 1) {
    body = `<g opacity="${r2(opacity)}">${body}</g>`
  }
  return { defs, body }
}

/** The image of a photo, defined once per document (`images` remembers which are). */
function imageDef(photo, ids, images) {
  let imageId = images.get(photo.key)
  if (imageId) {
    return { imageId, defs: '' }
  }
  imageId = ids('img')
  images.set(photo.key, imageId)
  return {
    imageId,
    defs: `<image id="${imageId}" href="${photo.href}" x="0" y="0" width="${photo.width}" height="${photo.height}" preserveAspectRatio="none"/>`
  }
}

/**
 * A photo on any flat face: `pts` its world points (a convex loop), `uvs` the photo shares at
 * each (0–1 across the crop, v down), `project` a world point to figure units. Each fan
 * triangle is cut finely enough that its affine pieces follow the perspective.
 */
export function texturedFaceSvg(photo, pts, uvs, project, { ids, images, tolerance = 0.3 }) {
  const image = imageDef(photo, ids, images)
  const [x0, y0, x1, y1] = photo.crop
  const pixel = ([u, v]) => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * v]
  const pieces = []
  for (let k = 1; k < pts.length - 1; k += 1) {
    const [p0, p1, p2] = [pts[0], pts[k], pts[k + 1]]
    const [w0, w1, w2] = [uvs[0], uvs[k], uvs[k + 1]]
    const world = (a, b) => p0.map((v, axis) => v + (p1[axis] - v) * a + (p2[axis] - v) * b)
    const uv = (a, b) =>
      [0, 1].map((axis) => w0[axis] + (w1[axis] - w0[axis]) * a + (w2[axis] - w0[axis]) * b)
    const at = (a, b) => project(world(a, b))
    if (
      [
        [0, 0],
        [1, 0],
        [0, 1]
      ].some(([a, b]) => !at(a, b))
    ) {
      continue
    }
    const n = photoSubdivision(at, tolerance)
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; i + j < n; j += 1) {
        const cells = [
          [
            [i, j],
            [i + 1, j],
            [i, j + 1]
          ]
        ]
        if (i + j < n - 1) {
          cells.push([
            [i + 1, j],
            [i + 1, j + 1],
            [i, j + 1]
          ])
        }
        for (const cell of cells) {
          const shares = cell.map(([a, b]) => [a / n, b / n])
          const destination = shares.map(([a, b]) => at(a, b))
          const map = affineFrom(
            shares.map(([a, b]) => pixel(uv(a, b))),
            destination
          )
          if (map) {
            pieces.push({ map, clip: grown(destination, 0.35) })
          }
        }
      }
    }
  }
  const drawn = piecesSvg(pieces, image.imageId, ids, photo.opacity)
  return { defs: image.defs + drawn.defs, body: drawn.body, pieces: pieces.length }
}

/** Photo shares for a flat face's points: its own right and down, fitted to 0–1. */
export function planarUvs(pts, normal) {
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
  let right = cross([0, 0, 1], normal)
  if (Math.hypot(...right) < 1e-6) {
    right = [1, 0, 0]
  }
  const norm = Math.hypot(...right)
  right = right.map((v) => v / norm)
  const down = cross(right, normal)
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const us = pts.map((p) => dot(p, right))
  const vs = pts.map((p) => dot(p, down))
  const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)]
  return pts.map((_, k) => [(us[k] - u0) / (u1 - u0 || 1), (vs[k] - v0) / (v1 - v0 || 1)])
}
