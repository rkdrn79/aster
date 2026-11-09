// Typography in the paper font: free text, runs of mixed sizes on one baseline, lines of runs,
// and math with Greek macros, sub/superscripts and accents the font lacks (drawn as strokes).
import { figureElement } from './research-figures-model.mjs'
import { figureStyle, textInk } from './research-figures-style.mjs'
import {
  PAPER_FONT,
  TEXT_BASELINE,
  TEXT_LINE_HEIGHT,
  measureText,
  missingGlyphs
} from './research-figures-text.mjs'
import { MATH_SYMBOLS, MATH_SUBSTITUTES } from './research-figures-symbols.mjs'

const DEFAULT_STYLE = figureStyle()
const ASCENDERS = /[A-Zbdfhklt0-9()[\]{}|/\\ßθλδ]/
const ACCENT = /^\\(hat|widehat|bar|overline|tilde|widetilde|dot|vec) ?/
const ACCENT_KIND = {
  hat: 'hat',
  widehat: 'hat',
  bar: 'bar',
  overline: 'bar',
  tilde: 'tilde',
  widetilde: 'tilde',
  dot: 'dot',
  vec: 'vec'
}

/** The style a spec draws in: the kit's current one, else the default (neutral). */
export function styleOf(spec) {
  return spec?.style ?? DEFAULT_STYLE
}

/** Text with characters the paper font lacks replaced by the closest it has. */
export function plainText(text) {
  return Array.from(String(text ?? ''), (char) => MATH_SUBSTITUTES[char] ?? char).join('')
}

/**
 * Free text. `x`/`y` is its top-left; `cx`/`cy` centres it; `baseline` puts the first line's
 * baseline there; `align` (left, center, right) says what `x` is.
 */
export function makeText(spec, random = Math.random) {
  const fontSize = spec.size ?? styleOf(spec).textSize
  const lineHeight = spec.lineHeight ?? TEXT_LINE_HEIGHT
  const text = plainText(spec.text)
  const family = spec.font ?? styleOf(spec).fontFamily ?? PAPER_FONT
  const size = measureText(text, fontSize, family)
  const height = (size.height / TEXT_LINE_HEIGHT) * lineHeight
  const align = spec.align ?? 'left'
  const x =
    spec.cx !== undefined
      ? spec.cx - size.width / 2
      : (spec.x ?? 0) - (align === 'center' ? size.width / 2 : align === 'right' ? size.width : 0)
  const y =
    spec.baseline !== undefined
      ? spec.baseline - (TEXT_BASELINE + (lineHeight - TEXT_LINE_HEIGHT) / 2) * fontSize
      : spec.cy !== undefined
        ? spec.cy - height / 2
        : (spec.y ?? 0)
  return [
    figureElement(
      'text',
      {
        id: spec.id,
        x,
        y,
        width: size.width,
        height,
        text,
        originalText: text,
        fontSize,
        lineHeight,
        textAlign: spec.textAlign ?? 'left',
        verticalAlign: 'top',
        strokeColor: textInk(styleOf(spec), spec.color),
        fontFamily: family,
        frameId: spec.frame ?? null,
        groupIds: spec.groupIds ?? []
      },
      random
    )
  ]
}

/** Greek and symbol macros to characters; font commands to their content; scripts kept. */
function expandMacros(source) {
  return plainText(
    String(source ?? '')
      .replace(
        /\\(?:mathcal|mathbb|mathrm|mathbf|mathit|mathsf|boldsymbol|bm|text|textrm|textbf|textit|operatorname)\{([^{}]*)\}/g,
        '$1'
      )
      .replace(/\\([A-Za-z]+) ?|\\([|,;! ])/g, (whole, name, mark) => {
        if (mark !== undefined) {
          return mark === '|' ? '||' : mark === '!' ? '' : ' '
        }
        if (Object.hasOwn(ACCENT_KIND, name)) {
          return whole
        }
        return MATH_SYMBOLS[name] ?? name
      })
  )
}

function readGroup(text, start) {
  let depth = 0
  for (let index = start; index < text.length; index += 1) {
    depth += text[index] === '{' ? 1 : text[index] === '}' ? -1 : 0
    if (depth === 0) {
      return [text.slice(start + 1, index), index + 1]
    }
  }
  return [text.slice(start + 1), text.length]
}

