import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { HarnessError } from './research-harness-error.mjs'

const numberPattern = /(?<![\p{L}\p{N}_.\\])(\d+(?:\.\d+)?|\.\d+)(?![\p{L}\p{N}_]|\.\d)(\s*\\%)?/gu
const formatPattern = /^(fixed|percent):(\d{1,2})$/u
const layoutUnitAfter = /^\s*\\(?:line|text|column|paper)?(?:width|height)|^\s*\\baselineskip/u
const referenceWordBefore =
  /(?:section|sec\.|table|tab\.|figure|fig\.|eq\.|equation|appendix|app\.|algorithm|alg\.|line|version|python|pytorch|torch|cuda|cudnn|tensorflow|jax|numpy|transformers|ubuntu|gcc|node)\s*~?\s*$/iu
const displayMathEnvironments =
  /\\(begin|end)\{(?:equation|align|gather|multline|eqnarray|displaymath|flalign|alignat)\*?\}|(?<!\\)\\(\[|\])/gu
const tableEnvironments = /\\(begin|end)\{(?:table|tabular|tabularx|tabulary|longtable)\*?\}/gu
// Why: arguments of these macros are layout, references, or definitions — never stated results.
const macroArgumentsToBlank = new Map([
  ['cite', Infinity],
  ['ref', Infinity],
  ['label', Infinity],
  ['url', Infinity],
  ['input', Infinity],
  ['include', Infinity],
  ['includegraphics', Infinity],
  ['bibliography', Infinity],
  ['addbibresource', Infinity],
  ['vspace', Infinity],
  ['hspace', Infinity],
  ['setlength', Infinity],
  ['addtolength', Infinity],
  ['usepackage', Infinity],
  ['documentclass', Infinity],
  ['definecolor', Infinity],
  ['newcommand', Infinity],
  ['renewcommand', Infinity],
  ['setcounter', Infinity],
  ['addlinespace', Infinity],
  ['rule', Infinity],
  ['href', 1],
  ['color', 1],
  ['textcolor', 1],
  ['colorbox', 1],
  ['cellcolor', 1],
  ['rowcolor', 1],
  ['scalebox', 1],
  ['resizebox', 2]
])
const macroInvocation = /\\([a-zA-Z]+)\*?/gu

export function checkedFormat(format) {
  if (format === undefined || format === null) {
    return null
  }
  if (!formatPattern.test(format)) {
    throw new HarnessError('invalid_argument', 'Format must be fixed:<digits> or percent:<digits>')
  }
  return format
}

export function formatEvidenceValue(value, format) {
  const match = format ? formatPattern.exec(format) : null
  if (!match || typeof value !== 'number') {
    return null
  }
  const scaled = match[1] === 'percent' ? value * 100 : value
  return scaled.toFixed(Number(match[2]))
}

export function stripTexComment(line) {
  const index = line.search(/(?<!\\)%/u)
  return index === -1 ? line : line.slice(0, index)
}

export function numberTokens(line) {
  const tokens = []
  for (const match of line.matchAll(numberPattern)) {
    const digits = match[1]
    tokens.push({
      text: match[0].trim(),
      digits,
      value: Number(digits),
      decimals: digits.includes('.') ? digits.length - digits.indexOf('.') - 1 : 0,
      percent: Boolean(match[2]),
      column: match.index + 1,
      end: match.index + match[0].length
    })
  }
  return tokens
}

/**
 * Whether a manuscript number states `value`: as written (rounded to the token's decimals) or as
 * a percentage. Bare integers match only integral values so section numbers never match.
 */
export function tokenMatchesValue(token, value, { format = null, tolerance = null } = {}) {
  const target = Math.abs(value)
  const formatMatch = format ? formatPattern.exec(format) : null
  const scales = formatMatch ? [formatMatch[1] === 'percent' ? 100 : 1] : [1, 100]
  for (const scale of scales) {
    const scaled = target * scale
    if (formatMatch && token.digits === scaled.toFixed(Number(formatMatch[2]))) {
      return true
    }
    if (tolerance !== null && Math.abs(token.value - scaled) <= tolerance * scale + 1e-12) {
      return true
    }
    if (formatMatch && token.decimals !== Number(formatMatch[2])) {
      continue
    }
    if (token.decimals === 0 && !token.percent && !Number.isInteger(scaled)) {
      continue
    }
    if (Math.abs(token.value - scaled) <= 0.5 * 10 ** -token.decimals + 1e-9) {
      return true
    }
  }
  return false
}

