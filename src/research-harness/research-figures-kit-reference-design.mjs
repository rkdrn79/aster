// The kit reference for the design layer (research-figures-design): the focus, the one dimension a
// second colour encodes, and the design brief. Its own page: `figures kit design`.

export const DESIGN_REFERENCE = [
  {
    topic: 'design',
    name: 'focus',
    call: "fig.focus([ids], { brief: 'the claim in one sentence' })",
    does: "Names the paper's contribution (the MM-DiT block, the action tokens, the score-distillation path); save() then gives only these the accent (the style's first accent: a fill for shapes, the solid tone for arrows), an ink outline at 1 pt and labels one step up (9 pt, when they fit), and draws everything else in ink on white: every preset, world, template and role colour (model, input, a–d) becomes neutral unless fig.colourBy names it. Pictures, typeset math and data swatches keep their colours. A part of an item is named by its id (a card's highlight: 'card-h2'); a panel id tints its region instead. The same accent in two places means the same thing (the action tokens in the model and in the data). `figures check` then flags focus-weak (under 1.6× a typical module), focus-wide (over 30% of the parts), competing-emphasis, colour-meaning, design-hues, same-hue-outline, say-it-once repeats (repeat-text, repeat-value, repeat-picture, legend-repeats, caption-repeats-title) and craft (box-styles, text-sizes, peer-size, photo-sizes, stacked-tokens, dashed-box, orphan-caption). fig.reset() clears it."
  },
  {
    topic: 'design',
    name: 'colourBy',
    call: 'fig.colourBy(dimension, { value: [ids], … }, { neutral: [values], gray: [values] })',
    does: "The one other colour, for one declared dimension (stream, modality, trainable, stage …): each value not listed neutral takes a pale hue (a world's given-data hue first, else the one farthest from the accent), at most two; neutral values stay plain white, gray values (and 'frozen', by default) a light gray. A panel id tints its region (a pale tint without an outline). Never colour by component type: two parts of one kind share their look. fig.colorBy is the same."
  },
  {
    topic: 'design',
    name: 'colorBy',
    call: 'fig.colorBy(dimension, groups, options)',
    does: 'fig.colourBy.'
  },
  {
    topic: 'design',
    name: 'design',
    call: 'fig.design({ focus: [ids], colourBy: { dimension, value: [ids], neutral: [values] }, data: [ids], brief })',
    does: 'The design brief in one call: focus and colourBy as above, data: ids whose colours are values (a colour field, a predicted pixel; kept as drawn), brief: the claim. `figures critique` reports against it: the focus and whether it leads, each hue with its meaning, what is said twice, unequal peers and gaps, box styles and text sizes, and the cuts to make before polishing.'
  }
]
