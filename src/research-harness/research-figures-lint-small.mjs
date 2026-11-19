// A page too small for what is on it. A short page (under 2 in) or a small single-column one
// tempts an agent to shrink text and pictures until nothing reads, or (round 14) to drop what the
// person asked for. The fix is a more compact drawing: these checks name what to compact first
// (wide gaps, a legend on several rows, a formula in a box of its own, a run of similar items,
// small thumbnails, long labels), largest saving first, for `small-page` and `page-overfull`
// alike, and never suggest dropping anything: what the request names stays.

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])
/** 7 pt and half an inch, in scene units: the smallest text and picture that read at print. */
const SMALLEST_TEXT = 14
const SMALLEST_PICTURE = 72
const ownerOf = (element) => element.customData?.asterKit ?? element.id
const area = (element) => element.width * element.height

/** A page short enough (under 2 in) or small enough (under 6 sq in) to crowd at once. */
export function isSmallPage(page) {
  return Boolean(page) && (page.heightIn < 1.95 || page.widthIn * page.heightIn <= 6)
}

const listed = (ids) => `${ids.slice(0, 3).join(', ')}${ids.length > 3 ? ', …' : ''}`

/** Four or more items of one kind and size (within 15%) in a row or column: cards, thumbnails. */
function similarRuns(items) {
  const like = (a, b) =>
    Math.abs(a.width - b.width) <= Math.max(a.width, b.width) * 0.15 &&
    Math.abs(a.height - b.height) <= Math.max(a.height, b.height) * 0.15 &&
    (a.type === b.type || (a.type !== 'image') === (b.type !== 'image'))
  const lined = (a, b) =>
    Math.abs(a.y + a.height / 2 - (b.y + b.height / 2)) < Math.min(a.height, b.height) / 2 ||
    Math.abs(a.x + a.width / 2 - (b.x + b.width / 2)) < Math.min(a.width, b.width) / 2
  const runs = []
  const used = new Set()
  for (const item of items) {
    if (used.has(item.id)) {
      continue
    }
    const run = items.filter(
      (other) => !used.has(other.id) && like(item, other) && lined(item, other)
    )
    // Why four: three of a kind is often the point (Q, K, V; a tri-plane's planes).
    if (run.length >= 4) {
      run.forEach((member) => used.add(member.id))
      runs.push(run)
    }
  }
  return runs
}

/** Gaps of 20–64 units between neighbours in a row or a column: room to take back (wider ones are a layout gutter). */
function wideGaps(items) {
  const gaps = []
  for (const a of items) {
    for (const b of items) {
      const sameRow =
        Math.abs(a.y + a.height / 2 - (b.y + b.height / 2)) < Math.min(a.height, b.height) / 2
      const sameColumn =
        Math.abs(a.x + a.width / 2 - (b.x + b.width / 2)) < Math.min(a.width, b.width) / 2
      const across = sameRow ? b.x - (a.x + a.width) : sameColumn ? b.y - (a.y + a.height) : -1
      const between = items.some(
        (c) =>
          c !== a &&
          c !== b &&
          (sameRow
            ? c.x >= a.x + a.width && c.x + c.width <= b.x
            : c.y >= a.y + a.height && c.y + c.height <= b.y)
      )
      if (across > 20 && across < 64 && !between) {
        gaps.push({ ids: [a.id, b.id], gap: Math.round(across) })
      }
    }
  }
  return gaps
}

/**
 * What to compact first, the largest saving first: `{ what, area }` with `what` a phrase naming
 * the ids ("the formula rec: inline beside its symbol"). Nothing here is dropped: a small page
 * keeps every part the request names (round 14 lost a U-Net's title, the z sizes and τθ).
 */
