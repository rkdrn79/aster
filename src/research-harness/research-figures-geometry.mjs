// Bounds, edge points and Excalidraw's binding focus for figure elements (unrotated).

const LINEAR = new Set(['arrow', 'line', 'freedraw'])

/** The box an element covers; arrows and lines from their points, so up/left arrows work. */
export function elementBounds(element) {
  if (LINEAR.has(element.type) && Array.isArray(element.points) && element.points.length) {
    const xs = element.points.map((point) => element.x + point[0])
    const ys = element.points.map((point) => element.y + point[1])
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return box(x, y, Math.max(...xs) - x, Math.max(...ys) - y)
  }
  const x = Math.min(element.x, element.x + element.width)
  const y = Math.min(element.y, element.y + element.height)
  return box(x, y, Math.abs(element.width), Math.abs(element.height))
}

function box(x, y, width, height) {
  return { x, y, width, height, right: x + width, bottom: y + height }
}

export function boundsOf(bounds) {
  return box(bounds.x, bounds.y, bounds.width, bounds.height)
}

export function isInside(inner, outer, tolerance = 0.5) {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  )
}

/** Overlap with area, not just a shared edge. */
export function overlaps(first, second, margin = 0.5) {
  return (
    first.x < second.x + second.width - margin &&
    first.x + first.width > second.x + margin &&
    first.y < second.y + second.height - margin &&
    first.y + first.height > second.y + margin
  )
}

export function distanceToBounds(point, bounds) {
  const dx = Math.max(bounds.x - point[0], 0, point[0] - (bounds.x + bounds.width))
  const dy = Math.max(bounds.y - point[1], 0, point[1] - (bounds.y + bounds.height))
  return Math.hypot(dx, dy)
}

export function centerOf(element) {
  return [element.x + element.width / 2, element.y + element.height / 2]
}

/** Where the ray from a shape's center toward `toward` leaves its outline, `gap` units outside. */
export function edgePoint(shape, toward, gap = 4) {
  const [cx, cy] = centerOf(shape)
  const dx = toward[0] - cx
  const dy = toward[1] - cy
  const length = Math.hypot(dx, dy) || 1
  const halfW = shape.width / 2
  const halfH = shape.height / 2
  let scale
  if (shape.type === 'ellipse') {
    scale = 1 / Math.sqrt((dx / halfW) ** 2 + (dy / halfH) ** 2)
  } else if (shape.type === 'diamond') {
    scale = 1 / (Math.abs(dx) / halfW + Math.abs(dy) / halfH)
  } else {
    scale = Math.min(
      dx === 0 ? Infinity : halfW / Math.abs(dx),
      dy === 0 ? Infinity : halfH / Math.abs(dy)
    )
  }
  return [cx + dx * scale + (dx / length) * gap, cy + dy * scale + (dy / length) * gap]
}

function cross(ax, ay, bx, by) {
  return ax * by - ay * bx
}

function segmentIntersection(p1, p2, p3, p4) {
  const d = cross(p2[0] - p1[0], p2[1] - p1[1], p4[0] - p3[0], p4[1] - p3[1])
  if (d === 0) {
    return null
  }
  const t = cross(p3[0] - p1[0], p3[1] - p1[1], p4[0] - p3[0], p4[1] - p3[1]) / d
  const u = cross(p3[0] - p1[0], p3[1] - p1[1], p2[0] - p1[0], p2[1] - p1[1]) / d
  if (t < 0 || t > 1 || u < 0 || u > 1) {
    return null
  }
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])]
}

/**
 * Excalidraw's `determineFocusDistance` for an unrotated shape: where the arrow's last segment
 * (adjacent point → edge point) crosses the shape, from -1 to 1; 0 aims at the center.
 */
