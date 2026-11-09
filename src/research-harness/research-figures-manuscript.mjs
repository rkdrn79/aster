// The outline of a manuscript for `figures context`: sections, subsections and run-in
// paragraph headings, whether set with \section, as a bold opening phrase, or left as bare
// lines by text pulled from a PDF ("3.1 Overview", "Data Representation").
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const readText = (file) => readFile(file, 'utf8').catch(() => null)

/** Section commands by depth; run-in headings sit one level under the section above them. */
const SECTION_LEVELS = { section: 1, subsection: 2, subsubsection: 3 }
/** Words a run-in heading may have ("Reconstruction target.", "Stage 1: Pre-training …"). */
const RUN_IN_WORDS = 7
const COMMAND_PATTERN =
  /\\(input|include|section|subsection|subsubsection|paragraph)\b\*?\s*(?:\[[^\]]*\])?\s*(?=\{)/g
// Why: papers often set run-in headings as a bold or italic phrase opening a paragraph.
const RUN_IN_PATTERN = /(?<=^|\n[ \t]*\n)[ \t]*(?:\\noindent\s*)?\\(?:textbf|textit|emph)(?=\{)/g
// Why: text pulled from a PDF keeps a run-in heading as its own one-line paragraph.
const LINE_PATTERN = /(?<=^|\n[ \t]*\n)[ \t]*([A-Z][^\\$[\]\n]{0,58}\.)[ \t]*(?=\n[ \t]*\n|\s*$)/g
// Why: text pulled from a PDF keeps headings as bare one-line paragraphs: numbered ("3.1
// Overview", "4.2 Training") or plain ("Data Representation"), without \section.
const BARE_PATTERN =
  /(?<=^|\n[ \t]*\n)[ \t]*(?:(\d{1,2}(?:\.\d{1,2}){0,2})\.?[ \t]+)?([A-Z][^\\$[\]\n.:;,]{1,78})\.?[ \t]*(?=\n[ \t]*\n|\s*$)/g
/** Words a bare heading may have: a numbered one is a title, a plain one a short phrase. */
const BARE_WORDS = { numbered: 10, plain: 5 }

/** The text inside the balanced braces that open at `start` ({ … {nested} … }). */
function bracedAt(text, start) {
  let depth = 0
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '{' && text[index - 1] !== '\\') {
      depth += 1
    } else if (text[index] === '}' && text[index - 1] !== '\\') {
      depth -= 1
      if (depth === 0) {
        return text
          .slice(start + 1, index)
          .replaceAll(/\s+/g, ' ')
          .trim()
      }
    }
  }
  return null
}

/** Headings and \input names of one TeX source, in order, with their lines. */
function texOutline(source) {
  const text = source.replaceAll(/(^|[^\\])%.*$/gm, '$1')
  const lineAt = (index) => text.slice(0, index).split('\n').length
  const items = []
  for (const match of text.matchAll(COMMAND_PATTERN)) {
    const body = bracedAt(text, match.index + match[0].length)
    if (body !== null) {
      items.push({ at: match.index, command: match[1], body })
    }
  }
  for (const match of text.matchAll(RUN_IN_PATTERN)) {
    const body = bracedAt(text, match.index + match[0].length)
    if (body && body.length <= 80) {
      items.push({ at: match.index, command: 'run-in', body })
    }
  }
  for (const match of text.matchAll(LINE_PATTERN)) {
    if (match[1].split(/\s+/).length <= RUN_IN_WORDS) {
      items.push({ at: match.index, command: 'run-in', body: match[1].trim() })
    }
  }
  for (const match of text.matchAll(BARE_PATTERN)) {
    const [whole, number, title] = match
    const words = title.trim().split(/\s+/).length
    // Why: a plain line ending in a period is a run-in heading (LINE_PATTERN) or a sentence.
    const caption = /^(?:figure|fig|table|algorithm|equation|eq)\b/i.test(title)
    if (
      caption ||
      words > BARE_WORDS[number ? 'numbered' : 'plain'] ||
      (!number && whole.trim().endsWith('.'))
    ) {
      continue
    }
    const body = number ? `${number} ${title.trim()}` : title.trim()
    items.push(
      number
        ? { at: match.index, command: 'numbered', depth: number.split('.').length, body }
        : { at: match.index, command: 'run-in', body }
    )
  }
  return items
    .toSorted((first, second) => first.at - second.at)
    .map((item) => ({ ...item, line: lineAt(item.at) }))
}

/** Sections, subsections and run-in paragraph headings, following \input and \include once. */
export async function manuscriptHeadings(file, text) {
  const headings = []
  const included = new Set()
  const folder = path.dirname(file)
  let level = 0
  const scan = async (source, from, depth) => {
    const where = path.relative(folder, from).split(path.sep).join('/')
    for (const { command, body, line, depth: numbered } of texOutline(source)) {
      if (command === 'input' || command === 'include') {
        const child = path.resolve(folder, body.endsWith('.tex') ? body : `${body}.tex`)
        included.add(child)
        const nested = depth < 1 ? await readText(child) : null
        if (nested !== null) {
          await scan(nested, child, depth + 1)
        }
      } else if (SECTION_LEVELS[command] || command === 'numbered') {
        level = SECTION_LEVELS[command] ?? numbered
        headings.push({ level, title: body, file: where, line })
      } else {
        headings.push({ level: level + 1, title: body, paragraph: true, file: where, line })
      }
    }
  }
  await scan(text, file, 0)
  return { headings, included }
}
