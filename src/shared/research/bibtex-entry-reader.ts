/** One `@type{key, field = value, ...}` entry; field names are lower-case. */
export type BibtexEntry = { type: string; key: string; fields: Record<string, string> }

export type BibtexReadResult = {
  entries: BibtexEntry[]
  /** Entries skipped because their syntax could not be read. */
  malformed: number
  /** `maxEntries` was reached before the end of the text. */
  truncated: boolean
}

const NAME = /[^\s=,{}()"#@%]+/y
const CLOSING: Record<string, string> = { '{': '}', '(': ')', '"': '"' }
const SKIPPED_TYPES = new Set(['comment', 'preamble'])

class BibtexSyntaxError extends Error {}

/** A cursor over the text; every read either advances or throws. */
class BibtexCursor {
  index = 0
  constructor(readonly text: string) {}

  skipSpace(): void {
    while (this.index < this.text.length) {
      const char = this.text[this.index]
      if (char === '%') {
        const end = this.text.indexOf('\n', this.index)
        this.index = end === -1 ? this.text.length : end + 1
      } else if (/\s/.test(char)) {
        this.index += 1
      } else {
        return
      }
    }
  }

  peek(): string | undefined {
    this.skipSpace()
    return this.text[this.index]
  }

  expect(char: string): void {
    if (this.peek() !== char) {
      throw new BibtexSyntaxError(`Expected ${char}`)
    }
    this.index += 1
  }

  name(): string {
    this.skipSpace()
    NAME.lastIndex = this.index
    const match = NAME.exec(this.text)
    if (!match) {
      throw new BibtexSyntaxError('Expected a name')
    }
    this.index = NAME.lastIndex
    return match[0]
  }

  /** The text up to the delimiter that balances the brace, parenthesis or quote at the cursor. */
  delimited(): string {
    const close = CLOSING[this.text[this.index] ?? '']
    if (!close) {
      throw new BibtexSyntaxError('Expected a value')
    }
    const start = this.index + 1
    let depth = 0
    for (let index = start; index < this.text.length; index += 1) {
      const char = this.text[index]
      if (char === '\\') {
        index += 1
      } else if (char === '{') {
        depth += 1
      } else if (char === '}' && depth > 0) {
        depth -= 1
      } else if (depth === 0 && char === close) {
        this.index = index + 1
        return this.text.slice(start, index)
      }
    }
    throw new BibtexSyntaxError('Unclosed value')
  }

  /** `part # part # ...`, with `@string` names expanded and bare numbers kept. */
  value(strings: ReadonlyMap<string, string>): string {
    let result = ''
    for (;;) {
      const next = this.peek()
      if (next === '{' || next === '"') {
        result += this.delimited()
      } else {
        const word = this.name()
        result += strings.get(word.toLowerCase()) ?? word
      }
      if (this.peek() !== '#') {
        return result
      }
      this.index += 1
    }
  }
}

// Why: braces only protect capitalization and `\&`-style escapes only quote; readers want the text.
function plainText(value: string): string {
  return value
    .replace(/\\([&%$#_{}])/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function readEntry(
  cursor: BibtexCursor,
  type: string,
  strings: Map<string, string>
): BibtexEntry | null {
  const close = cursor.peek() === '(' ? ')' : '}'
  cursor.expect(close === ')' ? '(' : '{')
  if (type === 'string') {
    const name = cursor.name().toLowerCase()
    cursor.expect('=')
    strings.set(name, cursor.value(strings))
    cursor.expect(close)
    return null
  }
  const key = cursor.peek() === ',' ? '' : cursor.name()
  const fields: Record<string, string> = {}
  for (;;) {
    const next = cursor.peek()
    if (next === close) {
      cursor.index += 1
      return key ? { type, key, fields } : null
    }
    cursor.expect(',')
    if (cursor.peek() === close) {
      continue
    }
    const field = cursor.name().toLowerCase()
    cursor.expect('=')
    fields[field] = plainText(cursor.value(strings))
  }
}

/** A tolerant reader: an entry it cannot parse is counted and skipped, never fatal. */
export function readBibtexEntries(text: string, maxEntries: number): BibtexReadResult {
  const cursor = new BibtexCursor(text)
  const strings = new Map<string, string>()
  const entries: BibtexEntry[] = []
  let malformed = 0
  for (;;) {
    const at = text.indexOf('@', cursor.index)
    if (at === -1) {
      return { entries, malformed, truncated: false }
    }
    if (entries.length >= maxEntries) {
      return { entries, malformed, truncated: true }
    }
    cursor.index = at + 1
    try {
      const type = cursor.name().toLowerCase()
      if (SKIPPED_TYPES.has(type)) {
        const open = cursor.peek()
        if (open === '{' || open === '(') {
          cursor.delimited()
        }
        continue
      }
      const entry = readEntry(cursor, type, strings)
      if (entry) {
        entries.push(entry)
      }
    } catch (error) {
      if (!(error instanceof BibtexSyntaxError)) {
        throw error
      }
      // Why from at + 1: the next entry starts at the next `@`, wherever this one broke.
      malformed += 1
      cursor.index = at + 1
    }
  }
}
