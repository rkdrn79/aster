// Depth order for perspective scenes by a BSP tree: every flat face becomes a node, cut where
// another face's plane runs through it, so faces that intersect (crossed tri-planes, a sphere
// sunk into a box, Gaussians inside a translucent cone) paint in the right order with no cycles
// and no flicker. Lines are cut at the planes they cross; dots and billboards (Gaussians,
// spheres, glyphs) fall into the cell they sit in, farthest first. Pure geometry, no SVG.
import { dot, lerp3 } from './research-figures-perspective-camera.mjs'

const CANDIDATES = 6

/** The plane of a face: unit normal n and offset d (points x with n·x = d). */
export const planeOfFace = (face) => ({ n: face.normal, d: dot(face.normal, face.pts[0]) })

const sideOf = (plane, p, eps) => {
  const distance = dot(plane.n, p) - plane.d
  return distance > eps ? 1 : distance < -eps ? -1 : 0
}

/**
 * A face as a polygon to cut: vertices { p, uv, id, on } where `on` lists the face's own edges
 * a vertex lies on, so a piece knows which of its edges are the face's outline and which are
 * cuts (an outline is drawn only along the first).
 */
export function pieceOf(face, serial) {
  const count = face.pts.length
  return {
    face,
    serial,
    cuts: [],
    verts: face.pts.map((p, index) => ({
      p,
      uv: face.uvs?.[index] ?? null,
      id: face.vids?.[index] ?? `${serial}:${index}`,
      on: [(index + count - 1) % count, index]
    }))
  }
}

const shareEdge = (a, b) => a.on.some((edge) => b.on.includes(edge))

/** Whether a piece's edge from vertex `index` to the next lies on the face's own outline. */
export const outerEdge = (piece, index) =>
  shareEdge(piece.verts[index], piece.verts[(index + 1) % piece.verts.length])

function crossing(a, b, plane, key, intern) {
  const da = dot(plane.n, a.p) - plane.d
  const db = dot(plane.n, b.p) - plane.d
  const t = da / (da - db)
  const [lo, hi] = String(a.id) < String(b.id) ? [a.id, b.id] : [b.id, a.id]
  return {
    p: lerp3(a.p, b.p, t),
    uv:
      a.uv && b.uv ? [a.uv[0] + (b.uv[0] - a.uv[0]) * t, a.uv[1] + (b.uv[1] - a.uv[1]) * t] : null,
    // Why a shared id: neighbours cut by one plane meet at one vertex, so their union closes.
    id: intern(`${lo}~${hi}@${key}`),
    on: a.on.filter((edge) => b.on.includes(edge))
  }
}

/**
 * Cuts a piece by a plane: { side: 0 } when it lies in the plane, { side: 1 | -1 } when wholly
 * on one side, else { front, back } pieces (each remembering the cut for its decorations).
 */
export function splitPiece(piece, plane, eps, key, intern = (id) => id) {
  const sides = piece.verts.map((v) => sideOf(plane, v.p, eps))
  const hasFront = sides.some((s) => s > 0)
  const hasBack = sides.some((s) => s < 0)
  if (!hasFront && !hasBack) {
    return { side: 0 }
  }
  if (!hasBack || !hasFront) {
    return { side: hasFront ? 1 : -1 }
  }
  const front = []
  const back = []
  const count = piece.verts.length
  for (let index = 0; index < count; index += 1) {
    const a = piece.verts[index]
    const b = piece.verts[(index + 1) % count]
    const [sa, sb] = [sides[index], sides[(index + 1) % count]]
    if (sa >= 0) {
      front.push(a)
    }
    if (sa <= 0) {
      back.push(a)
    }
    if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) {
      const middle = crossing(a, b, plane, key, intern)
      front.push(middle)
      back.push(middle)
    }
  }
  const make = (verts, sign) =>
    verts.length >= 3 ? { ...piece, verts, cuts: [...piece.cuts, { plane, sign }] } : null
  return { front: make(front, 1), back: make(back, -1) }
}

/** Where a piece lies against a plane: 1 front, -1 back, 0 in it, 2 across it. */
function classify(piece, plane, eps) {
  let front = false
  let back = false
  const [nx, ny, nz] = plane.n
  for (const { p } of piece.verts) {
    const distance = nx * p[0] + ny * p[1] + nz * p[2] - plane.d
    if (distance > eps) {
      front = true
    } else if (distance < -eps) {
      back = true
    }
  }
  return front && back ? 2 : front ? 1 : back ? -1 : 0
}

const SAMPLE = 40

function chooseSplitter(pieces, eps) {
  if (pieces.length <= 2) {
    return 0
  }
  // Why a few candidates scored on a sample: the fewest cuts keeps the drawing small, and a
  // big scene still sorts in a blink; decorated faces (photos, grids) are tried first.
  const step = Math.max(1, Math.floor(pieces.length / CANDIDATES))
  const picks = new Set([0])
  for (let index = 0; index < pieces.length && picks.size < CANDIDATES; index += step) {
    picks.add(index)
  }
  for (let index = 0; index < pieces.length && picks.size < CANDIDATES * 2; index += 1) {
    if (pieces[index].face.photo || pieces[index].face.decals?.length) {
      picks.add(index)
    }
  }
  const stride = Math.max(1, Math.floor(pieces.length / SAMPLE))
  let best = 0
  let bestScore = Infinity
  for (const index of picks) {
    const plane = planeOfFace(pieces[index].face)
    let cuts = 0
    let balance = 0
    for (let other = 0; other < pieces.length; other += stride) {
      const side = classify(pieces[other], plane, eps)
      cuts += side === 2 ? 1 : 0
      balance += side === 1 ? 1 : side === -1 ? -1 : 0
    }
    const score = cuts * 8 + Math.abs(balance) - (pieces[index].face.photo ? 4 : 0)
    if (score < bestScore) {
      best = index
      bestScore = score
    }
  }
  return best
}

