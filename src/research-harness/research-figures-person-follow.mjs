// What hangs on a shape the person's edit moved or resized: the label bound inside it, and the
// arrows bound to it, which keep their ends on it (an elbow keeps its first and last runs straight).

const LINEAR = new Set(['arrow', 'line'])
const NEAR = 0.5

function mapPoint([x, y], from, to) {
  const scaleX = from.width ? to.width / from.width : 1
  const scaleY = from.height ? to.height / from.height : 1
  return [to.x + (x - from.x) * scaleX, to.y + (y - from.y) * scaleY]
}

function alignedShift(align, from, to, axis) {
  const start = axis === 'x' ? 'x' : 'y'
  const size = axis === 'x' ? 'width' : 'height'
  if (align === 'left' || align === 'top') {
    return to[start] - from[start]
  }
  if (align === 'right' || align === 'bottom') {
    return to[start] + to[size] - (from[start] + from[size])
  }
  return to[start] + to[size] / 2 - (from[start] + from[size] / 2)
}

function followLabel(text, { from, to }) {
  text.x += alignedShift(text.textAlign ?? 'center', from, to, 'x')
  text.y += alignedShift(text.verticalAlign ?? 'middle', from, to, 'y')
}

/** Moves one end of a path, keeping the run next to it horizontal or vertical as it was. */
function moveEnd(points, index, next) {
  const neighbour = index === 0 ? 1 : points.length - 2
  const [oldX, oldY] = points[index]
  if (points.length > 2) {
    const [nx, ny] = points[neighbour]
    if (Math.abs(ny - oldY) < NEAR) {
      points[neighbour] = [nx, next[1]]
    } else if (Math.abs(nx - oldX) < NEAR) {
      points[neighbour] = [next[0], ny]
    }
  }
  points[index] = next
}

/** A straight connector whose end moved off its line becomes one clean elbow, never a slant. */
function elbow(points, { flat, upright }) {
  if (points.length !== 2) {
    return
  }
  const [[x0, y0], [x1, y1]] = points
  if (flat && Math.abs(y0 - y1) >= NEAR) {
    const mid = (x0 + x1) / 2
    points.splice(1, 0, [mid, y0], [mid, y1])
  } else if (upright && Math.abs(x0 - x1) >= NEAR) {
    const mid = (y0 + y1) / 2
    points.splice(1, 0, [x0, mid], [x1, mid])
  }
}

function followArrow(arrow, start, end) {
  const points = arrow.points.map(([x, y]) => [arrow.x + x, arrow.y + y])
  if (points.length < 2) {
    return
  }
  const first = start ? mapPoint(points[0], start.from, start.to) : null
  const last = end ? mapPoint(points.at(-1), end.from, end.to) : null
  const shift = (point, moved) => [moved[0] - point[0], moved[1] - point[1]]
  const startShift = first ? shift(points[0], first) : null
  const endShift = last ? shift(points.at(-1), last) : null
  if (
    startShift &&
    endShift &&
    Math.abs(startShift[0] - endShift[0]) < NEAR &&
    Math.abs(startShift[1] - endShift[1]) < NEAR
  ) {
    for (const point of points) {
      point[0] += startShift[0]
      point[1] += startShift[1]
    }
  } else {
    const [a, b] = [points[0], points.at(-1)]
    const flat = points.length === 2 && Math.abs(a[1] - b[1]) < NEAR
    const upright = points.length === 2 && Math.abs(a[0] - b[0]) < NEAR
    if (first) {
      moveEnd(points, 0, first)
    }
    if (last) {
      moveEnd(points, points.length - 1, last)
    }
    elbow(points, { flat, upright })
  }
  const [x0, y0] = points[0]
  arrow.x = x0
  arrow.y = y0
  arrow.points = points.map(([x, y]) => [x - x0, y - y0])
  const xs = arrow.points.map((point) => point[0])
  const ys = arrow.points.map((point) => point[1])
  arrow.width = Math.max(...xs) - Math.min(...xs)
  arrow.height = Math.max(...ys) - Math.min(...ys)
}

/**
 * Carries bound labels and bound arrow ends along with the boxes in `moved` (id → its box
 * before and after, as `{ x, y, width, height }`). Arrows in `skip` already have the person's own
 * path. Returns the ids it changed.
 */
export function followMovedElements(elements, moved, { skip = new Set() } = {}) {
  const changed = []
  if (!moved.size) {
    return changed
  }
  for (const element of elements) {
    if (element.isDeleted || moved.has(element.id)) {
      continue
    }
    if (element.type === 'text' && element.containerId && moved.has(element.containerId)) {
      followLabel(element, moved.get(element.containerId))
      changed.push(element.id)
      continue
    }
    if (!LINEAR.has(element.type) || skip.has(element.id) || !Array.isArray(element.points)) {
      continue
    }
    const start = moved.get(element.startBinding?.elementId)
    const end = moved.get(element.endBinding?.elementId)
    if (start || end) {
      followArrow(element, start, end)
      changed.push(element.id)
    }
  }
  return changed
}
