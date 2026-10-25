/**
 * Reverse SyncTeX lookup (PDF point → TeX source line) without the `synctex` binary, which
 * Tectonic installs do not ship. Reads the documented text format Tectonic's --synctex writes.
 */

export type SynctexNode = {
  /** `(`/`h` hbox, `[`/`v` vbox, `x` current point, `k` kern, `g` glue, `$` math. */
  kind: string
  input: number
  line: number
  x: number
  y: number
  width: number
  height: number
  depth: number
}

export type SynctexDocument = {
  inputs: Map<number, string>
  pages: Map<number, SynctexNode[]>
}

const RECORD =
  /^([[(vhxkg$])(\d+),(\d+)(?:,-?\d+)?:(-?\d+),(-?\d+)(?::(-?\d+)(?:,(-?\d+),(-?\d+))?)?/
// TeX scaled points to PDF big points: 65536 sp per pt, 72.27 pt per inch, 72 bp per inch.
const SP_TO_BP = 72 / 72.27 / 65536

export function parseSynctex(text: string): SynctexDocument {
  const inputs = new Map<number, string>()
  const pages = new Map<number, SynctexNode[]>()
  let unit = 1
  let magnification = 1000
  let xOffset = 0
  let yOffset = 0
  let page: SynctexNode[] | null = null
  let inContent = false
  for (const line of text.split('\n')) {
    if (!inContent) {
      const separator = line.indexOf(':')
      const key = line.slice(0, separator)
      const value = line.slice(separator + 1)
      if (key === 'Input') {
        const tagEnd = value.indexOf(':')
        inputs.set(Number(value.slice(0, tagEnd)), value.slice(tagEnd + 1))
      } else if (key === 'Unit') {
        unit = Number(value) || 1
      } else if (key === 'Magnification') {
        magnification = Number(value) || 1000
      } else if (key === 'X Offset') {
        xOffset = Number(value) || 0
      } else if (key === 'Y Offset') {
        yOffset = Number(value) || 0
      } else if (line.startsWith('Content:')) {
        inContent = true
      }
      continue
    }
    if (line.startsWith('{')) {
      page = []
      pages.set(Number(line.slice(1)), page)
      continue
    }
    if (line.startsWith('}')) {
      page = null
      continue
    }
    if (line.startsWith('Input:')) {
      // Inputs opened mid-document are declared inside the content section too.
      const value = line.slice('Input:'.length)
      const tagEnd = value.indexOf(':')
      inputs.set(Number(value.slice(0, tagEnd)), value.slice(tagEnd + 1))
      continue
    }
    const match = page ? RECORD.exec(line) : null
    if (!page || !match) {
      continue
    }
    const scale = unit * (magnification / 1000) * SP_TO_BP
    page.push({
      kind: match[1],
      input: Number(match[2]),
      line: Number(match[3]),
      x: (Number(match[4]) + xOffset) * scale,
      y: (Number(match[5]) + yOffset) * scale,
      width: Number(match[6] ?? 0) * scale,
      height: Number(match[7] ?? 0) * scale,
      depth: Number(match[8] ?? 0) * scale
    })
  }
  return { inputs, pages }
}

// Why: TeX writes a paragraph's line boxes once the paragraph ends, so they carry its last line
// (or even the enclosing file); the glue and kerns between words keep each word's own line.
const BOX_KINDS = new Set(['(', 'h', '[', 'v'])
// Wider spaces are fills, such as the \parfillskip that ends a paragraph after its last word.
const MAX_WORD_SPACE = 12
// A selection ends at its last glyph; the node after that word sits one interword space later.
const WORD_END_SLACK = 7

export type SynctexRect = { x: number; y: number; width: number; height: number }
export type SynctexHit = { input: string; line: number }
export type SynctexRange = { input: string; startLine: number; endLine: number }

export function isSynctexBox(node: SynctexNode): boolean {
  return BOX_KINDS.has(node.kind)
}

function isFill(node: SynctexNode): boolean {
  return node.kind === 'k' && node.width > MAX_WORD_SPACE
}

/**
 * Glue, kerns and math between words: the records whose line is the word's own source line.
 * Skips fills and the zero-width glue TeX leaves where a fill ends, which carry the line that
 * ended the paragraph (often the blank line after it), and the zero-width kern ending each
 * broken line, which carries the line of the word that starts the next one.
 */
export function synctexWordNodes(nodes: readonly SynctexNode[]): SynctexNode[] {
  const fills = nodes.filter(isFill)
  return nodes.filter(
    (node) =>
      !isSynctexBox(node) &&
      !isFill(node) &&
      !(node.kind === 'k' && node.width === 0) &&
      !fills.some((fill) => Math.abs(fill.x - node.x) < 0.5 && Math.abs(fill.y - node.y) < 0.5)
  )
}

export function synctexPageNodes(document: SynctexDocument, pageNumber: number): SynctexNode[] {
  return (document.pages.get(pageNumber) ?? []).filter(
    (node) => node.line > 0 && Boolean(document.inputs.get(node.input))
  )
}

/** The smallest horizontal box (one typeset line or less) holding the point. */
export function synctexLineBoxAt(
  nodes: readonly SynctexNode[],
  x: number,
  y: number
): SynctexNode | null {
  let box: SynctexNode | null = null
  for (const node of nodes) {
    if (node.kind !== '(' && node.kind !== 'h') {
      continue
    }
    const inside =
      x >= node.x - 1 &&
      x <= node.x + node.width + 1 &&
      y >= node.y - node.height - 1 &&
      y <= node.y + node.depth + 1
    const area = node.width * (node.height + node.depth)
    if (inside && (!box || area < box.width * (box.height + box.depth))) {
      box = node
    }
  }
  return box
}

/**
 * A word's line sits on the node right after it: the space that follows it. A line's last word
 * has none of its own (or only a fill), so the word before it is the guide there.
 */
function wordNodeAt(onLine: readonly SynctexNode[], x: number): SynctexNode | null {
  let before: SynctexNode | null = null
  let after: SynctexNode | null = null
  for (const node of synctexWordNodes(onLine)) {
    if (node.x >= x - 0.5) {
      after = !after || node.x < after.x ? node : after
    } else {
      before = !before || node.x > before.x ? node : before
    }
  }
  const fillStarts = onLine
    .filter(isFill)
    .map((fill) => fill.x - fill.width)
    .filter((start) => start >= x - 0.5)
  const fillFirst = after && fillStarts.some((start) => start < after.x)
  return (fillFirst ? before : after) ?? before ?? after ?? onLine.find(isFill) ?? null
}

function hitOf(document: SynctexDocument, node: SynctexNode | null): SynctexHit | null {
  const input = node ? document.inputs.get(node.input) : undefined
  return node && input ? { input, line: node.line } : null
}

/** The source line under a point given in PDF points from the page's top-left corner. */
export function synctexSourceAt(
  document: SynctexDocument,
  pageNumber: number,
  x: number,
  y: number
): SynctexHit | null {
  const nodes = synctexPageNodes(document, pageNumber)
  const box = synctexLineBoxAt(nodes, x, y)
  if (box) {
    const onLine = nodes.filter(
      (node) =>
        !isSynctexBox(node) &&
        Math.abs(node.y - box.y) < 0.5 &&
        node.x >= box.x - 1 &&
        node.x <= box.x + box.width + 1
    )
    return hitOf(document, wordNodeAt(onLine, x) ?? box)
  }
  // Between lines or in a margin: the nearest word node, staying on the closest baseline.
  let best: SynctexNode | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const node of synctexWordNodes(nodes)) {
    const score = Math.abs(node.y - y) * 8 + Math.abs(node.x - x)
    if (score < bestScore) {
      best = node
      bestScore = score
    }
  }
  return hitOf(document, best)
}

/** Source line ranges behind selected text, one per file, in the order the selection meets them. */
export function synctexSourceRanges(
  document: SynctexDocument,
  pageNumber: number,
  rects: readonly SynctexRect[]
): SynctexRange[] {
  const words = synctexWordNodes(synctexPageNodes(document, pageNumber))
  const ranges = new Map<string, SynctexRange>()
  const add = (hit: SynctexHit | null): void => {
    if (!hit) {
      return
    }
    const range = ranges.get(hit.input)
    if (range) {
      range.startLine = Math.min(range.startLine, hit.line)
      range.endLine = Math.max(range.endLine, hit.line)
    } else {
      ranges.set(hit.input, { input: hit.input, startLine: hit.line, endLine: hit.line })
    }
  }
  for (const rect of rects) {
    for (const node of words) {
      // The node at the selection's left edge belongs to the word before it, outside the selection.
      if (
        node.y >= rect.y &&
        node.y <= rect.y + rect.height &&
        node.x > rect.x + 1 &&
        node.x <= rect.x + rect.width + WORD_END_SLACK
      ) {
        add(hitOf(document, node))
      }
    }
  }
  if (ranges.size === 0) {
    for (const rect of rects) {
      add(synctexSourceAt(document, pageNumber, rect.x + rect.width / 2, rect.y + rect.height / 2))
    }
  }
  return [...ranges.values()]
}