export function dropCandidates(elements, report = { warnings: [] }) {
  const out = []
  const legends = elements.filter(
    (element) => element.customData?.asterLegend && element.id === element.customData.asterLegend
  )
  for (const legend of legends) {
    if (legend.height > 30) {
      out.push({
        what: `the legend ${legend.id}: one row under the panels or a column in a free corner, with short item names`,
        area: area(legend) / 2
      })
    } else if (!legend.customData.asterLegendAsked) {
      out.push({
        what: `the legend ${legend.id}: label the parts themselves if the request did not ask for it`,
        area: area(legend) / 2
      })
    }
  }
  const keyed = (report.warnings ?? []).find((entry) => entry.code === 'legend')
  if (keyed?.id) {
    out.push({
      what: `the hand-made key at ${keyed.id}: one fig.legend row, or labels on the parts`,
      area: 2000
    })
  }
  const bound = new Set(
    elements
      .filter((element) => element.type === 'arrow')
      .flatMap((arrow) => [arrow.startBinding?.elementId, arrow.endBinding?.elementId])
  )
  // Why by owner: fig.math draws <id>-0, <id>-1 …; a box's or an arrow's math label is the
  // box's or the arrow's, not a formula of its own.
  const byId = new Map(elements.map((element) => [element.id, element]))
  const formulas = new Map()
  for (const element of elements) {
    const owner = ownerOf(element)
    const holder = byId.get(owner)
    const math = element.customData?.asterTex || element.customData?.asterMath
    if (element.type !== 'image' || !math || (holder && holder !== element) || bound.has(owner)) {
      continue
    }
    const known = formulas.get(owner) ?? { x: Infinity, right: -Infinity, height: 0 }
    formulas.set(owner, {
      x: Math.min(known.x, element.x),
      right: Math.max(known.right, element.x + element.width),
      height: Math.max(known.height, element.height)
    })
  }
  for (const [id, box] of formulas) {
    if (box.right - box.x >= 64) {
      out.push({
        what: `the formula ${id}: inline beside its symbol or on a short second line, at 7 pt (keep it)`,
        area: ((box.right - box.x) * box.height) / 2
      })
    }
  }
  const modules = elements.filter(
    (element) =>
      (SHAPES.has(element.type) || element.type === 'image') &&
      ownerOf(element) === element.id &&
      !element.customData?.asterPanel &&
      !element.customData?.asterContainer &&
      !element.customData?.asterLegend &&
      !element.customData?.asterTex &&
      !element.customData?.asterMath &&
      element.width >= 16 &&
      element.height >= 16
  )
  const runs = similarRuns(modules)
  const repeated = new Set(runs.flat().map((item) => item.id))
  for (const run of runs) {
    const kind = run[0].type === 'image' ? 'pictures' : 'items'
    out.push({
      what: `${run.length} similar ${kind} (${listed(run.map((item) => item.id))}): stack them closer (gap 4–8) or in two columns; keep every one the request lists`,
      area: run.slice(2).reduce((sum, item) => sum + area(item), 0) / 2
    })
  }
  const gaps = wideGaps(modules.filter((item) => !repeated.has(item.id)))
  if (gaps.length >= 2) {
    const widest = gaps.toSorted((a, b) => b.gap - a.gap)
    out.push({
      what: `gaps of ${widest[0].gap} units and more (${listed(widest.map((entry) => entry.ids.join('–')))}): 8–12 units is enough here`,
      area: widest.reduce((sum, entry) => sum + entry.gap * 24, 0)
    })
  }
  const tiny = elements.filter(
    (element) =>
      element.type === 'image' &&
      element.customData?.asterPhoto &&
      !element.customData?.asterIconPicture &&
      !/-r\d+c\d+$/.test(element.id) &&
      !repeated.has(element.id) &&
      Math.min(element.width, element.height) < SMALLEST_PICTURE
  )
  if (tiny.length >= 2) {
    out.push({
      what: `${tiny.length} pictures under half an inch (${listed(tiny.map((item) => item.id))}): 72 units each, made room for by tighter gaps and stacked labels`,
      area: tiny.reduce((sum, item) => sum + area(item), 0) / 2
    })
  }
  const wordy = elements.filter(
    (element) =>
      element.type === 'text' &&
      String(element.text ?? '')
        .split(/\s+/)
        .filter(Boolean).length >= 4
  )
  if (wordy.length) {
    out.push({
      what: `long labels (${listed(wordy.map((text) => ownerOf(text)))}): shorter words or two lines, keeping the request's own terms`,
      area: wordy.reduce((sum, text) => sum + area(text), 0) / 3
    })
  }
  return out.toSorted((first, second) => second.area - first.area)
}

/** The candidates as one phrase for a message: the top three. */
export function dropPhrase(elements, report) {
  const top = dropCandidates(elements, report).slice(0, 3)
  return top.length ? `compact first: ${top.map((item) => item.what).join('; ')}` : ''
}

/**
 * A small page with text under 7 pt or pictures under half an inch: say to simplify, not
 * shrink, and what to drop. Returns whether it spoke, so page-overfull does not repeat it.
 */
export function smallPageChecks(elements, page, report, crowded, add) {
  if (!isSmallPage(page)) {
    return false
  }
  const smallText = elements.filter(
    (element) => element.type === 'text' && (element.fontSize ?? 16) < SMALLEST_TEXT - 0.01
  )
  const smallPictures = elements.filter(
    (element) =>
      element.type === 'image' &&
      element.customData?.asterPhoto &&
      !element.customData?.asterIconPicture &&
      !/-r\d+c\d+$/.test(element.id) &&
      Math.min(element.width, element.height) < SMALLEST_PICTURE
  )
  // Why only shrinking speaks here: crowding alone is page-overfull's, which names the same cuts.
  if (!smallText.length && !smallPictures.length) {
    return false
  }
  const problems = [
    smallText.length ? `${smallText.length} text${smallText.length > 1 ? 's' : ''} under 7 pt` : '',
    smallPictures.length
      ? `${smallPictures.length} picture${smallPictures.length > 1 ? 's' : ''} under half an inch`
      : '',
    crowded >= 3 ? `${crowded} crowding findings` : ''
  ].filter(Boolean)
  const drop = dropPhrase(elements, report)
  add(
    'warning',
    'small-page',
    null,
    `the ${page.widthIn} × ${page.heightIn} in page is small and the drawing shrinks to fit it (${problems.join(', ')}). Compact rather than shrink: keep text at 7 pt (14 units) or more and pictures at half an inch (72 units) or more, and keep everything the request names${drop ? `; ${drop}` : ''}; only then merge or drop what you added yourself${page.sizeBy === 'agent' ? '' : '. Keep the page size and say in your reply anything you left out'}`
  )
  return true
}

/** The blank-page findings that contradict "the content does not fit". */
export const ROOMY = new Set(['tall-figure', 'page-fill', 'empty-space', 'empty-region'])
