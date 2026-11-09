import { figureLatexSnippet } from '../../../../research-harness/research-figures-model.mjs'

export type ManuscriptSection = { title: string; line: number; level: number }

const SECTION = /^\s*\\(section|subsection|subsubsection)\*?\s*(?:\[[^\]]*\])?\s*\{(.*)\}\s*$/
const LEVELS: Record<string, number> = { section: 1, subsection: 2, subsubsection: 3 }

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** `figures/<slug>` with an extension or the closing brace after it, so `a` never matches `ab`. */
function figurePathPattern(slug: string): RegExp {
  return new RegExp(`(figures/)${escapeRegExp(slug)}(?=[.}])`, 'g')
}

/** 1-based lines whose `\includegraphics` uses `figures/<slug>`; comments are skipped. */
export function figureUsageLines(text: string, slug: string): number[] {
  const pattern = figurePathPattern(slug)
  return text.split('\n').flatMap((line, index) => {
    const code = line.replace(/(^|[^\\])%.*$/, '$1')
    pattern.lastIndex = 0
    return code.includes('\\includegraphics') && pattern.test(code) ? [index + 1] : []
  })
}

/** Rewrites `\includegraphics` paths from one figure to another; returns the text and count. */
export function renameFigureIncludes(
  text: string,
  from: string,
  to: string
): { text: string; count: number } {
  let count = 0
  const lines = text.split('\n').map((line) => {
    if (!line.includes('\\includegraphics')) {
      return line
    }
    return line.replace(figurePathPattern(from), (_match, prefix: string) => {
      count += 1
      return `${prefix}${to}`
    })
  })
  return { text: lines.join('\n'), count }
}

export function manuscriptSections(text: string): ManuscriptSection[] {
  return text.split('\n').flatMap((line, index) => {
    const match = SECTION.exec(line)
    return match ? [{ title: match[2].trim(), line: index + 1, level: LEVELS[match[1]] ?? 1 }] : []
  })
}

/** The figure environment Use in paper writes: natural size, so text keeps its printed pt. */
export function figureBlock(input: {
  slug: string
  widthIn?: number
  caption: string
  label: string
}): string {
  const snippet = figureLatexSnippet({
    slug: input.slug,
    widthIn: input.widthIn,
    caption: input.caption.trim()
  })
  return snippet.replace(
    /\\label\{[^}]*\}/,
    `\\label{${input.label.trim() || `fig:${input.slug}`}}`
  )
}

/**
 * Puts `block` after the heading on line `afterLine` (and the `\label` right under it), with a
 * blank line on each side; returns the text and the 1-based line the block starts on.
 */
export function insertFigureBlock(
  text: string,
  block: string,
  afterLine: number
): { text: string; line: number } {
  const lines = text.split('\n')
  let at = Math.max(0, Math.min(afterLine, lines.length))
  if (at < lines.length && /^\s*\\label\{/.test(lines[at] ?? '')) {
    at += 1
  }
  const before = at > 0 && lines[at - 1]?.trim() !== '' ? [''] : []
  const after = lines[at]?.trim() ? [''] : []
  const inserted = [...before, ...block.split('\n'), ...after]
  lines.splice(at, 0, ...inserted)
  return { text: lines.join('\n'), line: at + before.length + 1 }
}

/** The last caption the agent proposed in a chat transcript: `Caption: "…"` or `Proposed caption: …`. */
export function captionFromChat(text: string): string | null {
  const matches = [...text.matchAll(/(?:proposed caption|caption)\s*[:：]\s*(.+)/gi)]
  const last = matches.at(-1)?.[1]?.trim()
  if (!last) {
    return null
  }
  const unquoted = last.replace(/^["“'`]+/, '').replace(/["”'`]+\.?$/, '')
  return unquoted.trim() || null
}
