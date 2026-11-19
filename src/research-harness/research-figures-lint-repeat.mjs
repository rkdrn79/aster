// Say it once: each fact appears once in a figure; a second place refers to it (an arrow, the
// same colour, a symbol) instead of repeating it. Finds the same words or formula twice (TeX
// normalised), the same value twice (a tuple, a row of numbers, a size such as 77 × 4096), the
// same picture twice, legend entries that repeat a label already beside its part, and a caption
// that repeats its panel's title. Module names (Linear ×6) are types, not facts, and pass. Pure.

/** Words shorter than this (c, x, y, (a)) are symbols, not facts. */
const MIN_FACT = 4
/** A shared run of this many normalised characters inside two longer texts is a repeated sentence. */
const MIN_SHARED = 18

const TEX_WORDS = {
  Delta: 'δ',
  times: '×',
  sim: '∼',
  in: '∈',
  mid: '|',
  cdot: '·',
  epsilon: 'ε',
  circ: '°',
  hat: '',
  left: '',
  right: ''
}

/** A fact's text with TeX, spacing, case and dashes normalised: `\Delta T` and "ΔT" agree. */
export function normalFact(text) {
  return String(text)
    .replaceAll(
      /\\(?:mathbf|mathrm|boldsymbol|mathit|text|textbf|mathcal|mathbb|operatorname)\{([^}]*)\}/g,
      '$1'
    )
    .replaceAll(/\\([A-Za-z]+)/g, (all, word) => TEX_WORDS[word] ?? word)
    .replaceAll(/\\[,;!: ]/g, '')
    .replaceAll(/[−–—]/g, '-')
    .replaceAll(/[${}\s]/g, '')
    .replaceAll('^\\circ', '°')
    .replaceAll('^°', '°')
    .toLowerCase()
}

/** The values a text states: bracketed tuples, runs of three or more numbers, sizes a × b. */
export function factValues(text) {
  const plain = normalFact(text)
  const values = new Set()
  for (const match of plain.matchAll(/\[[^\]]{3,}\]/g)) {
    values.add(match[0])
  }
  for (const match of plain.matchAll(/\d+(?:×\d+)+/g)) {
    values.add(match[0])
  }
  const spaced = String(text).replaceAll(/[−–]/g, '-')
  for (const match of spaced.matchAll(/(?:-?\d+(?:\.\d+)?[\s,]+){2,}-?\d+(?:\.\d+)?/g)) {
    values.add(match[0].replaceAll(/[\s,]+/g, ' ').trim())
  }
  return [...values]
}

/** The longest run two strings share (characters). */
function sharedRun(first, second) {
  let best = 0
  const row = Array.from({ length: second.length + 1 }, () => 0)
  for (let i = 1; i <= first.length; i += 1) {
    let previous = 0
    for (let j = 1; j <= second.length; j += 1) {
      const kept = row[j]
      row[j] = first[i - 1] === second[j - 1] ? previous + 1 : 0
      best = Math.max(best, row[j])
      previous = kept
    }
  }
  return best
}

/** Items whose words carry facts: free text, math, arrow labels, cards, notes, token strips, titles. */
const FACT_KINDS = new Set([
  'text',
  'math',
  'arrow',
  'card',
  'tokens',
  'panel',
  'legend',
  'picture'
])

/**
 * The repeats in a scene's items (`designItems`): [{ code, ids, text, message }]. `repeat-text`
 * for the same words, `repeat-value` for the same value, `repeat-picture` for one picture
 * shown twice, `legend-repeats` and `caption-repeats-title`.
 */
export function repeatFindings(items) {
  const found = []
  const facts = items
    .filter((item) => FACT_KINDS.has(item.kind) && item.words.length)
    .map((item) => {
      const whole = item.kind === 'tokens' ? item.words.join(' ') : item.words.join('\n')
      return { item, whole, norm: normalFact(whole), values: factValues(whole) }
    })
  const said = new Set()
  for (const [index, first] of facts.entries()) {
    for (const second of facts.slice(index + 1)) {
      if (first.item.kind === 'legend' || second.item.kind === 'legend') {
        continue
      }
      const ids = [first.item.id, second.item.id]
      const key = ids.join('|')
      if (first.norm.length >= MIN_FACT && first.norm === second.norm) {
        found.push({
          code: 'repeat-text',
          ids,
          text: first.whole.replaceAll('\n', ' '),
          message: `"${first.whole.replaceAll('\n', ' ')}" is written twice (${ids.join(', ')}); say it once and let the other place refer to it (an arrow, the same colour, a symbol)`
        })
        said.add(key)
        continue
      }
      const shared =
        Math.min(first.norm.length, second.norm.length) >= MIN_SHARED
          ? sharedRun(first.norm, second.norm)
          : 0
      if (shared >= MIN_SHARED) {
        found.push({
          code: 'repeat-text',
          ids,
          text: `${shared} characters`,
          message: `${ids.join(' and ')} share a ${shared}-character sentence; keep it in one, and in the other a short reference`
        })
        said.add(key)
        continue
      }
      const value = first.values.find((entry) => second.values.includes(entry))
      if (value && !said.has(key)) {
        found.push({
          code: 'repeat-value',
          ids,
          text: value,
          message: `the value ${value} appears in ${ids.join(' and ')}; state it once`
        })
      }
    }
  }
  const pictures = new Map()
  for (const item of items.filter((entry) => entry.kind === 'picture')) {
    // Why every layer: a picture under a noise layer is the noised version, not the same one.
    const layers = item.elements.filter(
      (element) => element.type === 'image' && element.customData?.asterPhoto
    )
    const key = layers.map((image) => image.customData?.asterSource ?? image.fileId).join('+')
    if (key) {
      pictures.set(key, [...(pictures.get(key) ?? []), item.id])
    }
  }
  for (const [key, ids] of pictures) {
    if (ids.length > 1) {
      found.push({
        code: 'repeat-picture',
        ids,
        text: String(key).split('/').at(-1),
        message: `one picture is shown ${ids.length} times (${ids.join(', ')}); show it once and point to it, or show what changes (a noised or a predicted version)`
      })
    }
  }
  const inline = new Set(
    facts.filter((fact) => fact.item.kind !== 'legend').map((fact) => fact.norm)
  )
  for (const legend of items.filter((item) => item.kind === 'legend')) {
    const echoed = legend.words.filter((word) => {
      const norm = normalFact(word)
      return norm.length >= MIN_FACT && inline.has(norm)
    })
    if (echoed.length) {
      found.push({
        code: 'legend-repeats',
        ids: [legend.id],
        text: echoed.join(', '),
        message: `the legend repeats ${echoed.map((word) => `"${word}"`).join(', ')}, already labelled where it is drawn; drop those entries, or the labels`
      })
    }
  }
  const titles = items
    .filter((item) => item.kind === 'panel' && item.words.length)
    .map((item) => ({ item, norm: normalFact(item.words.join(' ').replace(/^\([a-z]\)\s*/i, '')) }))
  for (const fact of facts.filter((entry) => entry.item.kind === 'text')) {
    const caption = /^\(([a-z])\)\s*(.+)$/is.exec(fact.whole.trim())
    if (!caption) {
      continue
    }
    const norm = normalFact(caption[2])
    const title = titles.find((entry) => entry.norm.length >= MIN_FACT && entry.norm === norm)
    if (title) {
      found.push({
        code: 'caption-repeats-title',
        ids: [fact.item.id, title.item.id],
        text: caption[2],
        message: `the caption "${fact.whole.trim()}" repeats the title of ${title.item.id}; keep "(${caption[1]})" alone under it`
      })
    }
  }
  return found
}
