// Structure checks: the motifs the agent listed before drawing (fig.structure: loops, fan-outs,
// skips, feedback) are drawn as connections, a text that says the method loops gets a cycle; a
// figure of identical boxes and one-colour arrows is flagged; and crowding on a page someone
// else sized says the content does not fit it.
import { absolutePoints } from './research-figures-labels.mjs'
import { colorClass } from './research-figures-palette.mjs'
import { ROOMY, dropPhrase, smallPageChecks } from './research-figures-lint-small.mjs'

const ownerOf = (element) => element?.customData?.asterKit ?? element?.id
/** Words that say a method runs in a loop. */
const LOOP_WORDS =
  /\b(loop|loops|cycle|cyclic|iterat\w*|feedback|feeds? back|curriculum|repeat\w*|recurren\w*|round after round)\b|반복|루프|순환|피드백|되먹|사이클/i

function onPath(point, arrow) {
  const points = absolutePoints(arrow)
  return points.slice(1).some((next, index) => {
    const [a, b] = [points[index], next]
    const [lx, hx] = [Math.min(a[0], b[0]) - 1.5, Math.max(a[0], b[0]) + 1.5]
    const [ly, hy] = [Math.min(a[1], b[1]) - 1.5, Math.max(a[1], b[1]) + 1.5]
    return point[0] >= lx && point[0] <= hx && point[1] >= ly && point[1] <= hy
  })
}

/** The role an arrow was drawn in: grad, feedback, skip, cond …; plain flow is data. */
const roleOf = (arrow) =>
  arrow.customData?.asterLine ??
  arrow.customData?.asterRole ??
  (arrow.strokeStyle === 'dashed' ? 'aux' : 'data')
/** Roles that are ordinary flow: a chain of them through modules is the forward path, not a link. */
const PLAIN = new Set(['data', 'main', 'side'])

/**
 * The drawn connections between items, by owner id, with the roles they were drawn in: an
 * arrow from the item it starts on to the item it ends on; one that starts on another arrow (a
 * fork, a bus tap) starts where that one does; an arrow into a group reaches every item in it;
 * an unbound arrow that records what it joins (a U-Net's skip over the top) joins those.
 */
function linkGraph(elements) {
  const byId = new Map(elements.map((element) => [element.id, element]))
  const arrows = elements.filter((element) => element.type === 'arrow' || element.type === 'line')
  const ends = (element, side) => {
    const bound = byId.get(element[side]?.elementId)
    if (!bound) {
      const link = element.customData?.asterLink
      const named = link?.[side === 'startBinding' ? 'from' : 'to']
      return named ? [named] : []
    }
    // Why the group too: a loop may name the group (fig.group) or the items in it.
    const group = bound.customData?.asterContainer
    return Array.isArray(group) ? [ownerOf(bound), ...group] : [ownerOf(bound)]
  }
  const sources = new Map()
  const sourceOf = (arrow, seen = new Set()) => {
    if (sources.has(arrow.id)) {
      return sources.get(arrow.id)
    }
    seen.add(arrow.id)
    let found = ends(arrow, 'startBinding')
    if (!found.length) {
      const start = absolutePoints(arrow)[0]
      const parent = start
        ? arrows.find((other) => !seen.has(other.id) && other !== arrow && onPath(start, other))
        : null
      found = parent ? sourceOf(parent, seen) : []
    }
    sources.set(arrow.id, found)
    return found
  }
  const edges = new Map()
  const roles = new Map()
  for (const arrow of arrows) {
    const targets = ends(arrow, 'endBinding')
    for (const from of sourceOf(arrow)) {
      for (const to of targets) {
        if (from !== to) {
          edges.set(from, new Set([...(edges.get(from) ?? []), to]))
          const key = `${from}\u0000${to}`
          roles.set(key, new Set([...(roles.get(key) ?? []), roleOf(arrow)]))
        }
      }
    }
  }
  return { edges, roles }
}

/**
 * The drawn connections between items, by owner id: an arrow from the item it starts on to the
 * item it ends on; one that starts on another arrow (a fork, a bus tap) starts where that one
 * does, and an arrow into a group reaches every item in it.
 */
export function connectionGraph(elements) {
  return linkGraph(elements).edges
}

/**
 * Small items a link passes through on its way (a junction dot, a ⊕ or stop-grad node, a
 * concat circle, a switch): an owner whose drawing fits in 40 × 40 units.
 */
