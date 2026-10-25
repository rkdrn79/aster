/** Forward SyncTeX lookup (TeX source line → PDF boxes), the other half of research-synctex. */
import {
  isSynctexBox,
  synctexLineBoxAt,
  synctexPageNodes,
  synctexWordNodes,
  type SynctexDocument,
  type SynctexNode,
  type SynctexRect
} from './research-synctex'

export type SynctexPdfLocation = { pageNumber: number; boxes: SynctexRect[] }

const MAX_BOXES = 40

/**
 * Where a source line was typeset: the first page showing it, with one box per typeset line
 * spanning that line's words. Lines that typeset nothing (comments, blank lines inside an
 * environment) resolve to the next line that did, as SyncTeX viewers do.
 */
export function synctexPdfLocation(
  document: SynctexDocument,
  inputs: ReadonlySet<number>,
  line: number
): SynctexPdfLocation | null {
  const pageNumbers = [...document.pages.keys()].sort((a, b) => a - b)
  const recorded = new Set<number>()
  for (const pageNumber of pageNumbers) {
    for (const node of synctexWordNodes(synctexPageNodes(document, pageNumber))) {
      if (inputs.has(node.input)) {
        recorded.add(node.line)
      }
    }
  }
  const lines = [...recorded]
  const after = lines.filter((candidate) => candidate >= line)
  const target = after.length ? Math.min(...after) : lines.length ? Math.max(...lines) : null
  if (target === null) {
    return null
  }
  for (const pageNumber of pageNumbers) {
    const nodes = synctexPageNodes(document, pageNumber)
    const matches = synctexWordNodes(nodes).filter(
      (node) => inputs.has(node.input) && node.line === target
    )
    if (matches.length) {
      return { pageNumber, boxes: lineBoxes(nodes, matches).slice(0, MAX_BOXES) }
    }
  }
  return null
}

/** Joins the matched word nodes on each typeset line into one box over those words. */
function lineBoxes(nodes: readonly SynctexNode[], matches: readonly SynctexNode[]): SynctexRect[] {
  const wordNodes = new Set(synctexWordNodes(nodes))
  const groups = new Map<SynctexNode | null, SynctexNode[]>()
  for (const node of matches) {
    const box = synctexLineBoxAt(nodes, node.x - 0.5, node.y)
    groups.set(box, [...(groups.get(box) ?? []), node])
  }
  const rects: SynctexRect[] = []
  for (const [box, words] of groups) {
    const first = Math.min(...words.map((node) => node.x))
    const last = Math.max(...words.map((node) => node.x))
    if (!box) {
      rects.push({ x: first - 2, y: words[0].y - 8, width: last - first + 4, height: 10 })
      continue
    }
    // The first matched word starts at the node before it, or at the line start.
    let start = box.x
    // Past the last match, a line end or fill means the line's last word shares its source line.
    let end = box.x + box.width
    let next: SynctexNode | null = null
    for (const node of nodes) {
      if (isSynctexBox(node) || Math.abs(node.y - box.y) >= 0.5 || node.x > end + 1) {
        continue
      }
      if (node.x < first && node.x > start) {
        start = node.x
      } else if (node.x > last + 0.5 && (!next || node.x < next.x)) {
        next = node
      }
    }
    if (next && wordNodes.has(next)) {
      end = last
    } else if (next) {
      end = next.x - next.width
    }
    rects.push({
      x: start,
      y: box.y - box.height,
      width: Math.max(2, end - start),
      height: Math.max(2, box.height + box.depth)
    })
  }
  return rects.sort((a, b) => a.y - b.y || a.x - b.x)
}
