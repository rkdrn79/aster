import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { projectFile, projectRelative, stripTexComment } from './research-manuscript-numbers.mjs'

/**
 * The manuscript as `writing check` reads it: `\input` expanded in reading order, split into
 * sections (each with a role such as intro or method), paragraphs and floats, every piece keeping
 * the file and line it came from so findings can point at the source.
 */

export const WRITING_ROLES = [
  'abstract',
  'intro',
  'related',
  'background',
  'method',
  'experiments',
  'conclusion',
  'appendix',
  'body'
]

const MAX_FILES = 50
const FLOAT_ENVIRONMENTS = new Set([
  'figure',
  'table',
  'wrapfigure',
  'wraptable',
  'algorithm',
  'algorithm2e',
  'subfigure'
])
const SKIPPED_ENVIRONMENTS = new Set([
  'lstlisting',
  'verbatim',
  'minted',
  'tikzpicture',
  'tabular',
  'tabularx',
  'comment',
  'thebibliography'
])
const LIST_ENVIRONMENTS = new Set(['itemize', 'enumerate', 'description', 'compactitem'])
const SECTION_COMMAND =
  /\\(chapter|section|subsection|subsubsection|paragraph)\*?\s*(?:\[[^\]]*\])?\s*\{/
const ENVIRONMENT = /\\(begin|end)\{([a-zA-Z]+)\*?\}/g

/** Title keywords → role; the first match wins, so related work is tested before method. */
const ROLE_PATTERNS = [
  ['intro', /\bintro/i],
  ['related', /\brelated\b|\bprior work\b|\bliterature\b/i],
  [
    'background',
    /\bbackground\b|\bpreliminar|\bproblem (?:setup|setting|statement|formulation)\b|\bnotation\b/i
  ],
  ['conclusion', /\bconclu|\bdiscussion\b|\blimitation|\bfuture work\b|\bbroader impact/i],
  [
    'experiments',
    /\bexperiment|\bevaluation\b|\bresults?\b|\bempirical|\bablation|\banalys[ie]s\b|\bbenchmark/i
  ],
  [
    'method',
    /\bmethod|\bapproach\b|\bour (?:model|framework|method)\b|\bframework\b|\balgorithm\b|\barchitecture\b|\bdesign\b/i
  ]
]

/** The role a `\section` title names, or null when the title is the method's own name. */
export function roleFromTitle(title) {
  for (const [role, pattern] of ROLE_PATTERNS) {
    if (pattern.test(title)) {
      return role
    }
  }
  return null
}

export function readBalanced(text, open) {
  let depth = 0
  for (let index = open; index < text.length; index += 1) {
    const char = text[index]
    if (char === '\\') {
      index += 1
    } else if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return { value: text.slice(open + 1, index), end: index + 1 }
      }
    }
  }
  return null
}

function inputTargets(line) {
  return [...line.matchAll(/\\(?:input|include|subfile)\{([^{}]+)\}/g)].map((match) =>
    match[1].trim()
  )
}

/**
 * Lines of `mainFile` with `\input`/`\include` expanded where they appear. Each line keeps its
 * raw text (for waivers and section overrides in comments) and the comment-stripped text.
 */
export async function readManuscriptLines(project, mainFile) {
  const directory = path.dirname(mainFile)
  const lines = []
  const files = []
  async function visit(file, depth) {
    if (files.includes(file) || depth > 4 || files.length >= MAX_FILES) {
      return
    }
    files.push(file)
    const relative = projectRelative(project, file)
    const rawLines = (await readFile(file, 'utf8')).split(/\r?\n/)
    for (let index = 0; index < rawLines.length; index += 1) {
      const raw = rawLines[index]
      const text = stripTexComment(raw)
      const targets = inputTargets(text)
      lines.push({
        file: relative,
        line: index + 1,
        raw,
        text: targets.length ? text.replace(/\\(?:input|include|subfile)\{[^{}]+\}/g, ' ') : text,
        input: targets.length > 0
      })
      for (const name of targets) {
        const candidate = path.resolve(directory, path.extname(name) ? name : `${name}.tex`)
        const included = await projectFile(project, path.relative(project, candidate)).catch(
          () => null
        )
        if (included) {
          await visit(included, depth + 1)
        }
      }
    }
  }
  await visit(mainFile, 0)
  return { lines, files: files.map((file) => projectRelative(project, file)) }
}

