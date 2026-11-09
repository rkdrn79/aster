// Measuring before drawing: how big a box, a formula, a token strip, a card, a bubble or a glyph
// comes out, and a dry run of save() that lints and reports every item's bounds without writing
// the file.
import { makeBox, makeMath, makeText } from './research-figures-draw.mjs'
import { makeCard } from './research-figures-cards.mjs'
import { illustrateMethods } from './research-figures-kit-illustrate.mjs'
import { makeAttention, makeFeatures } from './research-figures-marks.mjs'
import { makeTokens } from './research-figures-glyphs.mjs'
import { makeDistribution, makeMatrix } from './research-figures-glyphs-data.mjs'
import { makeGrid } from './research-figures-shapes.mjs'
import { lossNodeSize } from './research-figures-kit-loss.mjs'
import { elementBounds } from './research-figures-geometry.mjs'
import { glyphBounds } from './research-figures-text.mjs'
import {
  hasInlineMath,
  labelLines,
  makeLines,
  needsTex,
  texLabel
} from './research-figures-type.mjs'

const MAKERS = {
  box: (spec) => makeBox(spec),
  // Why the same test as fig.text: runs, `$…$` and TeX-only characters are drawn as lines.
  text: (spec) =>
    spec.runs || hasInlineMath(spec.text) || needsTex(spec.text, spec.style)
      ? makeLines(
          spec,
          labelLines(
            spec.runs ?? [String(spec.text)],
            spec.size ?? spec.style.textSize,
            undefined,
            spec.style
          )
        ).elements
      : makeText(spec),
  math: (spec) => makeMath(spec).elements,
  tokens: (spec) => makeTokens(spec).elements,
  attention: (spec) => makeAttention(spec).elements,
  features: (spec) => makeFeatures(spec).elements,
  distribution: (spec) => makeDistribution(spec).elements,
  matrix: (spec) => makeMatrix(spec).elements,
  grid: (spec) => makeGrid(spec),
  card: (spec) => makeCard(spec).elements,
  // Why the arrow's rule: `label` is TeX unless it is words, `labelText` prints as written.
  arrowLabel: (spec) => {
    const size = spec.labelSize ?? spec.size ?? spec.style.smallSize
    const label =
      spec.labelText !== undefined
        ? [String(spec.labelText).replaceAll('$', '\\$')]
        : texLabel(spec.label ?? spec.text)
    return makeLines({ ...spec, size }, labelLines(label, size, undefined, spec.style)).elements
  }
}

/** Kit methods that draw through the kit (bubble, nn, callout), run on a core that keeps nothing. */
const DRY = ['bubble', 'nn', 'callout']

const round = (value) => Math.round(value * 10) / 10

function extent(elements) {
  const boxes = elements.map((element) =>
    element.type === 'text' ? glyphBounds(element) : elementBounds(element)
  )
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.right))
  const bottom = Math.max(...boxes.map((box) => box.bottom))
  return { x: round(x), y: round(y), width: round(right - x), height: round(bottom - y) }
}

export function measureMethods(core) {
  /** What `kind` would draw for `spec`, kept out of the scene and with its warnings unprinted. */
  const dryRun = (kind, spec) => {
    let drawn = []
    const sandbox = {
      ...core,
      add: (items) => {
        drawn = items
        return items[0]
      },
      claim: () => undefined,
      insert: (items) => {
        drawn = [...drawn, ...items]
      },
      warn: () => undefined
    }
    illustrateMethods(sandbox)[kind]({ ...spec, id: '__measure' })
    return drawn
  }
  return {
    /**
     * How big `kind` (box, text, math, loss, tokens, attention, features, distribution,
     * matrix, grid, card, bubble, nn, callout, arrowLabel) comes out for `spec`, without
     * drawing it: `{ x, y, width, height }`.
     */
    measure(kind, spec = {}) {
      const styled = core.styled({ id: '__measure', ...spec })
      if (kind === 'loss') {
        const { width, height } = lossNodeSize(styled, spec)
        return { x: 0, y: 0, width, height }
      }
      if (DRY.includes(kind)) {
        return extent(dryRun(kind, spec))
      }
      const maker = MAKERS[kind === 'label' ? 'arrowLabel' : kind]
      if (!maker) {
        throw new Error(
          `measure() knows ${['loss', ...Object.keys(MAKERS), ...DRY].join(', ')}, not ${JSON.stringify(kind)}`
        )
      }
      return extent(maker(styled))
    },
    /** Every item's bounds by id, for a dry run. */
    allBounds() {
      const ids = new Set(
        core.elements
          .filter((element) => !element.isDeleted && element.type !== 'frame')
          .map((element) => element.customData?.asterKit ?? element.id)
      )
      return Object.fromEntries(
        [...ids].map((id) => {
          const box = core.bounds(id)
          return [
            id,
            { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) }
          ]
        })
      )
    }
  }
}
