import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  numberTokens,
  projectRelative,
  resultNumberCandidates,
  tokenMatchesValue
} from './research-manuscript-numbers.mjs'
import { readBalanced } from './research-writing-tex.mjs'

/**
 * Where a result number can come from when no claim backs it, in the Writing guide's order after
 * claims: the manuscript's own tables, figure captions and other sections, then the project's data
 * files (`data/`, results CSV or JSON). In the writing bench the agent left 34 `\todo`s for numbers
 * that sat in those places because no claim existed; `writing check` uses these sources to keep a
 * sourced number from blocking and to point a `\todo` at the number it asks for.
 */

const DATA_DIR = /^(?:data|datasets?|results?|outputs?|evals?|evaluation|logs?)$/i
const DATA_NAME = /result|metric|score|eval|summary|table/i
const DATA_EXTENSIONS = new Set(['.csv', '.tsv', '.json', '.jsonl', '.md', '.txt'])
const SKIP_DIRS = new Set(['node_modules', '__pycache__', 'venv', 'wandb', 'checkpoints'])
const MAX_DATA_FILES = 200
const MAX_DATA_BYTES = 2_000_000
const MAX_DEPTH = 5
const MAX_VALUES = 20_000
const SOURCE_COMMENT = /%\s*source\s*:/i
const TODO_COMMAND = /\\todo(?:\[[^\]]*\])?\{/g
const NUMBER_TODO =
  /\b(?:evidence|numbers?|results?|headline|scores?|accuracy|accuracies|metrics?|rewards?|perplexity|deltas?|gains?|speed-?ups?|rates?|values?|claims?|percent|fps|auc)\b|%|\d/i
// Words every number request shares; they name the request, not the number.
const STOP = new Set(
  `about after against all also among and any approach are back backed based before behind
  between both but can cite claim claims compare comparison confirm could data does each effect
  evidence exist exists figure figures file for from give given has have headline here how into
  its many may method might missing model more most much must need needed needs none not number
  numbers once one only other our over paper per placeholder record recorded result results run
  runs same section should show shows state such than that the their them then there these this
  those three todo top two under use used using value values versus was were what when where
  whether which while why with without would write yet`.split(/\s+/)
)

const KIND_ORDER = { table: 0, figure: 1, data: 2, text: 3 }

async function dataFiles(project) {
  const found = []
  async function walk(directory, depth, inData) {
    if (depth > MAX_DEPTH || found.length >= MAX_DATA_FILES) {
      return
    }
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (found.length >= MAX_DATA_FILES || entry.name.startsWith('.')) {
        continue
      }
      const full = path.join(directory, entry.name)
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
        await walk(full, depth + 1, inData || DATA_DIR.test(entry.name))
      } else if (entry.isFile()) {
        const extension = path.extname(entry.name).toLowerCase()
        const named = DATA_NAME.test(path.basename(entry.name, extension))
        if (DATA_EXTENSIONS.has(extension) && (inData || named)) {
          found.push(full)
        }
      }
    }
  }
  await walk(project, 0, false)
  return found
}

function expand(text, macros) {
  let out = text
  for (const [name, body] of macros) {
    out = out.replaceAll(new RegExp(`\\\\${name}(?![a-zA-Z])(?:\\{\\})?`, 'g'), body)
  }
  return out.toLowerCase()
}

function floatUnit(float, fileLines, macros) {
  const body = fileLines.slice(float.line - 1, float.endLine)
  const rows = body.filter((line) => line.includes('&'))
  const tokens = [
    ...rows.flatMap((line) => numberTokens(line)),
    ...resultNumberCandidates([float.caption]).map((candidate) => candidate.token)
  ]
  const kind = float.kind.replace(/^wrap/, '').replace(/\*$/, '')
  return {
    kind: kind === 'figure' ? 'figure' : 'table',
    name: float.labels[0] ?? null,
    file: float.file,
    line: float.line,
    endLine: float.endLine,
    text: expand(body.join('\n'), macros),
    values: tokens.map((token) => token.value)
  }
}

async function dataUnit(project, file) {
  const info = await stat(file).catch(() => null)
  if (!info || info.size > MAX_DATA_BYTES) {
    return null
  }
  const text = await readFile(file, 'utf8').catch(() => '')
  const lines = text.toLowerCase().split(/\r?\n/)
  const values = []
  for (const line of lines) {
    for (const token of numberTokens(line)) {
      if (values.length < MAX_VALUES) {
        values.push(token.value)
      }
    }
  }
  const name = projectRelative(project, file)
  return {
    kind: 'data',
    name,
    file: name,
    line: 1,
    endLine: 1,
    text: lines.join('\n'),
    lines,
    values
  }
}