export function focusDistance(shape, adjacent, edge) {
  if (adjacent[0] === edge[0] && adjacent[1] === edge[1]) {
    return 0
  }
  const { x, y, width, height } = shape
  const center = [x + width / 2, y + height / 2]
  const sign =
    Math.sign(
      cross(adjacent[0] - edge[0], adjacent[1] - edge[1], center[0] - edge[0], center[1] - edge[1])
    ) * -1
  const length = Math.hypot(adjacent[0] - edge[0], adjacent[1] - edge[1])
  const reach = Math.max(width * 2, height * 2)
  // Why toward the shape: Excalidraw extends the last segment past the edge, through the shape.
  const far = [
    edge[0] + ((edge[0] - adjacent[0]) / length) * reach,
    edge[1] + ((edge[1] - adjacent[1]) / length) * reach
  ]
  const diamond = shape.type === 'diamond'
  const axes = diamond
    ? [
        [
          [x + width / 2, y],
          [x + width / 2, y + height]
        ],
        [
          [x, y + height / 2],
          [x + width, y + height / 2]
        ]
      ]
    : [
        [
          [x, y],
          [x + width, y + height]
        ],
        [
          [x + width, y],
          [x, y + height]
        ]
      ]
  const interceptees = diamond
    ? [
        [
          [x + width / 2, y - height],
          [x + width / 2, y + height * 2]
        ],
        [
          [x - width, y + height / 2],
          [x + width * 2, y + height / 2]
        ]
      ]
    : [
        [
          [x - width, y - height],
          [x + width * 2, y + height * 2]
        ],
        [
          [x + width * 2, y - height],
          [x - width, y + height * 2]
        ]
      ]
  const ratios = interceptees
    .map((segment, index) => ({ point: segmentIntersection(edge, far, ...segment), index }))
    .filter((entry) => entry.point !== null)
    .sort(
      (first, second) =>
        Math.hypot(first.point[0] - edge[0], first.point[1] - edge[1]) -
        Math.hypot(second.point[0] - edge[0], second.point[1] - edge[1])
    )
    .map(({ point, index }) => {
      const scale = diamond
        ? Math.hypot(axes[index][0][0] - axes[index][1][0], axes[index][0][1] - axes[index][1][1]) /
          2
        : Math.hypot(width, height) / 2
      return (sign * Math.hypot(center[0] - point[0], center[1] - point[1])) / scale
    })
    .sort((first, second) => Math.abs(first) - Math.abs(second))
  return ratios[0] ?? 0
}

/** Whether segment a→b passes through the box (Liang–Barsky clipping). */
export function segmentCrossesBox(a, b, box) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  let low = 0
  let high = 1
  for (const [p, q] of [
    [-dx, a[0] - box.x],
    [dx, box.x + box.width - a[0]],
    [-dy, a[1] - box.y],
    [dy, box.y + box.height - a[1]]
  ]) {
    if (p === 0) {
      if (q < 0) {
        return false
      }
    } else {
      const t = q / p
      if (p < 0) {
        low = Math.max(low, t)
      } else {
        high = Math.min(high, t)
      }
      if (low > high) {
        return false
      }
    }
  }
  return true
}

/** Ray casting: whether a point lies inside a closed polygon. */
export function pointInPolygon(point, polygon) {
  let inside = false
  for (let index = 0, last = polygon.length - 1; index < polygon.length; last = index++) {
    const [xi, yi] = polygon[index]
    const [xj, yj] = polygon[last]
    if (
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
    ) {
      inside = !inside
    }
  }
  return inside
}

/**
 * A point on a path: `at` (0 to 1 of its length), or where it reaches `x` or `y` (the first
 * segment that spans it); null when the path never does.
 */
export function pointOnPath(points, { at, x, y } = {}) {
  if (x !== undefined || y !== undefined) {
    const axis = x !== undefined ? 0 : 1
    const value = x ?? y
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1]
      const b = points[index]
      const low = Math.min(a[axis], b[axis])
      const high = Math.max(a[axis], b[axis])
      if (value >= low - 0.01 && value <= high + 0.01) {
        const t = b[axis] === a[axis] ? 0.5 : (value - a[axis]) / (b[axis] - a[axis])
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      }
    }
    return null
  }
  const lengths = points
    .slice(1)
    .map((point, index) => Math.hypot(point[0] - points[index][0], point[1] - points[index][1]))
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * (at ?? 0.5)
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index] || index === lengths.length - 1) {
      const t = lengths[index] ? Math.min(1, remaining / lengths[index]) : 0
      const [a, b] = [points[index], points[index + 1]]
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    remaining -= lengths[index]
  }
  return points[0] ?? null
}
