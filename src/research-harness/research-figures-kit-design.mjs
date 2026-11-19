// The kit's side of the design layer (research-figures-design): fig.focus names the paper's
// contribution, fig.colourBy the one dimension a second colour encodes, fig.design both at
// once (the design brief). Kept on the page frame, so save(), `figures check` and
// `figures critique` read the same declaration; fig.reset() clears it with the allowances.
import { warnKit } from './research-figures-cards.mjs'
import {
  designFinish,
  designFrame,
  normalizeDesign,
  pageDesign,
  unknownDesignIds
} from './research-figures-design.mjs'

export function designMethods(core) {
  const frame = () => {
    const found = designFrame(core.elements)
    if (!found) {
      throw new Error('The design brief is kept on the page frame; this scene has none')
    }
    return found
  }
  const current = () => frame().customData?.asterDesign ?? { focus: [], colourBy: null, data: [] }
  const store = (next) => {
    const page = frame()
    const design = normalizeDesign(next)
    page.customData = { ...page.customData, asterDesign: design }
    return design
  }
  const methods = {
    /**
     * The design brief: `focus` (the contribution's ids), `colourBy` ({ dimension, value: ids,
     * neutral: [values] }), `data` (ids whose colours are values: kept as drawn) and `brief`
     * (the claim in one sentence). save() paints by it; `figures critique` reports against it.
     */
    design(brief = {}) {
      return store({ ...current(), ...brief })
    },
    /** The paper's contribution: only these get the accent, 1 pt outlines, labels a step up. */
    focus(targets, options = {}) {
      return store({
        ...current(),
        focus: targets,
        ...(options.brief ? { brief: options.brief } : {})
      })
    },
    /**
     * One more colour, for one declared dimension: colourBy('stream', { text: [...], image:
     * [...] }, { neutral: ['image'] }) gives text a pale hue and leaves image neutral.
     */
    colourBy(dimension, groups = {}, options = {}) {
      return store({
        ...current(),
        colourBy: { dimension, ...groups, neutral: options.neutral, gray: options.gray }
      })
    }
  }
  // Why both spellings: agents write either; one declaration.
  return { ...methods, colorBy: methods.colourBy }
}

/** What save() runs for the design layer: the paint, and a kit warning for ids that name nothing. */
export function designSave(elements, style) {
  const design = pageDesign(designFrame(elements))
  if (!design) {
    return 0
  }
  const unknown = unknownDesignIds(elements, design)
  if (unknown.length) {
    warnKit([
      `design: ${unknown.join(', ')} name${unknown.length === 1 ? 's' : ''} nothing drawn; fig.focus and fig.colourBy take the ids the kit calls used`
    ])
  }
  return designFinish(elements, style, design)
}