/** Every unit (float, data file, prose paragraph) that holds result-like numbers. */
export async function numberSources(document) {
  const byFile = new Map()
  for (const entry of document.lines) {
    const list = byFile.get(entry.file) ?? []
    list[entry.line - 1] = entry.text
    byFile.set(entry.file, list)
  }
  const units = document.floats.map((float) =>
    floatUnit(
      float,
      Array.from(byFile.get(float.file) ?? [], (line) => line ?? ''),
      document.macros
    )
  )
  for (const file of await dataFiles(document.project)) {
    const unit = await dataUnit(document.project, file)
    if (unit) {
      units.push(unit)
    }
  }
  for (const section of document.sections) {
    for (const paragraph of section.allProse) {
      const values = resultNumberCandidates(paragraph.raw.map((line) => line.text))
      units.push({
        kind: 'text',
        name: section.title || section.role,
        file: paragraph.file,
        line: paragraph.line,
        endLine: paragraph.endLine,
        text: paragraph.text.toLowerCase(),
        values: values.map((candidate) => candidate.token.value)
      })
    }
  }
  return units.filter((unit) => unit.values.length)
}

const covers = (unit, file, line) => unit.file === file && line >= unit.line && line <= unit.endLine

/** The first unit, other than the one at `file:line`, that states `token`'s value. */
export function numberSource(token, units, file, line) {
  return (
    units.find(
      (unit) =>
        !covers(unit, file, line) && unit.values.some((value) => tokenMatchesValue(token, value))
    ) ?? null
  )
}

/** Whether a `% source:` comment sits in the number's paragraph (its line or a line around it). */
export function sourceMarked(document, file, line) {
  const raw = new Map(
    document.lines.filter((entry) => entry.file === file).map((entry) => [entry.line, entry.raw])
  )
  for (const step of [-1, 1]) {
    for (let at = line; raw.get(at)?.trim(); at += step) {
      if (SOURCE_COMMENT.test(raw.get(at))) {
        return true
      }
    }
  }
  return false
}

/** Where a source unit sits, as the person reads it; `hitLine` is a data file's matching line. */
export function describeSource(unit, hitLine = 0) {
  if (unit.kind === 'data') {
    return hitLine > 0 ? `${unit.file}:${String(hitLine)}` : unit.file
  }
  if (unit.kind === 'text') {
    return `the text of "${unit.name}" (${unit.file}:${unit.line})`
  }
  const kind = unit.kind === 'figure' ? 'Figure' : 'Table'
  return `${kind} ${unit.name ?? 'without a label'} (${unit.file}:${unit.line})`
}

function keywords(text, macros) {
  const words = expand(text, macros)
    .replace(/\\[a-z]+/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !/^\d+$/.test(word) && !STOP.has(word))
    .map((word) => (word.length > 4 && /[^s]s$/.test(word) ? word.slice(0, -1) : word))
  return [...new Set(words)]
}

function hits(text, words) {
  return words.filter((word) => new RegExp(`\\b${word}`).test(text))
}

/** The `\todo{...}` placeholders in the checked sections, with their text. */
function todos(document) {
  const found = []
  const fileLines = new Map()
  for (const entry of document.lines) {
    const list = fileLines.get(entry.file) ?? []
    list[entry.line - 1] = entry
    fileLines.set(entry.file, list)
  }
  for (const entry of document.lines) {
    if (!entry.text.includes('\\todo')) {
      continue
    }
    const section = document.owners.get(`${entry.file}:${entry.line}`)
    if (!section || !document.checked.has(section)) {
      continue
    }
    const following = (fileLines.get(entry.file) ?? []).slice(entry.line - 1, entry.line + 5)
    const text = following.map((other) => other?.text ?? '').join('\n')
    for (const match of entry.text.matchAll(TODO_COMMAND)) {
      const open = match.index + match[0].length - 1
      const body = readBalanced(text, open)?.value ?? text.slice(open + 1)
      found.push({ section, file: entry.file, line: entry.line, body: body.replace(/\s+/g, ' ') })
    }
  }
  return found
}

/**
 * WC-TODO-SOURCE: a `\todo` that asks for a number the manuscript's tables, captions or other
 * sections, or a project data file, may already hold.
 */
export function todoSourceRule(document, units, report) {
  for (const todo of todos(document)) {
    if (!NUMBER_TODO.test(todo.body)) {
      continue
    }
    const words = keywords(todo.body, document.macros)
    if (!words.length) {
      continue
    }
    const needed = Math.min(2, words.length)
    const matches = units
      .filter((unit) => !covers(unit, todo.file, todo.line))
      .map((unit) => ({ unit, found: hits(unit.text, words) }))
      .filter((entry) => entry.found.length >= needed)
      .sort(
        (a, b) =>
          b.found.length - a.found.length || KIND_ORDER[a.unit.kind] - KIND_ORDER[b.unit.kind]
      )
      .slice(0, 3)
    if (!matches.length) {
      continue
    }
    const where = matches.map(({ unit, found }) => {
      const hitLine = unit.lines
        ? unit.lines.findIndex((line) => found.some((word) => line.includes(word))) + 1
        : 0
      return `${describeSource(unit, hitLine)}, on ${found.slice(0, 4).join(', ')}`
    })
    report(
      todo.section,
      'WC-TODO-SOURCE',
      'warning',
      { file: todo.file, line: todo.line },
      `This \\todo asks for numbers that may already be in the manuscript or the project's data: ${where.join('; ')}.`,
      'Use the number as printed there and mark its source in a comment (% source: tab:main, or the data file); suggest recording a claim in your hand-off. Keep the \\todo only if none of these holds it.',
      `\\todo{${todo.body.slice(0, 60)}`
    )
  }
}
