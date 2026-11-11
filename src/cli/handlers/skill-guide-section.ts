// One `## ` section of a guide, so an agent can read the part its task needs without the
// whole guide overflowing its tool output.

const FENCE = /^\s*(```|~~~)/

function normalizeHeading(value: string): string {
  return value.replace(/`/g, '').trim().toLowerCase()
}

type Heading = { title: string; line: number }

function sectionHeadings(lines: readonly string[]): Heading[] {
  const headings: Heading[] = []
  let inFence = false
  lines.forEach((line, index) => {
    if (FENCE.test(line)) {
      inFence = !inFence
      return
    }
    if (!inFence && line.startsWith('## ')) {
      headings.push({ title: line.slice(3).trim(), line: index })
    }
  })
  return headings
}

/** The `## ` headings of a guide, in order. */
export function guideSectionTitles(markdown: string): string[] {
  return sectionHeadings(markdown.split('\n')).map((heading) => heading.title)
}

/**
 * The section whose heading matches `requested` (case and backticks ignored; an exact match wins
 * over a prefix), from its heading to the next `## ` heading. Null when no heading matches.
 */
export function guideSection(markdown: string, requested: string): string | null {
  const lines = markdown.split('\n')
  const headings = sectionHeadings(lines)
  const wanted = normalizeHeading(requested)
  if (!wanted) {
    return null
  }
  const titles = headings.map((heading) => normalizeHeading(heading.title))
  const exact = titles.indexOf(wanted)
  const index = exact !== -1 ? exact : titles.findIndex((title) => title.startsWith(wanted))
  if (index < 0) {
    return null
  }
  const end = headings[index + 1]?.line ?? lines.length
  return `${lines.slice(headings[index].line, end).join('\n').trimEnd()}\n`
}
