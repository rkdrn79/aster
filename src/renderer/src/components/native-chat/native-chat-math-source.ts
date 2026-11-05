// Agents write TeX between `$…$`, `$$…$$`, `\(…\)` and `\[…\]`. remark-math reads only the dollar
// forms, and CommonMark's escapes turn `\(` and `\[` into plain brackets before any plugin runs, so
// a reply's source is rewritten for remark-math before it is parsed. Code is copied as written.

/** Blockquote markers and indentation, then a list marker: how a line opens inside its container. */
const LINE_PREFIX = /^((?:[ \t]*>)*[ \t]*)((?:[-+*]|\d{1,9}[.)])[ \t]+)?/
const QUOTE_INDENT = /^(?:[ \t]*>)*[ \t]*/
// CommonMark fences: a backtick opener's info string has no backtick; a closer has no info string.
const FENCE_OPEN = /^(`{3,}(?=[^`]*$)|~{3,})/
const FENCE_CLOSE = /^(`{3,}|~{3,})[ \t]*$/
/** What the scan stops at; everything between is copied as is. */
const SCAN_STOP = /[\n`\\$]/g
const ASCII_PUNCTUATION = /^[!-/:-@[-`{-~]$/
const WHITESPACE = /^\s$/
const DIGIT = /^\d$/
/** Words GFM links by themselves, where a `$` is part of the address. */
const BARE_URL = /:\/\/|^www\./i

function lineEndAt(source: string, index: number): number {
  const end = source.indexOf('\n', index)
  return end === -1 ? source.length : end
}

function runEndAt(source: string, index: number, char: string): number {
  let end = index
  while (source.charAt(end) === char) {
    end += 1
  }
  return end
}

/** Where the first run of exactly `size` `char`s starts in `[from, limit)`, or -1. */
function findRun(source: string, from: number, char: string, size: number, limit: number): number {
  let at = source.indexOf(char, from)
  while (at !== -1 && at < limit) {
    const end = runEndAt(source, at, char)
    if (end - at === size) {
      return at
    }
    at = source.indexOf(char, end)
  }
  return -1
}

/** Whether an odd run of backslashes escapes the character at `index`. */
function isEscaped(source: string, index: number): boolean {
  let start = index
  while (source.charAt(start - 1) === '\\') {
    start -= 1
  }
  return (index - start) % 2 === 1
}

function linePrefixLength(text: string): number {
  return LINE_PREFIX.exec(text)?.[0].length ?? 0
}

/** The prefix a line added inside the same container needs: its quote markers, and the list
 *  marker's width as indentation, so the line stays in the list item. */
function continuationPrefix(lineHead: string): string {
  const match = LINE_PREFIX.exec(lineHead)
  return `${match?.[1] ?? ''}${' '.repeat(match?.[2]?.length ?? 0)}`
}

function isQuoteIndent(text: string): boolean {
  return (QUOTE_INDENT.exec(text)?.[0].length ?? 0) === text.length
}

class MathSourceRewrite {
  private readonly source: string
  private readonly holdPending: boolean
  private out = ''
  private index = 0
  /** The opening marker run of the code fence the scan is in. */
  private fence: string | null = null
  /** Where the paragraph being scanned ends; inline math and code spans close before it. */
  private paragraphEnd = -1
  /** Pending display math cut the rest of the reply off. */
  private held = false

  constructor(source: string, holdPending: boolean) {
    this.source = source
    this.holdPending = holdPending
  }

  run(): string {
    const { source } = this
    while (this.index < source.length && !this.held) {
      if ((this.index === 0 || source[this.index - 1] === '\n') && this.copyFenceLine()) {
        continue
      }
      SCAN_STOP.lastIndex = this.index
      const stop = SCAN_STOP.exec(source)?.index ?? source.length
      if (stop > this.index) {
        this.copyTo(stop)
        continue
      }
      const char = source[stop]
      if (char === '`') {
        this.codeSpan()
      } else if (char === '\\') {
        this.backslash()
      } else if (char === '$') {
        this.dollars()
      } else {
        this.copyTo(stop + 1)
      }
    }
    return this.out
  }

  private copyTo(end: number): void {
    this.out += this.source.slice(this.index, end)
    this.index = end
  }

  /** Copies a fence line, or a line inside a fence, as written. */
  private copyFenceLine(): boolean {
    const lineEnd = lineEndAt(this.source, this.index)
    const line = this.source.slice(this.index, lineEnd)
    if (this.fence === null) {
      const opener = FENCE_OPEN.exec(line.slice(linePrefixLength(line)))
      if (!opener) {
        return false
      }
      this.fence = opener[1]
    } else {
      const closer = FENCE_CLOSE.exec(line.slice(QUOTE_INDENT.exec(line)?.[0].length ?? 0))
      if (closer && closer[1][0] === this.fence[0] && closer[1].length >= this.fence.length) {
        this.fence = null
      }
    }
    this.copyTo(Math.min(lineEnd + 1, this.source.length))
    return true
  }

  private paragraphLimit(): number {
    if (this.index < this.paragraphEnd) {
      return this.paragraphEnd
    }
    let lineStart = lineEndAt(this.source, this.index) + 1
    while (lineStart < this.source.length) {
      const lineEnd = lineEndAt(this.source, lineStart)
      const line = this.source.slice(lineStart, lineEnd).replace(/\r$/, '')
      if (isQuoteIndent(line) || FENCE_OPEN.test(line.slice(linePrefixLength(line)))) {
        break
      }
      lineStart = lineEnd + 1
    }
    this.paragraphEnd = Math.min(lineStart, this.source.length)
    return this.paragraphEnd
  }

  /** Whether only container markers come before the scan on its line. */
  private opensLine(): boolean {
    const lineStart = this.source.lastIndexOf('\n', this.index - 1) + 1
    return linePrefixLength(this.source.slice(lineStart, this.index)) === this.index - lineStart
  }

  private codeSpan(): void {
    const runEnd = runEndAt(this.source, this.index, '`')
    const limit = this.paragraphLimit()
    const close = findRun(this.source, runEnd, '`', runEnd - this.index, limit)
    if (close !== -1) {
      this.copyTo(runEndAt(this.source, close, '`'))
    } else if (this.holdPending && limit === this.source.length) {
      // Code still being written: the stream's closer (remend) ends it, so it stays as written.
      this.copyTo(this.source.length)
    } else {
      this.copyTo(runEnd)
    }
  }

  private backslash(): void {
    const next = this.source.charAt(this.index + 1)
    if (next === '(' || next === '[') {
      this.bracketMath(next === '[')
    } else if (next === '' && this.holdPending) {
      // It may yet open `\(` or `\[`.
      this.held = true
    } else {
      // An escape stays as written, so `\$` keeps its dollar and `\\` opens nothing.
      this.copyTo(this.index + (ASCII_PUNCTUATION.test(next) ? 2 : 1))
    }
  }

  private bracketMath(display: boolean): void {
    const contentStart = this.index + 2
    const limit = this.paragraphLimit()
    const close = this.source.indexOf(display ? '\\]' : '\\)', contentStart)
    if (close === -1 || close >= limit) {
      if (display && this.holdPending && limit === this.source.length) {
        this.held = true
      } else {
        this.copyTo(contentStart)
      }
      return
    }
    const content = this.source.slice(contentStart, close)
    if (content.trim() === '') {
      this.copyTo(close + 2)
    } else if (display) {
      this.displayMath(contentStart, close, close + 2, '$$')
    } else {
      this.out += `$${content}$`
      this.index = close + 2
    }
  }

  private dollars(): void {
    const { source } = this
    const runEnd = runEndAt(source, this.index, '$')
    const size = runEnd - this.index
    if (size === 1) {
      this.dollar()
      return
    }
    // A `$$` line opens a block that runs to its closing `$$`, blank lines and all; any other
    // `$$` closes within its paragraph, as remark-math reads them.
    const block = this.opensLine() && source.slice(runEnd, lineEndAt(source, runEnd)).trim() === ''
    const limit = block ? source.length : this.paragraphLimit()
    const close = findRun(source, runEnd, '$', size, limit)
    if (close !== -1) {
      this.displayMath(runEnd, close, close + size, source.slice(this.index, runEnd))
    } else if (this.holdPending && (block || limit === source.length)) {
      this.held = true
    } else {
      this.copyTo(runEnd)
    }
  }

  /** A lone `$` is math only where remark-math pairs it and the pair reads as TeX: the opener sits
   *  against the math, as does the closer, which is not an escaped `\$` and has no digit after it.
   *  "$5 and $10" is money, so its dollars are escaped before remark-math can pair them. */
  private dollar(): void {
    const { source } = this
    const next = source.charAt(this.index + 1)
    if (next === '' && this.holdPending) {
      this.held = true
      return
    }
    const wordStart =
      Math.max(source.lastIndexOf(' ', this.index), source.lastIndexOf('\n', this.index)) + 1
    // Escaping would put a backslash in the address.
    if (BARE_URL.test(source.slice(wordStart, this.index))) {
      this.copyTo(this.index + 1)
      return
    }
    const close =
      next === '' || WHITESPACE.test(next)
        ? -1
        : findRun(source, this.index + 1, '$', 1, this.paragraphLimit())
    if (
      close !== -1 &&
      !WHITESPACE.test(source.charAt(close - 1)) &&
      !isEscaped(source, close) &&
      !DIGIT.test(source.charAt(close + 1))
    ) {
      this.copyTo(close + 1)
      return
    }
    this.out += '\\$'
    this.index += 1
  }

  /** Display math, written for remark-math. On one line it stays `$$…$$` in its paragraph, which
   *  remarkDisplayMathText sets apart. Across lines it becomes a block with `$$` lines of its own:
   *  remark-math drops text after an opening `$$` as an info string, and closes only on a bare `$$`. */
  private displayMath(
    contentStart: number,
    close: number,
    closeEnd: number,
    delimiter: string
  ): void {
    const { source } = this
    const content = source.slice(contentStart, close)
    if (!content.includes('\n')) {
      this.out += `${delimiter}${content}${delimiter}`
      this.index = closeEnd
      return
    }
    const lineStart = source.lastIndexOf('\n', this.index - 1) + 1
    const prefix = continuationPrefix(source.slice(lineStart, this.index))
    if (!this.opensLine()) {
      this.out = `${this.out.trimEnd()}\n${prefix}`
    }
    const firstBreak = content.indexOf('\n')
    const lastBreak = content.lastIndexOf('\n')
    const head = content.slice(0, firstBreak).trim()
    const tail = content.slice(lastBreak + 1)
    this.out += delimiter
    if (head !== '') {
      this.out += `\n${prefix}${head}`
    }
    this.out += content.slice(firstBreak, lastBreak)
    this.out += isQuoteIndent(tail)
      ? `\n${tail}${delimiter}`
      : `\n${tail.trimEnd()}\n${prefix}${delimiter}`
    const rest = source.slice(closeEnd, lineEndAt(source, closeEnd))
    this.index = closeEnd
    if (rest.trim() !== '') {
      // Text after the closing delimiter starts the next paragraph.
      this.out += `\n${prefix}`
      this.index += rest.length - rest.trimStart().length
    }
  }
}

/**
 * A reply's markdown with its math in the delimiters remark-math reads: `\(…\)` becomes `$…$`,
 * `\[…\]` becomes `$$…$$`, display math across lines gets `$$` lines of its own, and a `$` that
 * cannot open or close math is escaped. With `holdPending`, for a reply still being written, display
 * math that has not closed yet is left out, so it appears once it is whole.
 */
export function prepareNativeChatMath(source: string, holdPending = false): string {
  if (!source.includes('$') && !source.includes('\\')) {
    return source
  }
  return new MathSourceRewrite(source, holdPending).run()
}
