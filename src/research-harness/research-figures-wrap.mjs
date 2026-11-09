// Wrapping a label to a width: words (and `$…$` math, and `{ tex }` runs) stay whole and move
// to the next line when the line would be wider than the room. A bubble or a stage note of a
// fixed width wraps its text this way instead of running past its edge. Pure.
import { labelLines, measureLines } from './research-figures-type.mjs'

/**
 * A string's words with the space after each, `$…$` spans kept whole; a space it starts with
 * leads its first word, so a run after math keeps its gap.
 */
function stringTokens(text) {
  const lead = /^\s+/.exec(text)?.[0] ?? ''
  const tokens = [...String(text).matchAll(/(?:\$[^$]*\$|[^\s$]|\$)+\s*/g)].map((match) => match[0])
  if (lead && tokens.length) {
    tokens[0] = `${lead}${tokens[0]}`
  }
  return tokens
}

/** The label as tokens: words of its strings, its runs whole, and '\n' breaks. */
function labelTokens(label) {
  const items = Array.isArray(label) ? label : [String(label ?? '')]
  const tokens = []
  for (const item of items) {
    if (typeof item !== 'string') {
      tokens.push(item)
      continue
    }
    for (const [index, part] of item.split('\n').entries()) {
      if (index) {
        tokens.push('\n')
      }
      tokens.push(...stringTokens(part))
    }
  }
  return tokens
}

/** A line without the space at its ends. */
const trimEnds = (line) =>
  line.map((token, index) => {
    if (typeof token !== 'string') {
      return token
    }
    const start = index === 0 ? token.trimStart() : token
    return index === line.length - 1 ? start.trimEnd() : start
  })

/**
 * `label` (a string or runs) broken into lines no wider than `width` at `size`: returns the
 * label with '\n' breaks, how wide it came out, and `overflow` when one word alone is wider.
 */
export function wrapLabel(label, width, size, style) {
  const widthOf = (line) =>
    line.length
      ? measureLines(labelLines(trimEnds(line), size, undefined, style), size, style).width
      : 0
  const lines = [[]]
  for (const token of labelTokens(label)) {
    if (token === '\n') {
      lines.push([])
      continue
    }
    const line = lines.at(-1)
    if (line.length && widthOf([...line, token]) > width) {
      lines.push([token])
    } else {
      line.push(token)
    }
  }
  const widths = lines.map(widthOf)
  const wrapped = lines.flatMap((line, index) => [...(index ? ['\n'] : []), ...trimEnds(line)])
  return {
    label: wrapped.every((token) => typeof token === 'string') ? wrapped.join('') : wrapped,
    lines: lines.length,
    width: Math.max(0, ...widths),
    overflow: widths.some((value) => value > width + 0.5)
  }
}
