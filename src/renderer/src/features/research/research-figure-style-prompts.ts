// The diagram style a Figure prompt states: who chose the preset, its colours, and the drawing
// rules that keep a figure from looking generated.
import {
  FIGURE_UNITS_PER_INCH,
  type FigurePage
} from '../../../../research-harness/research-figures-model.mjs'
import {
  FIGURE_ACCENTS,
  FIGURE_STYLES,
  figureStyle
} from '../../../../research-harness/research-figures-style.mjs'
import {
  FIGURE_COLOUR_RULE,
  FIGURE_DESIGN_RULE,
  FIGURE_DRAWN_RULE,
  FIGURE_EXAMPLES_RULE,
  FIGURE_LEGEND_RULE,
  FIGURE_PAPER_RULE,
  FIGURE_PINNED_REFERENCES_RULE,
  FIGURE_REFERENCE_RULE,
  FIGURE_REFERENCES_OFF_RULE,
  FIGURE_SMALL_PAGE_RULE
} from '../../../../research-harness/research-figures-style-rules.mjs'
import type { FigurePromptModes } from './research-figure-reference-library'

/**
 * Which preset a figure takes when nobody chose one (the skill's choice): the paper's world, as
 * the Figures guide says; graphite only for a minimal figure.
 */
const GENRE_STYLES =
  "a method, architecture, pipeline or system figure takes the paper's world palette (vision, generative, language, robotics, training or systems; `figures kit colors`) in the paper look, the default; the palette only supplies the hues: declare the focus and at most one dimension (`figures kit design`) and save() draws the rest in ink on white; only a conceptual teaser drawn as an illustration takes the 'illustrative' look; graphite or 'outline' for a minimal figure or a grid of qualitative examples"

/**
 * Who chose the style decides what the agent may do with it: keep the person's choice, and pick
 * by genre over Aster's default (or its own earlier pick).
 */
function styleChoiceLine(page: FigurePage | null): string {
  const style = figureStyle(page?.style, page?.accent)
  const named = `"${style.name}" (${FIGURE_STYLES[style.name].label}), accent ${style.accentName}`
  const chooser = page?.styleBy ?? null
  if (chooser === 'person') {
    return `Style: ${named}, chosen by the person: keep it; change it with \`fig.style(name, { accent })\` only when they ask.`
  }
  if (chooser === 'agent') {
    return `Style: ${named}, picked by the Figure agent earlier: keep it, or pick again for the figure's genre (${GENRE_STYLES}).`
  }
  return `Style: nobody chose one, so Aster's default ${named} applies until you pick the preset for the figure's genre with \`fig.style(name, { accent })\`: ${GENRE_STYLES}.`
}

/** The reference rules the switch asks for: references first (with pins), or none. */
function referenceRules(modes: FigurePromptModes | null | undefined): string[] {
  if (modes?.references === null) {
    return [FIGURE_REFERENCES_OFF_RULE]
  }
  return modes?.references?.pinned.length
    ? [FIGURE_REFERENCE_RULE, FIGURE_PINNED_REFERENCES_RULE]
    : [FIGURE_REFERENCE_RULE]
}

/** The figure's style, its colours, and the rules that keep it from looking generated. */
export function paperStyleLines(
  page: FigurePage | null = null,
  modes: FigurePromptModes | null = null
): string[] {
  const style = figureStyle(page?.style, page?.accent)
  return [
    `${styleChoiceLine(page)} Presets ${Object.keys(FIGURE_STYLES).join(', ')}; accents ${Object.keys(FIGURE_ACCENTS).join(', ')} or any #hex (\`figures kit colors\`). Text in two sizes: ${style.textSize} (8 pt) for labels, ${style.smallSize} (7 pt) for tokens, arrow labels and notes, in the manuscript's LaTeX face with the math typeset by MathJax. Arrows by role, each one thin 0.75 pt line: data (gray, the default), main (ink) only for the paper's contribution path, side (gray), aux (dashed), cond (ink), and where the paper tells flows apart, coloured by what flows in the world's tones: grad, feedback, good, bad, skip; arrows run only horizontally and vertically (straight, or one sharp elbow the kit routes around boxes; a curve only for a loop in an illustrative figure), and boxes in a row or column line up exactly on an 8-unit grid. Only the declared focus (\`fig.focus\`, the contribution) takes the accent; frozen parts gray (\`fig.colourBy('trainable', { frozen: ids })\`), said in words ("frozen", "trainable": \`fig.frozen\`, \`fig.trainable\`) only when the figure mixes the two (never emoji or icons). Shapes carry meaning: trapezoids for encoders and decoders, a cylinder for a store, a stack for a set, a node or plain text for an operation, the paper's own pictures shown large. Show the objective the way the figure needs it (a name, a short symbol, a match link, or the full formula only when the formula is the point), in ink; colour only if asked. Figures beyond the method have their own pieces (\`figures kit genres\`): a data pipeline (\`pipeline\` with counts and examples per stage), a motivation or teaser figure (\`card\`, \`mark\`, \`chart\`, \`subcaption\`), qualitative examples (\`examples\`). ${FIGURE_UNITS_PER_INCH} units per inch.`,
    ...referenceRules(modes),
    FIGURE_DRAWN_RULE,
    FIGURE_PAPER_RULE,
    `${FIGURE_COLOUR_RULE} ${FIGURE_LEGEND_RULE}`,
    FIGURE_DESIGN_RULE,
    ...(smallPage(page) ? [FIGURE_SMALL_PAGE_RULE] : []),
    FIGURE_EXAMPLES_RULE
  ]
}

/** A page short or narrow enough that its text and pictures risk printing too small. */
function smallPage(page: FigurePage | null): boolean {
  return page !== null && (page.heightIn < 2 || page.widthIn <= 3.5)
}

/** Structure first: the motifs a figure exists to show, listed before drawing and checked after. */
export const STRUCTURE_FIRST =
  "the motifs the paper's figure exists to show (a U-shape with skip connections and resolution levels, a state fanning out to several parts, a cycle such as a curriculum or an act–check–refine loop, which outputs feed back where), drawn as connections, never as a row of boxes; record them with `fig.structure({ loops, fanouts, skips, feedback, text })` so `figures check` warns about any it cannot find drawn (`figures kit structure`: unet, bus, ring, cylinder)"