function connectors(elements) {
  const spans = new Map()
  for (const element of elements) {
    if (element.type === 'arrow' || element.type === 'line' || element.type === 'frame') {
      continue
    }
    const owner = ownerOf(element)
    const [x, y] = [element.x, element.y]
    const [right, bottom] = [x + (element.width ?? 0), y + (element.height ?? 0)]
    const seen = spans.get(owner)
    spans.set(
      owner,
      seen
        ? [
            Math.min(seen[0], x),
            Math.min(seen[1], y),
            Math.max(seen[2], right),
            Math.max(seen[3], bottom)
          ]
        : [x, y, right, bottom]
    )
  }
  return new Set(
    [...spans]
      .filter(([, [x, y, right, bottom]]) => right - x <= 40 && bottom - y <= 40)
      .map(([id]) => id)
  )
}

/**
 * Whether a listed link from → to is drawn: an arrow between them, or a chain of arrows that
 * passes only through small connectors (dots, ⊕, stop-grad nodes), or a chain drawn in one role
 * that is not plain flow (a grad path through the rendering back onto the weights).
 */
function linked(graph, small, from, to) {
  const { edges, roles } = graph
  const rolesOf = (a, b) => roles.get(`${a}\u0000${b}`) ?? new Set()
  const walk = (keep) => {
    const seen = new Set([from])
    const queue = [from]
    while (queue.length) {
      const next = queue.shift()
      for (const item of edges.get(next) ?? []) {
        if (!keep(next, item)) {
          continue
        }
        if (item === to) {
          return true
        }
        if (!seen.has(item)) {
          seen.add(item)
          queue.push(item)
        }
      }
    }
    return false
  }
  if (walk((a) => a === from || small.has(a))) {
    return true
  }
  const chainRoles = new Set(
    [...(edges.get(from) ?? [])].flatMap((item) => [...rolesOf(from, item)])
  )
  return [...chainRoles]
    .filter((role) => !PLAIN.has(role))
    .some((role) => walk((a, b) => rolesOf(a, b).has(role)))
}

function reaches(edges, from, to) {
  const seen = new Set([from])
  const queue = [from]
  while (queue.length) {
    const next = queue.shift()
    for (const item of edges.get(next) ?? []) {
      if (item === to) {
        return true
      }
      if (!seen.has(item)) {
        seen.add(item)
        queue.push(item)
      }
    }
  }
  return false
}

const hasCycle = (edges) => [...edges.keys()].some((item) => reaches(edges, item, item))

/** Whether items sit in one row (centres level) rather than on a ring. */
function inRow(ids, elements) {
  const centres = ids
    .map((id) => elements.find((element) => element.id === id))
    .filter(Boolean)
    .map((element) => element.y + element.height / 2)
  return centres.length >= 3 && Math.max(...centres) - Math.min(...centres) < 8
}

/** Known ids that look like a missing one, for the hint: same start, or holding it. */
function lookalikes(id, known) {
  const name = String(id).toLowerCase()
  const head = name.slice(0, 2)
  return [...known]
    .filter((other) => typeof other === 'string' && !other.startsWith('__'))
    .filter((other) => {
      const low = other.toLowerCase()
      return low.includes(name) || name.includes(low) || (head.length === 2 && low.startsWith(head))
    })
    .slice(0, 6)
}