/** Zero-argument `\newcommand{\name}{text}` macros whose text is plain words, for expansion. */
export function textMacros(lines) {
  const macros = new Map()
  for (const { text } of lines) {
    const match = /\\(?:re)?newcommand\*?\s*\{?\\([a-zA-Z]+)\}?\s*\{/.exec(text)
    if (!match || /\\(?:re)?newcommand\*?\s*\{?\\[a-zA-Z]+\}?\s*\[/.test(text)) {
      continue
    }
    const body = readBalanced(text, match.index + match[0].length - 1)
    if (!body) {
      continue
    }
    const plain = body.value
      .replace(/\\(?:xspace|textsc|textbf|textit|emph|mathrm|text|textrm|textsf)\b/g, '')
      .replace(/[{}~]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (plain && plain.length <= 40 && !/[\\$]/.test(plain)) {
      macros.set(match[1], plain)
    }
  }
  return macros
}

function environmentEvents(text) {
  return [...text.matchAll(ENVIRONMENT)].map((match) => ({
    kind: match[1],
    name: match[2],
    index: match.index
  }))
}

function sectionTitle(text) {
  const match = SECTION_COMMAND.exec(text)
  if (!match) {
    return null
  }
  const title = readBalanced(text, match.index + match[0].length - 1)
  return {
    level: match[1],
    title: (title?.value ?? '')
      .replace(/\\label\{[^}]*\}/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
    rest: title ? text.slice(title.end) : ''
  }
}

function overrideRole(entry, next) {
  const pattern = /%\s*aster:section=([a-z]+)/
  const match = pattern.exec(entry.raw) ?? (next ? pattern.exec(next.raw) : null)
  return match && WRITING_ROLES.includes(match[1]) ? match[1] : null
}

class SectionBuilder {
  constructor() {
    this.sections = []
    this.floats = []
    this.current = null
    this.paragraph = null
  }

  open(role, title, entry, { explicit = false } = {}) {
    this.closeParagraph()
    this.current = {
      role,
      explicit,
      title,
      file: entry.file,
      line: entry.line,
      endLine: entry.line,
      paragraphs: [],
      listItems: 0
    }
    this.sections.push(this.current)
  }

  closeParagraph() {
    if (this.paragraph && this.current && this.paragraph.lines.some((line) => line.text.trim())) {
      this.current.paragraphs.push(this.paragraph)
    }
    this.paragraph = null
  }

  push(entry, text, { item = false, heading = null } = {}) {
    if (!this.current) {
      return
    }
    if (!this.paragraph) {
      this.paragraph = { lines: [], item, heading }
    }
    this.paragraph.lines.push({ file: entry.file, line: entry.line, text, raw: entry.raw })
    this.current.endLine = entry.line
  }
}

/**
 * Splits manuscript lines into sections, paragraphs and floats. `fragment` (no
 * `\begin{document}`) means the lines are one section file: text before its first heading still
 * belongs to a section, whose role is `forcedRole` or 'body'.
 */
export function segmentManuscript(lines, { forcedRole = null } = {}) {
  const start = lines.findIndex((entry) => entry.text.includes('\\begin{document}'))
  const fragment = start === -1
  // Why only fragments: in a whole paper --section picks sections, it does not relabel them.
  const forced = fragment ? forcedRole : null
  const builder = new SectionBuilder()
  if (fragment && lines.length) {
    builder.open(forced ?? 'body', '', lines[0], { explicit: Boolean(forced) })
  }
  // Why: numbers, waivers and reference findings are found by line and reported per section.
  const owners = new Map()
  let floatDepth = 0
  let floatEntry = null
  let skipDepth = 0
  let listDepth = 0
  let appendix = false
  for (let index = fragment ? 0 : start + 1; index < lines.length; index += 1) {
    const entry = lines[index]
    let text = entry.text
    if (text.includes('\\end{document}')) {
      break
    }
    owners.set(`${entry.file}:${entry.line}`, builder.current)
    if (entry.input) {
      builder.closeParagraph()
    }
    let floatClosed = false
    for (const event of environmentEvents(text)) {
      if (FLOAT_ENVIRONMENTS.has(event.name)) {
        if (event.kind === 'begin') {
          floatDepth += 1
          if (floatDepth === 1) {
            floatEntry = {
              kind: event.name.replace(/2e$/, ''),
              file: entry.file,
              line: entry.line,
              text: ''
            }
          }
        } else if (floatDepth > 0) {
          floatDepth -= 1
          if (floatDepth === 0 && floatEntry) {
            floatEntry.text += `\n${text}`
            finishFloat(builder, floatEntry, entry)
            floatEntry = null
            floatClosed = true
          }
        }
      } else if (SKIPPED_ENVIRONMENTS.has(event.name) && floatDepth === 0) {
        skipDepth = Math.max(0, skipDepth + (event.kind === 'begin' ? 1 : -1))
        text = ''
      } else if (LIST_ENVIRONMENTS.has(event.name)) {
        listDepth = Math.max(0, listDepth + (event.kind === 'begin' ? 1 : -1))
        builder.closeParagraph()
      } else if (event.name === 'abstract' && floatDepth === 0) {
        if (event.kind === 'begin') {
          builder.open(forced ?? 'abstract', 'Abstract', entry, { explicit: true })
          owners.set(`${entry.file}:${entry.line}`, builder.current)
        } else {
          builder.closeParagraph()
          // Why: \maketitle and the like between the abstract and the first section are not prose.
          builder.current = fragment ? builder.current : null
        }
      }
    }
    if (floatClosed) {
      continue
    }
    if (floatDepth > 0 && floatEntry) {
      floatEntry.text += `\n${text}`
      continue
    }
    if (skipDepth > 0 || !text.trim()) {
      if (!text.trim()) {
        builder.closeParagraph()
      }
      continue
    }
    if (/\\appendix\b/.test(text)) {
      appendix = true
      builder.closeParagraph()
      continue
    }
    const heading = sectionTitle(text)
    if (heading && (heading.level === 'section' || heading.level === 'chapter')) {
      const override = overrideRole(entry, lines[index + 1])
      const role = forced ?? override ?? (appendix ? 'appendix' : roleFromTitle(heading.title))
      builder.open(role, heading.title, entry, { explicit: Boolean(role) })
      owners.set(`${entry.file}:${entry.line}`, builder.current)
      text = heading.rest
    } else if (heading) {
      builder.closeParagraph()
      if (heading.level === 'paragraph') {
        builder.push(entry, `${heading.title}. ${heading.rest}`, { heading: heading.title })
        continue
      }
      text = heading.rest
    }
    const items = text.split(/\\item\b(?:\s*\[[^\]]*\])?/)
    items.forEach((piece, position) => {
      if (position > 0) {
        builder.closeParagraph()
        if (builder.current) {
          builder.current.listItems += 1
        }
      }
      if (piece.trim()) {
        builder.push(entry, piece, { item: position > 0 || (listDepth > 0 && !builder.paragraph) })
      }
    })
  }
  builder.closeParagraph()
  // Why: a section file that starts with its \section heading leaves an empty implicit section.
  const kept = builder.sections.filter(
    (section) =>
      section.title ||
      section.paragraphs.length ||
      builder.floats.some((float) => float.section === section)
  )
  builder.sections = kept.length ? kept : builder.sections
  const sections = assignPositionalRoles(builder.sections)
  const renamed = new Map(builder.sections.map((section, index) => [section, sections[index]]))
  for (const [key, section] of owners) {
    owners.set(key, renamed.get(section) ?? null)
  }
  for (const float of builder.floats) {
    float.section = renamed.get(float.section) ?? null
  }
  return { fragment, sections, floats: builder.floats, owners }
}

/** A label's kind: `\captionof{table}` inside a figure (a minipage) makes that label a table. */
function labelKinds(text, floatKind) {
  const kinds = {}
  for (const match of text.matchAll(/\\label\{([^}]*)\}/g)) {
    const before = text.slice(0, match.index)
    const captionof = [...before.matchAll(/\\captionof\{(figure|table)\}|\\caption\b/g)].at(-1)
    kinds[match[1].trim()] = captionof?.[1] ?? floatKind.replace(/^wrap/, '')
  }
  return kinds
}

function finishFloat(builder, floatEntry, endEntry) {
  const kinds = labelKinds(floatEntry.text, floatEntry.kind)
  const labels = Object.keys(kinds)
  const captionAt = floatEntry.text.search(/\\caption\*?\s*(?:\[[^\]]*\])?\{/)
  const caption =
    captionAt === -1
      ? ''
      : (readBalanced(floatEntry.text, floatEntry.text.indexOf('{', captionAt))?.value ?? '')
  builder.floats.push({
    kind: floatEntry.kind,
    labels,
    labelKinds: kinds,
    caption: caption.replace(/\s+/g, ' ').trim(),
    file: floatEntry.file,
    line: floatEntry.line,
    endLine: endEntry.line,
    section: builder.current
  })
}

/**
 * A section titled with the method's own name ("Wanda: Pruning by ...") has no keyword: between
 * the introduction and the experiments it is the method; elsewhere it stays 'body'.
 */
function assignPositionalRoles(sections) {
  const firstExperiments = sections.findIndex((section) => section.role === 'experiments')
  const firstIntro = sections.findIndex((section) => section.role === 'intro')
  return sections.map((section, index) => {
    if (section.role) {
      return section
    }
    const afterIntro = firstIntro !== -1 && index > firstIntro
    const beforeExperiments = firstExperiments === -1 || index < firstExperiments
    return { ...section, role: afterIntro && beforeExperiments ? 'method' : 'body' }
  })
}
