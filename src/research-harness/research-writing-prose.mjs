import { ABBREVIATIONS } from './research-writing-lexicon.mjs'

/**
 * Turns one LaTeX paragraph into checkable prose: citations become [CIT], references [REF:label],
 * inline math [Mn], display math [EQn] and code [TT], while every replacement keeps the line
 * breaks it removed, so a sentence still knows the source line it starts on.
 */

const DISPLAY_MATH =
  /\\begin\{(equation|align|gather|multline|eqnarray|displaymath|flalign|alignat)\*?\}[\s\S]*?\\end\{\1\*?\}|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$/g
const CITE =
  /\\(?:[a-zA-Z]*cite[a-zA-Z]*|citep|citet|citealp|citeauthor|citeyear)\*?\s*(?:\[[^\]]*\]\s*)*\{([^}]*)\}/g
const REF =
  /\\(cref|Cref|autoref|ref|eqref|figref|tabref|subref|vref|nameref|Autoref|Figref|Tabref)\*?\{([^}]*)\}/g
const KEPT_ARGUMENT = [
  'emph',
  'textbf',
  'textit',
  'textsc',
  'textup',
  'textsl',
  'mbox',
  'text',
  'underline',
  'textrm',
  'textsf',
  'hl',
  'mathrm',
  'textnormal'
]
const SPACING =
  /\\(?:vspace|hspace|vskip|hskip|noindent|centering|small|footnotesize|scriptsize|medskip|smallskip|bigskip|newline|linebreak|par|xspace|looseness|setlength)\*?(?:\{[^}]*\})?/g