/** The motifs fig.structure recorded on the page, each checked against the drawn connections. */
export function structureChecks(elements, pageFrame, add) {
  const motifs = pageFrame?.customData?.asterStructure
  if (!motifs) {
    return
  }
  const graph = linkGraph(elements)
  const { edges } = graph
  const small = connectors(elements)
  const known = new Set(elements.map(ownerOf))
  const byId = new Map(elements.map((element) => [element.id, element]))
  // Why members: a motif may name a list, a group (fig.group) or a grid whose cells carry the wires.
  const members = (id) => {
    if (Array.isArray(id)) {
      return id.flatMap(members)
    }
    const group = byId.get(id)?.customData?.asterContainer
    return Array.isArray(group) ? [id, ...group] : [id]
  }
  const name = (id) => (Array.isArray(id) ? `[${id.join(', ')}]` : id)
  const missing = (ids) => ids.flatMap(members).filter((id) => !known.has(id))
  const hint = (gone) =>
    gone
      .map((id) => {
        const near = lookalikes(id, known)
        return near.length ? `no item ${id} (drawn: ${near.join(', ')})` : `no item ${id}`
      })
      .join('; ')
  const reachesAny = (from, to) =>
    members(from).some((a) => members(to).some((b) => a === b || reaches(edges, a, b)))
  const linkedAny = (from, to) =>
    members(from).some((a) => members(to).some((b) => a !== b && linked(graph, small, a, b)))
  // Why a U-Net's own id: its skips are drawn by fig.unet, which records the halves they join.
  const unetSkips = new Set(
    elements.map((element) => element.customData?.asterLink?.unet).filter(Boolean)
  )
  for (const loop of motifs.loops ?? []) {
    const gone = missing(loop)
    const breaks = loop
      .map((id, index) => [id, loop[(index + 1) % loop.length]])
      .filter(([from, to]) => !gone.length && !reachesAny(from, to))
    if (gone.length || breaks.length) {
      add(
        'warning',
        'missing-loop',
        null,
        `the loop ${loop.map(name).join(' → ')} → ${name(loop[0])} you listed is not drawn: ${
          gone.length
            ? hint(gone)
            : `nothing leads from ${breaks.map(([from, to]) => `${name(from)} to ${name(to)}`).join(', ')}`
        }${inRow(loop.flat(), elements) ? '; its items sit in a row, so it reads as a list' : ''}. Draw the cycle (fig.ring, or arrows round a ring) so the reader sees it repeat`
      )
    }
  }
  for (const { from, to = [] } of motifs.fanouts ?? []) {
    const gone = missing([from, ...to])
    const unreached = to.filter((id) => !reachesAny(from, id))
    if (gone.length || unreached.length) {
      add(
        'warning',
        'missing-fanout',
        null,
        `${name(from)} should fan out to ${to.map(name).join(', ')}, but ${
          gone.length ? hint(gone) : `nothing leads from it to ${unreached.map(name).join(', ')}`
        }; draw one wire to each (fig.bus, fig.fork; a column of cells can be named as a list or a fig.group)`
      )
    }
  }
  for (const [kind, pairs] of [
    ['skip', motifs.skips ?? []],
    ['feedback', motifs.feedback ?? []]
  ]) {
    const absent = pairs.filter(
      ([from, to]) => !(from === to && unetSkips.has(from)) && !(from !== to && linkedAny(from, to))
    )
    if (absent.length) {
      const gone = missing(absent.flat())
      add(
        'warning',
        'missing-link',
        null,
        `the ${kind} link${absent.length > 1 ? 's' : ''} ${absent.map(([from, to]) => `${name(from)} → ${name(to)}`).join(', ')} you listed ${absent.length > 1 ? 'are' : 'is'} not drawn${
          gone.length ? ` (${hint(gone)})` : ''
        }: an arrow between them, a chain through small connectors (a dot, ⊕, a stop-grad node), or a chain in one role (role: '${kind === 'skip' ? 'skip' : 'grad'}' on every arrow of the path)`
      )
    }
  }
  if (
    motifs.text &&
    LOOP_WORDS.test(motifs.text) &&
    !(motifs.loops ?? []).length &&
    !hasCycle(edges)
  ) {
    add(
      'warning',
      'missing-loop',
      null,
      `the text says the method loops ("${LOOP_WORDS.exec(motifs.text)[0]}"), but no cycle is drawn: list it in fig.structure({ loops }) and draw the return path, never a row of steps`
    )
  }
}

const neutralInk = (hex) => {
  const color = colorClass(hex)
  return !color || color.kind !== 'hue'
}

/**
 * Every module the same rectangle and every arrow one neutral colour: the generated look. Shapes
 * that carry meaning (a trapezoid, a stack, a cylinder, a node, a picture) or arrows coloured by
 * what flows break it.
 */
export function uniformLookChecks(elements, add) {
  const modules = elements.filter(
    (element) =>
      element.type === 'rectangle' &&
      element.width >= 24 &&
      element.height >= 16 &&
      !/-r\d+c\d+$/.test(element.id) &&
      !element.customData?.asterPanel &&
      !element.customData?.asterContainer &&
      (element.boundElements ?? []).some((bound) => bound.type === 'text')
  )
  // Why not pictures: photos beside a row of identical boxes still read as a flowchart.
  const varied = elements.some(
    (element) =>
      element.customData?.asterShape ||
      /-card\d+$/.test(element.id) ||
      element.type === 'diamond' ||
      (element.type === 'line' && (element.points?.length ?? 0) > 3) ||
      (element.type === 'ellipse' && element.width >= 16)
  )
  const arrows = elements.filter((element) => element.type === 'arrow')
  const inks = new Set(arrows.map((arrow) => String(arrow.strokeColor).toLowerCase()))
  const plainArrows = arrows.length >= 3 && [...inks].every(neutralInk) && inks.size <= 2
  if (modules.length >= 5 && !varied && plainArrows) {
    add(
      'warning',
      'uniform-look',
      null,
      `all ${modules.length} modules are the same rectangle and every arrow is gray or black, the look of a generated flowchart; give shapes their meaning (trapezoid for an encoder or decoder, fig.cylinder for a store, stack for a set, node or plain text for an operation) and colour arrows by what flows (role: 'cond' | 'grad' | 'feedback' …)`
    )
  }
}