function readArgument(text, start) {
  if (text[start] === '{') {
    return readGroup(text, start)
  }
  if (start >= text.length) {
    return ['', start]
  }
  const char = String.fromCodePoint(text.codePointAt(start) ?? 32)
  return [char, start + char.length]
}

/**
 * `x_c`, `s_y^{(i)}`, `\hat{z}_1`, `E_{\bar\theta}`, `\mathcal{L}_{\text{REPA}}`: runs of base
 * text, sub/superscripts, and accented letters, with Greek macros as characters.
 */
export function parseMath(source) {
  const runs = []
  const push = (text, level, accent) => {
    const last = runs.at(-1)
    if (!text) {
      return
    }
    if (!accent && last && last.level === level && !last.accent) {
      last.text += text
    } else {
      runs.push({ text, level, ...(accent ? { accent } : {}) })
    }
  }
  const walk = (text, level) => {
    let index = 0
    while (index < text.length) {
      const accent = ACCENT.exec(text.slice(index))
      if (accent) {
        const [argument, next] = readArgument(text, index + accent[0].length)
        push(argument.replace(/[{}_^]/g, ''), level, ACCENT_KIND[accent[1]])
        index = next
        continue
      }
      const char = String.fromCodePoint(text.codePointAt(index) ?? 32)
      if ((char === '_' || char === '^') && level === 'base') {
        const [argument, next] = readArgument(text, index + 1)
        walk(argument, char === '_' ? 'sub' : 'sup')
        index = next
      } else {
        // Why: scripts of scripts print at the script's own level, and braces only group.
        push('{}_^'.includes(char) ? '' : char, level)
        index += char.length
      }
    }
  }
  walk(expandMacros(source), 'base')
  return runs
}