/**
 * Builds a BSP tree of face pieces. Each node keeps its plane, the pieces lying in it (in the
 * order they were drawn), front and back subtrees, and buckets for the items that end in an
 * empty side (lines, dots, billboards).
 */
export function buildBsp(pieces, eps) {
  const root = { slot: null }
  const jobs = [{ list: pieces, holder: root, field: 'slot' }]
  let serial = 0
  // Why interned: a vertex cut again and again would otherwise carry an ever longer name.
  const names = new Map()
  const intern = (name) => {
    if (!names.has(name)) {
      names.set(name, `x${names.size}`)
    }
    return names.get(name)
  }
  while (jobs.length) {
    const { list, holder, field } = jobs.pop()
    if (!list.length) {
      holder[field] = null
      continue
    }
    const pick = chooseSplitter(list, eps)
    const plane = planeOfFace(list[pick].face)
    const key = `k${(serial += 1)}`
    const node = {
      plane,
      key,
      here: [list[pick]],
      front: null,
      back: null,
      frontItems: [],
      backItems: []
    }
    const front = []
    const back = []
    list.forEach((piece, index) => {
      if (index === pick) {
        return
      }
      const side = classify(piece, plane, eps)
      if (side === 0) {
        node.here.push(piece)
      } else if (side === 1) {
        front.push(piece)
      } else if (side === -1) {
        back.push(piece)
      } else {
        const cut = splitPiece(piece, plane, eps, key, intern)
        if (cut.side) {
          ;(cut.side > 0 ? front : back).push(piece)
        }
        if (cut.front) {
          front.push(cut.front)
        }
        if (cut.back) {
          back.push(cut.back)
        }
      }
    })
    node.here.sort((a, b) => a.serial - b.serial)
    holder[field] = node
    jobs.push({ list: front, holder: node, field: 'front' })
    jobs.push({ list: back, holder: node, field: 'back' })
  }
  return root.slot
}

/** Which side of a node the viewer is on (+1 front, -1 back); `eyeSide(n, p0)` is the camera's. */
const viewerSide = (node, eyeSide) =>
  eyeSide(
    node.plane.n,
    node.plane.n.map((value) => value * node.plane.d)
  ) >= 0
    ? 1
    : -1

/**
 * Puts an item into the tree: a point item ({ at }) into the cell it sits in, a segment item
 * ({ a, b }) cut at every plane it crosses (`cutSegment(item, t)` makes the two parts at share
 * t). Items in a plane go to the viewer's side, so they paint over it.
 */
export function insertItem(root, item, eps, eyeSide, cutSegment) {
  if (!root) {
    return [item]
  }
  const jobs = [{ node: root, item }]
  while (jobs.length) {
    const { node, item: current } = jobs.pop()
    const facing = viewerSide(node, eyeSide)
    let side
    if (current.at) {
      side = sideOf(node.plane, current.at, eps) || facing
    } else {
      const sa = sideOf(node.plane, current.a, eps)
      const sb = sideOf(node.plane, current.b, eps)
      if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) {
        const da = dot(node.plane.n, current.a) - node.plane.d
        const db = dot(node.plane.n, current.b) - node.plane.d
        const [first, second] = cutSegment(current, da / (da - db))
        jobs.push({ node, item: first }, { node, item: second })
        continue
      }
      side = sa || sb || facing
    }
    const child = side > 0 ? node.front : node.back
    if (child) {
      jobs.push({ node: child, item: current })
    } else {
      ;(side > 0 ? node.frontItems : node.backItems).push(current)
    }
  }
  return null
}

const byDepth = (a, b) => b.depth - a.depth || a.serial - b.serial

/**
 * The tree's contents back to front for the viewer: far subtree, the node's own pieces, near
 * subtree; the items in an empty side farthest first.
 */
export function backToFront(root, eyeSide, loose = []) {
  if (!root) {
    return [...loose].sort(byDepth)
  }
  const out = []
  const stack = [{ node: root }]
  while (stack.length) {
    const job = stack.pop()
    if (job.emit) {
      out.push(...job.emit)
      continue
    }
    const { node } = job
    const facing = viewerSide(node, eyeSide)
    const [far, farItems, near, nearItems] =
      facing > 0
        ? [node.back, node.backItems, node.front, node.frontItems]
        : [node.front, node.frontItems, node.back, node.backItems]
    // Stack: last pushed runs first, so push the near side first.
    if (near) {
      stack.push({ node: near })
    } else if (nearItems.length) {
      stack.push({ emit: nearItems.toSorted(byDepth) })
    }
    stack.push({ emit: node.here })
    if (far) {
      stack.push({ node: far })
    } else if (farItems.length) {
      stack.push({ emit: farItems.toSorted(byDepth) })
    }
  }
  return out
}