/** Findings that say the content is squeezed. */
const CROWDING = new Set([
  'stub-arrow',
  'label-on-head',
  'text-over-shape',
  'text-overflow',
  'text-overlap',
  'arrow-over-text',
  'arrow-through',
  'outside-page',
  'margin',
  'hug-border',
  'panel-tight',
  'small-text'
])

/**
 * The content does not fit the page: several crowding findings at once. On a page the person or
 * Aster sized, the agent keeps the size and cuts or merges; on its own page it may grow it. It
 * names what to compact first; on a small page `small-page` says it instead; and when much of the
 * page is still blank the crowding is local, so it says to spread out first and the page-size
 * suggestions (tall-figure) that would contradict it are dropped.
 */
export function pageFitChecks(page, report, add, elements = []) {
  if (!page) {
    return
  }
  const crowded = [...report.errors, ...report.warnings].filter((entry) => CROWDING.has(entry.code))
  if (smallPageChecks(elements, page, report, crowded.length, add)) {
    return
  }
  const kinds = [...new Set(crowded.map((entry) => entry.code))]
  if (crowded.length < 4 || kinds.length < 2) {
    return
  }
  const size = `${page.widthIn} × ${page.heightIn} in`
  const lists = [report.warnings, report.notes ?? []]
  const roomy = lists.flatMap((list) => list.filter((entry) => ROOMY.has(entry.code)))
  for (const list of lists) {
    const kept = list.filter((entry) => entry.code !== 'tall-figure')
    list.splice(0, list.length, ...kept)
  }
  const near = [...new Set(crowded.map((entry) => entry.id).filter(Boolean))].slice(0, 4)
  const drop = dropPhrase(elements, report)
  const advice = roomy.length
    ? `The crowding is local (around ${near.join(', ') || 'a few items'}) while part of the page is blank (${[...new Set(roomy.map((entry) => entry.code))].join(', ')}): spread the crowded items into the free space first, then cut`
    : page.sizeBy === 'agent'
      ? 'Cut or merge parts first; grow the page (fig.setPage) only if the figure needs every part'
      : 'The page was set for you: keep its size and everything the request names; compact (shorter words for what you added, stacked labels, smaller gaps, one legend row, inline math), then merge what you added yourself (routine steps become arrow labels), and say in your reply anything you left out'
  add(
    page.sizeBy === 'agent' ? 'warning' : 'note',
    'page-overfull',
    null,
    `the content does not fit the ${size} page: ${crowded.length} crowding findings (${kinds.join(', ')}). ${advice}${drop ? `; ${drop}` : ''}`
  )
}

/** A short symbol with a TeX script (x_t, h_{t-1}, B^T) or a macro, written outside math. */
const LITERAL_MATH =
  /(^|[\s(=+,-])([A-Za-z]{1,3}[_^](\{[^}]{1,12}\}|[A-Za-z0-9])|\\[a-zA-Z]{2,})(?=$|[\s),=+.:;-])/

/**
 * Text that prints its TeX source: a plain label "B_t" or "h_t = Ā h_{t-1}" shows the
 * underscore and braces at print. Typeset math is an image, so only plain text is checked.
 */
export function literalMathChecks(elements, add) {
  // Why not code: a code card prints z_t as the program has it.
  for (const text of elements.filter(
    (element) => element.type === 'text' && !element.customData?.asterCode
  )) {
    const source = String(text.text ?? '')
    const found = LITERAL_MATH.exec(source)
    if (found) {
      add(
        'warning',
        'literal-math',
        text,
        `prints the TeX "${found[2]}" as typed; write the math as math: a box's label '$B_t$' or math: 'B_t', a text's '$h_t$ …' or runs, an arrow's label 'x_t'`
      )
    }
  }
}