/** An unbraced `^(` or `_(` takes only the parenthesis; usually `^{(i)}` was meant. */
export function unbracedScript(tex) {
  return /[_^]\(/.test(String(tex ?? ''))
}

function accentStroke(spec, run, x, width, baseline, size, random) {
  const top = baseline + (run.shift ?? 0) - (ASCENDERS.test(run.text) ? 0.78 : 0.6) * size
  const mid = x + width / 2
  const half = Math.min(width * 0.38, size * 0.24)
  const shapes = {
    hat: [
      [mid - half, top],
      [mid, top - size * 0.16],
      [mid + half, top]
    ],
    bar: [
      [mid - half * 1.2, top - size * 0.06],
      [mid + half * 1.2, top - size * 0.06]
    ],
    tilde: [
      [mid - half, top - size * 0.02],
      [mid - half / 3, top - size * 0.12],
      [mid + half / 3, top - size * 0.02],
      [mid + half, top - size * 0.12]
    ],
    dot: [
      [mid - 0.6, top - size * 0.07],
      [mid + 0.6, top - size * 0.07]
    ],
    vec: [
      [mid - half, top - size * 0.08],
      [mid + half, top - size * 0.08],
      [mid + half - size * 0.1, top - size * 0.14]
    ]
  }[run.accent]
  const [x0, y0] = shapes[0]
  const points = shapes.map(([px, py]) => [px - x0, py - y0])
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  return figureElement(
    'line',
    {
      id: `${spec.id}-${run.index}-accent`,
      x: x0,
      y: y0,
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      points,
      strokeColor: textInk(styleOf(spec), run.color ?? spec.color),
      strokeWidth: run.accent === 'dot' ? 2 : Math.max(1, Math.round((size / 13) * 10) / 10),
      endArrowhead: null,
      frameId: spec.frame ?? null,
      groupIds: [spec.group ?? `${spec.id}-group`]
    },
    random
  )
}

/** A TeX run as an SVG image on the baseline; its file comes from the kit's TeX renderer. */
function texImage(spec, run, x, baseline, random) {
  const style = styleOf(spec)
  const box = style.renderTex(run.tex, run.size, textInk(style, run.color ?? spec.color))
  return figureElement(
    'image',
    {
      id: `${spec.id}-${run.index}`,
      x: x + box.x,
      y: baseline - box.ascent,
      width: box.width,
      height: box.ascent + box.descent,
      fileId: box.fileId,
      status: 'saved',
      scale: [1, 1],
      crop: null,
      strokeColor: 'transparent',
      customData: { asterMath: run.math ?? run.tex, asterTex: true },
      frameId: spec.frame ?? null,
      groupIds: [spec.group ?? `${spec.id}-group`]
    },
    random
  )
}

/** How wide a run is: TeX typeset by MathJax, otherwise measured in the paper font. */
function runWidth(run, size, style) {
  return run.tex !== undefined && style?.renderTex
    ? style.renderTex(run.tex, size).width
    : measureText(run.text, size, style?.fontFamily).width
}

/** Runs laid left to right; sub- and superscripts stack, each continuing its own level. */
function layoutRuns(runs, base, style = undefined) {
  const placed = []
  let cursor = 0
  const script = { sub: 0, sup: 0, start: null }
  let previous = ''
  for (const [index, run] of runs.entries()) {
    const size = run.size ?? base
    const width = runWidth(run, size, style)
    const level = run.level === 'sub' || run.level === 'sup' ? run.level : null
    if (level) {
      // Why: an upright capital's side bearing leaves a gap before its subscript (P φ).
      const kern = level === 'sub' && /[A-Z]$/.test(previous) ? 0.06 * base : 0
      if (script.start === null) {
        script.start = cursor - kern
        script.sub = script.start
        script.sup = cursor
      }
      const left = script[level]
      placed.push({ ...run, index, size, width, left })
      script[level] = left + width
    } else {
      if (script.start !== null) {
        cursor = Math.max(cursor, script.sub, script.sup)
      }
      Object.assign(script, { sub: 0, sup: 0, start: null })
      placed.push({ ...run, index, size, width, left: cursor })
      cursor += width
      previous = run.text
    }
  }
  const end = script.start === null ? cursor : Math.max(cursor, script.sub, script.sup)
  return { placed, width: end }
}

/**
 * Text runs on one baseline: `runs` are `{ text, size, color, shift }` (shift moves a run's
 * baseline down). `x`/`y` as for text (y is the top of the first run's line box), or
 * `baseline`, `cx`/`cy` and `align`.
 */
export function makeRuns(spec, runs, random = Math.random) {
  const style = styleOf(spec)
  const base = spec.size ?? style.textSize
  const { placed, width: total } = layoutRuns(runs, base, style)
  const align = spec.align ?? 'left'
  const x0 =
    spec.cx !== undefined
      ? spec.cx - total / 2
      : (spec.x ?? 0) - (align === 'center' ? total / 2 : align === 'right' ? total : 0)
  const baseline =
    spec.baseline ??
    (spec.cy !== undefined
      ? spec.cy + (TEXT_BASELINE - TEXT_LINE_HEIGHT / 2) * base
      : (spec.y ?? 0) + TEXT_BASELINE * base)
  const elements = []
  for (const run of placed) {
    if (run.tex !== undefined && style.renderTex) {
      elements.push(texImage(spec, run, x0 + run.left, baseline + (run.shift ?? 0), random))
      continue
    }
    const [element] = makeText(
      {
        id: `${spec.id}-${run.index}`,
        text: run.text,
        size: run.size,
        x: x0 + run.left,
        baseline: baseline + (run.shift ?? 0),
        color: run.color ?? spec.color,
        style: spec.style,
        frame: spec.frame,
        groupIds: [spec.group ?? `${spec.id}-group`]
      },
      random
    )
    if (spec.tex || run.math) {
      element.customData = { asterMath: spec.tex ?? run.math }
    }
    elements.push(element)
    if (run.accent) {
      elements.push(accentStroke(spec, run, x0 + run.left, run.width, baseline, run.size, random))
    }
  }
  return { elements, width: total, height: base * TEXT_LINE_HEIGHT, x: x0, baseline }
}

/**
 * Math as runs: TeX typeset by MathJax when the style can (the kit's), with its words in the
 * paper font (the words around `$…$`, a top-level `\text{…}`, and with `auto` a label that
 * reads as words, like "softmax"); otherwise base, sub- and superscript text runs (scripts at
 * `scriptSize`, 0.72 × size). Without `auto` the TeX is explicit and never printed as words.
 */
export function mathRuns(
  tex,
  size = 16,
  scriptSize = undefined,
  color = undefined,
  style = undefined,
  { auto = false } = {}
) {
  const tint = color ? { color } : {}
  if (style?.renderTex) {
    return mathParts(String(tex), auto).flatMap((part) =>
      typeof part === 'string'
        ? wordRuns(part, size, style).map((run) => ({ ...run, shift: 0, ...tint }))
        : [
            {
              text: part.tex,
              tex: part.tex,
              math: part.tex,
              level: 'base',
              size,
              shift: 0,
              ...tint
            }
          ]
    )
  }
  const small = scriptSize ?? Math.max(8, Math.round(size * 0.72))
  return parseMath(tex).map((run) => ({
    ...run,
    math: tex,
    size: run.level === 'base' ? size : small,
    shift: run.level === 'sub' ? 0.3 * size : run.level === 'sup' ? -0.42 * size : 0,
    ...tint
  }))
}

/**
 * Math in the paper font; returns `{ elements, width, height, x, baseline }`. The TeX is
 * explicit (always typeset); `auto: true` prints a label that reads as words in the font.
 */
export function makeMath(spec, random = Math.random) {
  const size = spec.size ?? styleOf(spec).textSize
  return makeRuns(
    { ...spec, size },
    mathRuns(spec.tex, size, spec.scriptSize, undefined, styleOf(spec), { auto: spec.auto }),
    random
  )
}

// Why lookbehinds: `\$` is a dollar sign, not the edge of math.
const INLINE_MATH = /(?<!\\)\$([^$]+?)(?<!\\)\$/g
// Why three letters (or two capitals): `x` or `sg` are symbols; `softmax`, `KL` or `score` are
// words.
const PLAIN_WORDS = /^[A-Za-z0-9('][A-Za-z0-9 ,.;:'()/%-]*$/
// A word: lowercase (softmax), Capitalized (Encoder), an acronym (KL, MLPs), CamelCase (ViT,
// LoRA, ResNet), any of them with trailing digits (GPT4), or a number (50, 0.65, 2k).
const WORD = /^(?:[a-z]+|[A-Z]{2,}s?|(?:[A-Z][a-z]+)+[A-Z]{0,3}|[a-z]+(?:[A-Z][a-z]+)+)\d*$/
const NUMBER = /^\d+(?:[.,]\d+)*[%kKMB]?$/
const TEXT_MACRO = /\\(?:text|textrm|textsf|mbox)\s*\{/y

/** Whether a string holds `$…$` math among its words ("score $r_t$"). */
export function hasInlineMath(text) {
  return typeof text === 'string' && /(?<!\\)\$[^$]+?(?<!\\)\$/.test(text)
}

/** Characters neither the paper font nor a plain substitute can print, so TeX draws them (⋮). */
function texOnly(char, family) {
  return !Object.hasOwn(MATH_SUBSTITUTES, char) && missingGlyphs(char, family).length > 0
}

/** Whether text holds a character only TeX can print in this style. */
export function needsTex(text, style = undefined) {
  return (
    Boolean(style?.renderTex) &&
    Array.from(String(text ?? '')).some((char) => texOnly(char, style.fontFamily))
  )
}

/** Words as a text run, with characters the font lacks (⋮, ⋱) as TeX runs when TeX can draw them. */
function wordRuns(text, size, style) {
  const plain = text.replaceAll('\\$', '$')
  if (!needsTex(plain, style)) {
    return plain ? [{ text: plain, size, level: 'base' }] : []
  }
  const runs = []
  for (const char of plain) {
    const last = runs.at(-1)
    if (texOnly(char, style.fontFamily)) {
      runs.push(...mathRuns(char, size, undefined, undefined, style))
    } else if (last && last.tex === undefined) {
      last.text += char
    } else {
      runs.push({ text: char, size, level: 'base' })
    }
  }
  return runs
}

/** A string of a label: words in the paper font, `$…$` typeset as TeX. */
function stringRuns(text, size, style) {
  const runs = []
  let last = 0
  for (const match of text.matchAll(INLINE_MATH)) {
    runs.push(...wordRuns(text.slice(last, match.index), size, style))
    runs.push(...mathRuns(match[1], size, undefined, undefined, style))
    last = match.index + match[0].length
  }
  runs.push(...wordRuns(text.slice(last), size, style))
  return runs
}

/**
 * Splits TeX at its top-level `\text{…}` (not a sub- or superscript's): those words print in the
 * paper font beside the math, as in "r_t \text{ reward}".
 */
function splitTextMacros(tex) {
  const items = []
  let depth = 0
  let start = 0
  let index = 0
  while (index < tex.length) {
    const char = tex[index]
    TEXT_MACRO.lastIndex = index
    const macro = depth === 0 ? TEXT_MACRO.exec(tex) : null
    const before = tex.slice(start, index).trimEnd().at(-1)
    if (macro && before !== '_' && before !== '^') {
      const [words, next] = readGroup(tex, index + macro[0].length - 1)
      if (tex.slice(start, index).trim()) {
        items.push({ tex: tex.slice(start, index) })
      }
      items.push(words)
      start = next
      index = next
      continue
    }
    depth += char === '{' ? 1 : char === '}' ? -1 : 0
    index += char === '\\' ? 2 : 1
  }
  if (tex.slice(start).trim()) {
    items.push({ tex: tex.slice(start) })
  }
  return items
}

/**
 * Whether a TeX-by-default label reads as words, so it prints in the paper font: every token
 * (brackets and trailing punctuation aside) is a word or a number, or a hyphen/slash compound
 * of them where a lone capital rides with a word (ViT-L/16); and it has three letters or is an
 * acronym. `BAx`, `Wx`, `O(TL)`, `T-L` and `sg` are math.
 */
export function readsAsWords(source) {
  const letters = source.replaceAll(/[^A-Za-z]/g, '')
  if (!PLAIN_WORDS.test(source) || !(letters.length >= 3 || /^[A-Z]{2}$/.test(letters))) {
    return false
  }
  return source
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => {
      const bare = token.replace(/^[(['"]+/, '').replace(/[)\]'".,;:!?]+$/, '')
      const pieces = bare.split(/[-/]/)
      const worded = pieces.some((piece) => WORD.test(piece) && piece.length > 1)
      return (
        bare !== '' &&
        pieces.every(
          (piece) =>
            NUMBER.test(piece) ||
            (WORD.test(piece) && (piece.length > 1 || pieces.length === 1 || worded)) ||
            (/^[A-Z]$/.test(piece) && worded)
        )
      )
    })
}

/**
 * Explicit TeX (`$…$`, `{ tex }`, fig.math, a box's `math`): typeset, words only around `$…$`
 * and in a top-level `\text{…}`; `auto` (a TeX-by-default label) also lets words print as words.
 */
function mathParts(source, auto) {
  return auto || hasInlineMath(source) ? texParts(source) : splitTextMacros(source)
}

/**
 * TeX split into what TeX sets and what reads as words: "score $r_t$" (words and math), plain
 * words ("softmax", "MLP"; TeX would set them as italic letters; see readsAsWords), and a
 * top-level `\text{…}`.
 */
export function texParts(source) {
  if (hasInlineMath(source)) {
    const parts = []
    let last = 0
    for (const match of source.matchAll(INLINE_MATH)) {
      parts.push(source.slice(last, match.index), { tex: match[1] })
      last = match.index + match[0].length
    }
    parts.push(source.slice(last))
    return parts.filter((part) => (typeof part === 'string' ? part : part.tex.trim()))
  }
  return readsAsWords(source) ? [source] : splitTextMacros(source)
}

/**
 * A label where TeX is the default (an arrow's, a glyph's): runs as given, else one TeX item
 * that prints as words when it reads as words (readsAsWords).
 */
export function texLabel(label) {
  return Array.isArray(label) ? label : [{ tex: String(label ?? ''), auto: true }]
}

/**
 * A label as lines of runs: a string (lines split at \n; `$…$` is TeX among the words), or an
 * array of strings, runs (`{ text, size, color }`), math (`{ tex }`) and '\n' breaks; `math`
 * adds a math line below.
 */
export function labelLines(label, size, math = undefined, style = undefined) {
  const lines = [[]]
  const add = (run) => lines.at(-1).push(run)
  const items = Array.isArray(label) ? label : label ? [String(label)] : []
  for (const item of items) {
    if (typeof item === 'string') {
      for (const [index, part] of item.split('\n').entries()) {
        if (index > 0) {
          lines.push([])
        }
        for (const run of stringRuns(part, size, style)) {
          add(run)
        }
      }
    } else if (item?.tex !== undefined) {
      const auto = { auto: item.auto }
      for (const run of mathRuns(
        item.tex,
        item.size ?? size,
        item.scriptSize,
        item.color,
        style,
        auto
      )) {
        add(run)
      }
    } else if (
      item?.text !== undefined &&
      (hasInlineMath(item.text) || needsTex(item.text, style))
    ) {
      // Why: `$…$` in a run (a small-text one too) is math, never its source characters.
      const tint = item.color ? { color: item.color } : {}
      for (const run of stringRuns(String(item.text), item.size ?? size, style)) {
        add({ ...run, ...tint })
      }
    } else if (item?.text !== undefined) {
      add({ size, level: 'base', ...item })
    }
  }
  if (math) {
    lines.push(mathRuns(math, size, undefined, undefined, style))
  }
  return lines.filter((line) => line.length)
}

/**
 * How wide and tall lines of runs are: each line as tall as its largest base run, or as its
 * tallest TeX (a fraction) above and below the baseline. `ascents` is where each baseline sits
 * below its line's top, so the line under a fraction starts below the fraction's denominator.
 */
export function measureLines(lines, size, style = undefined) {
  const metrics = lines.map((line) => {
    const base = Math.max(
      ...line.filter((run) => run.level === 'base').map((run) => run.size),
      size * 0.5
    )
    const tex = line
      .filter((run) => run.tex !== undefined && style?.renderTex)
      .map((run) => style.renderTex(run.tex, run.size ?? size))
    const ascent = Math.max(TEXT_BASELINE * base, ...tex.map((box) => box.ascent + 0.1 * size))
    const descent = Math.max(
      (TEXT_LINE_HEIGHT - TEXT_BASELINE) * base,
      ...tex.map((box) => box.descent + 0.1 * size)
    )
    return { base, ascent, height: ascent + descent }
  })
  const widths = lines.map((line) => layoutRuns(line, size, style).width)
  return {
    width: Math.max(0, ...widths),
    height: metrics.reduce((sum, line) => sum + line.height, 0),
    heights: metrics.map((line) => line.height),
    ascents: metrics.map((line) => line.ascent),
    sizes: metrics.map((line) => line.base)
  }
}

/**
 * Lines of runs centred on (cx, cy), or from (x, y) with `align`; `baseline` puts the first
 * line's baseline there instead of a top or a centre. One group for all.
 */
export function makeLines(spec, lines, random = Math.random) {
  const size = spec.size ?? styleOf(spec).textSize
  const { width, height, heights, ascents, sizes } = measureLines(lines, size, styleOf(spec))
  const top =
    spec.baseline !== undefined && heights.length
      ? spec.baseline - ascents[0]
      : spec.cy !== undefined
        ? spec.cy - height / 2
        : (spec.y ?? 0)
  const align = spec.cx !== undefined ? 'center' : (spec.align ?? 'left')
  const anchor = spec.cx ?? spec.x ?? 0
  const elements = []
  let lineTop = top
  for (const [index, line] of lines.entries()) {
    // Why the line's ascent: a fraction's denominator hangs below the baseline, so the next
    // line starts under it, not on it.
    const placed = makeRuns(
      {
        ...spec,
        id: lines.length === 1 ? spec.id : `${spec.id}-${index}`,
        group: spec.group ?? `${spec.id}-group`,
        size: sizes[index],
        cx: undefined,
        cy: undefined,
        x: anchor,
        align,
        baseline: lineTop + ascents[index]
      },
      line,
      random
    )
    elements.push(...placed.elements)
    lineTop += heights[index]
  }
  return { elements, width, height }
}