/** Resolves a project-relative manuscript path and refuses anything outside the project. */
export async function projectFile(project, relativePath) {
  const candidate = path.resolve(project, relativePath)
  const relative = path.relative(project, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new HarnessError('invalid_argument', `Path must stay inside the project: ${relativePath}`)
  }
  const actual = await realpath(candidate)
  const actualRelative = path.relative(project, actual)
  if (actualRelative.startsWith('..') || path.isAbsolute(actualRelative)) {
    throw new HarnessError('invalid_argument', `Path resolves outside the project: ${relativePath}`)
  }
  const details = await lstat(actual)
  if (!details.isFile() || details.size > 10 * 1024 * 1024) {
    throw new HarnessError(
      'invalid_argument',
      `Not a manuscript file of at most 10 MiB: ${relativePath}`
    )
  }
  return actual
}

export function projectRelative(project, absolute) {
  return path.relative(project, absolute).split(path.sep).join('/')
}

export async function readTexLines(file) {
  return (await readFile(file, 'utf8')).split(/\r?\n/u).map(stripTexComment)
}

function macroArgumentLimit(name) {
  const family = name.startsWith('cite')
    ? 'cite'
    : /^(?:[cC]ref|eqref|autoref|pageref)$/u.test(name)
      ? 'ref'
      : name.startsWith('bibliography')
        ? 'bibliography'
        : name
  return macroArgumentsToBlank.get(family) ?? 0
}

function blankMacroArguments(line) {
  let result = line
  for (const match of line.matchAll(macroInvocation)) {
    const limit = macroArgumentLimit(match[1])
    if (!limit) {
      continue
    }
    let cursor = match.index + match[0].length
    let groups = 0
    for (;;) {
      const rest = result.slice(cursor)
      const option = /^\s*\[[^\]]*\]/u.exec(rest)
      const brace = groups < limit ? /^\s*\{[^{}]*\}/u.exec(rest) : null
      const next = option ?? brace
      if (!next) {
        break
      }
      groups += option ? 0 : 1
      cursor += next[0].length
    }
    const start = match.index
    result = result.slice(0, start) + ' '.repeat(cursor - start) + result.slice(cursor)
  }
  return result
}

function environmentMarks(line, pattern) {
  let change = 0
  let opened = false
  for (const match of line.matchAll(pattern)) {
    const begins = match[1] === 'begin' || match[2] === '['
    opened ||= begins
    change += begins ? 1 : -1
  }
  return { change, opened }
}

/**
 * Decimals and percentages in running text and tables that read like results. Integers, display
 * math, layout lengths, references, and version numbers are skipped on purpose.
 */
export function resultNumberCandidates(lines) {
  const candidates = []
  const documentStart = lines.findIndex((line) => line.includes('\\begin{document}'))
  let mathDepth = 0
  let tableDepth = 0
  for (let index = Math.max(documentStart, 0); index < lines.length; index += 1) {
    const raw = lines[index]
    if (raw.includes('\\end{document}')) {
      break
    }
    const math = environmentMarks(raw, displayMathEnvironments)
    const table = environmentMarks(raw, tableEnvironments)
    const inMath = mathDepth > 0 || math.opened
    mathDepth = Math.max(0, mathDepth + math.change)
    const inTable = tableDepth > 0 || table.opened
    tableDepth = Math.max(0, tableDepth + table.change)
    if (inMath || index === documentStart) {
      continue
    }
    const line = blankMacroArguments(raw)
    for (const token of numberTokens(line)) {
      if (token.decimals === 0 && !token.percent) {
        continue
      }
      if (layoutUnitAfter.test(line.slice(token.end))) {
        continue
      }
      if (referenceWordBefore.test(line.slice(0, token.column - 1))) {
        continue
      }
      candidates.push({
        line: index + 1,
        column: token.column,
        text: token.text,
        token,
        where: inTable ? 'table' : 'text',
        context: raw.trim().slice(0, 160)
      })
    }
  }
  return candidates
}

/** Main file plus `\input`/`\include` files inside the manuscript directory, depth-limited. */
export async function manuscriptSourceFiles(project, mainFile) {
  const directory = path.dirname(mainFile)
  const ordered = []
  const seen = new Set()
  async function visit(file, depth) {
    if (seen.has(file) || depth > 4 || ordered.length >= 50) {
      return
    }
    seen.add(file)
    ordered.push(file)
    for (const line of await readTexLines(file)) {
      for (const match of line.matchAll(/\\(?:input|include)\{([^{}]+)\}/gu)) {
        const name = match[1].trim()
        const candidate = path.resolve(directory, path.extname(name) ? name : `${name}.tex`)
        const relative = path.relative(directory, candidate)
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          continue
        }
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
  return ordered
}