const NAME_MACROS = new Set(['method', 'sysname', 'ours', 'model', 'name', 'methodname'])
const SENTENCE_BREAK = /(?<=[.!?])["')\]]?\s+(?=[A-Z0-9"([—])/g

function newlines(text) {
  let count = 0
  for (const char of text) {
    if (char === '\n') {
      count += 1
    }
  }
  return count
}

/** Replaces matches while keeping the line breaks they held; `make` gets (match, groups, line). */
function keepLines(text, pattern, make) {
  return text.replace(pattern, (...args) => {
    const match = args[0]
    const offset = args.find((value, index) => index > 0 && typeof value === 'number')
    const line = newlines(text.slice(0, offset))
    return `${make(match, args.slice(1), line)}${'\n'.repeat(newlines(match))}`
  })
}

/** Removes `\command{...}` with balanced braces (one level of nesting), keeping line breaks. */
function dropBalanced(text, command) {
  const pattern = new RegExp(
    `\\\\${command}\\*?(?:\\[[^\\]]*\\])?\\{((?:[^{}]|\\{[^{}]*\\})*)\\}`,
    'g'
  )
  return keepLines(text, pattern, () => ' ')
}

function keepArgument(text, command) {
  const pattern = new RegExp(`\\\\${command}\\*?\\{((?:[^{}]|\\{[^{}]*\\})*)\\}`, 'g')
  return text.replace(pattern, (_match, inner) => inner)
}

function numericMath(math) {
  const compact = math.replace(/\\[,;! ]|~|\s/g, '')
  if (
    !/^[<>≈~]?[-+]?\d[\d.,]*(?:\\times|\\%|%|x|\\pm[\d.]+|\\cdot10\^\{?-?\d+\}?)?$/.test(compact)
  ) {
    return null
  }
  return compact
    .replace('\\times', '×')
    .replace('\\%', '%')
    .replace('\\pm', '±')
    .replace(/\\cdot10\^\{?(-?\d+)\}?/, 'e$1')
}

export function wordCount(sentence) {
  const plain = sentence.replace(/\[(?:CIT|REF:[^\]]*|M\d+|EQ\d+|TT)\]/g, ' X ')
  return (plain.match(/[A-Za-z][A-Za-z'-]*|\d+(?:\.\d+)?%?/g) ?? []).length
}

/** Normalised text of a paragraph plus what was pulled out of it, each tagged with a line index. */
export function normalizeParagraph(rawText, macros = new Map()) {
  const displays = []
  const maths = []
  const cites = []
  const refs = []
  let tts = 0
  let text = keepLines(rawText, DISPLAY_MATH, (match) => {
    displays.push(match)
    return ` [EQ${displays.length - 1}] `
  })
  text = keepLines(text, CITE, (_match, groups, line) => {
    const keys = groups[0]
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean)
    cites.push({ keys, line })
    return ' [CIT] '
  })
  text = keepLines(text, REF, (_match, groups, line) => {
    const labels = groups[1]
      .split(',')
      .map((label) => label.trim())
      .filter(Boolean)
    refs.push({ command: groups[0], labels, line })
    return `[REF:${labels[0] ?? ''}]`
  })
  text = keepLines(text, /\\label\{[^}]*\}/g, () => ' ')
  text = keepLines(text, /\\(?:url|href)\{[^}]*\}(?:\{[^}]*\})?/g, () => ' URL ')
  text = keepLines(text, /\\(?:texttt|lstinline|code|verb\*?)(?:\{[^}]*\}|(.)[^\n]*?\1)/g, () => {
    tts += 1
    return '[TT]'
  })
  text = keepLines(text, /(?<!\\)\$([^$]+)\$|\\\(([\s\S]*?)\\\)/g, (_match, groups) => {
    const math = groups[0] ?? groups[1] ?? ''
    // Why: "$1.56\times$" and "$2\%$" are numbers in the sentence, not notation.
    const number = numericMath(math)
    if (number) {
      return number
    }
    maths.push(math)
    return `[M${maths.length - 1}]`
  })
  text = dropBalanced(text, 'footnote')
  text = text.replace(/\\(?:textcolor|colorbox)\{[^}]*\}/g, '')
  for (const command of KEPT_ARGUMENT) {
    text = keepArgument(text, command)
  }
  text = text.replace(/\{?\\([a-zA-Z]+)\b\}?(?:\{\})?/g, (match, name) =>
    macros.has(name) ? macros.get(name) : match
  )
  text = text
    .replaceAll('---', ' — ')
    .replaceAll('--', '–')
    .replaceAll('~', ' ')
    .replaceAll('``', '"')
    .replaceAll("''", '"')
    .replace(SPACING, ' ')
    .replace(/\\([a-zA-Z]+)\*?(?:\{\})?/g, (_match, name) => (NAME_MACROS.has(name) ? name : ''))
    .replace(/\\[%&#_$]/g, (match) => match.slice(1))
    .replace(/[{}\\]/g, ' ')
    .replace(/[ \t]+/g, ' ')
  return { text, displays, maths, cites, refs, tts }
}

function protect(text) {
  return text
    .replace(ABBREVIATIONS, (match) => match.replaceAll('.', '\u0001'))
    .replace(/(\d)\.(\d)/g, '$1\u0001$2')
}

/** Sentences with their start offset; fragments with fewer than three words are dropped. */
export function splitSentences(text) {
  const protectedText = protect(text)
  const sentences = []
  let start = 0
  const push = (end) => {
    const slice = protectedText.slice(start, end)
    const leading = slice.length - slice.trimStart().length
    const value = slice.trim().replaceAll('\u0001', '.')
    if ((value.match(/[A-Za-z]+/g) ?? []).length >= 3) {
      sentences.push({ text: value.replace(/\s+/g, ' '), offset: start + leading })
    }
  }
  for (const match of protectedText.matchAll(SENTENCE_BREAK)) {
    push(match.index + match[0].trimEnd().length)
    start = match.index + match[0].length
  }
  push(protectedText.length)
  return sentences
}

/**
 * One paragraph ready for the rules: sentences with file and line, cites and refs with file and
 * line, maths, and the word count. Returns null when no sentence has three words.
 */
export function proseParagraph(paragraph, macros) {
  const raw = paragraph.lines.map((line) => line.text).join('\n')
  const normalized = normalizeParagraph(raw, macros)
  const at = (lineIndex) =>
    paragraph.lines[Math.min(Math.max(lineIndex, 0), paragraph.lines.length - 1)]
  const sentences = splitSentences(normalized.text).map((sentence, index) => {
    const source = at(newlines(normalized.text.slice(0, sentence.offset)))
    return {
      index,
      text: sentence.text,
      low: sentence.text.toLowerCase(),
      words: wordCount(sentence.text),
      file: source.file,
      line: source.line
    }
  })
  const words = sentences.reduce((sum, sentence) => sum + sentence.words, 0)
  if (!sentences.length) {
    return null
  }
  const located = (item) => ({ ...item, file: at(item.line).file, line: at(item.line).line })
  return {
    file: paragraph.lines[0].file,
    line: paragraph.lines[0].line,
    endLine: paragraph.lines.at(-1).line,
    // Why: lead-ins such as "Our contributions are:" are checked for phrasing, not for shape.
    short: words < 12,
    item: paragraph.item,
    heading: paragraph.heading,
    raw: paragraph.lines,
    text: normalized.text,
    sentences,
    words,
    maths: normalized.maths,
    displays: normalized.displays,
    cites: normalized.cites.map(located),
    refs: normalized.refs.map(located),
    tts: normalized.tts
  }
}
