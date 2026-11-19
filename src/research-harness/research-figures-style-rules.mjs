// The figure style rules said once: the Figures guide (track/SKILL.md) carries these sentences
// verbatim and Aster's Figure prompts import them, so the two never disagree about references,
// drawn glyphs, the paper look, colour, legends or small pages (a test checks the guide holds each).

/** Colour and palette: what every figure follows, whoever picked the preset. */
export const FIGURE_COLOUR_RULE =
  "Colour by meaning: ink on white for every part, one accent for the paper's contribution alone (`fig.focus([...ids])`), and at most one more colour, only for one declared dimension (`fig.colourBy('stream' | 'modality' | 'trainable', { value: ids })`); published figures use three hues or fewer and the contribution's accent appears nowhere else. Never colour by component type (no hue per module, no pastel per stage), never a pastel fill outlined in a darker shade of its own hue (a neutral thin line or none), never one hue for two meanings; worlds, presets and templates still pick the hues, and save() maps them to this. Panels are never cards: sub-figures sit apart in whitespace, a group (`fig.panel`) is a thin square neutral line, and only a declared region (the focus's or a dimension's) takes a pale tint. Text stays ink; arrows stay gray or ink, the focus's own path in the accent."

/** The design pass: emphasis by declaration, each fact once, and the craft the critique counts. */
export const FIGURE_DESIGN_RULE =
  "Design pass: declare the focus (the contribution) with `fig.focus` before saving, so it alone takes the accent, a 1 pt outline and a label a step larger, and make it lead by size (1.6 to 6 times a typical part) or by place. Each fact appears once; refer, don't repeat: a second place points to it with an arrow, the same colour or a symbol, never the same words, value or picture again. Peers share one size, gaps come from one small scale (8, 16, 24), at most three box styles and three text sizes, no stacked token chips (one clean strip when the tokens are the point), pictures in a row the same size, no caption without its picture. After the first render run `figures critique`, make the cuts it lists before any polishing, then render and critique again."

/**
 * The paper look, the default for every figure but an illustrated teaser, and the return paths
 * it keeps short.
 */
export const FIGURE_PAPER_RULE =
  "The paper look is the default for method, architecture, pipeline and system figures in every preset (`fig.style('illustrative')` or `look: 'preset'` only for a teaser drawn as an illustration): words and math in the manuscript's LaTeX face (Computer Modern, or Times when its preamble loads Times or a NeurIPS, ICLR, ICML or CVPR style), sub-figures titled above with \"(a)\" centred below and whitespace between them, one 0.75 pt line with small heads, square corners, a network as thin bars (`fig.nn`), frozen and trainable said in words (`fig.frozen`, `fig.trainable`), and no icons unless the person asks; `figures check` (academic-look) counts cards, faces, clip-art, colours, fill and corners. A gradient or feedback path stays short: it ends on the nearest part it updates and runs in the clear band beside the row (`arrow({ route: 'under' | 'over' })`), never as a loop round the figure (long-return); where the published figure has only a labelled arrow or a note, draw that."

/** Legends and words in the figure. */
export const FIGURE_LEGEND_RULE =
  "No prose in the figure: labels of a few words in the paper's notation, the caption explains. A legend only when three or four roles need a key or the person asks for one (`fig.legend`, small, beside or above the panels)."

/** Pages someone else sized small: compact, never drop what was asked, never shrink below print sizes. */
export const FIGURE_SMALL_PAGE_RULE =
  'Small pages: when the person or the task sets a page 1.1–1.9 in tall, or a single column with many parts, keep text at 7 pt (14 units) or more and pictures at 0.5 in (72 units) or more, and keep everything the request names: every module, label, formula, listed item and the legend it asks for (`fig.legend({ asked: true })`). Compact first: shorter words for what you added, labels stacked on two lines, gaps of 8 instead of 16, one shared legend row, a formula inline beside its symbol (`z \\in \\mathbb{R}^{h \\times w \\times c}` next to z) or on a short second line; only then merge or drop what you added yourself (a routine step becomes an arrow label). Nothing may overlap: when a formula has no room, move it under its panel, shorten it (`\\mathrm{softmax}(QK^T/\\sqrt{d})V`) or stack it on two lines a full line apart, and keep 4 units between it and any box, line or word (`figures check`: text-overlap, paper-overlap, arrow-over-text). `figures check` (small-page) lists what to compact, and your reply says anything you left out.'

/** Where to start a hard figure. */
export const FIGURE_EXAMPLES_RULE =
  "Start a hard figure from the closest worked example: `figures kit examples` lists whole, short scripts (rays through image planes, a ray beside a cone and its Gaussians, a tri-plane, a camera rig, Swin windows, a lit 3D scene, volume boxes, a U-Net with skips, state lanes fanning out, an agent loop with feedback, score distillation back through a renderer, a diffusion teaser, a loss landscape, a dense block with skip arcs, token maps by scale, memory tiers and tiles, a filmstrip cascade); `figures kit examples <name> --figure <slug>` prints one laid out for your figure's page (they read `fig.page`) and says how it fits there; copy it, then change it."

/** Densities, samples and paths: computed by the kit, not drawn by hand (the guide's distributions part). */
export const FIGURE_DISTRIBUTION_RULE =
  'Distributions and trajectories are computed, never drawn as stacked circles or hand-placed lines: `fig.density` draws a real density as filled contour bands (thin unfilled lines for an intermediate p_t), `fig.flow` computes p_t, the sample paths (the marginal ODE, an SDE, OT or independent pairs) and the velocity between two distributions; for real data or a shape beyond the presets, plot it in Python and place it with `fig.plot`.'

/** References before drawing: the composition of a published figure, never its content. */
export const FIGURE_REFERENCE_RULE =
  "Reference first, as designers work: before drawing, run `figures refs --figure <slug> --for \"<what the figure shows, in concept words>\"` (or `--kind 3d-vision | generative | architecture | embodied`); it prints the 2–3 closest published figures with a recipe for each (layout skeleton, glyphs with their kit calls, colour roles, emphasis, type, hand-made details) and the image to open when a reference folder is set up: open each and look closely. Pick one and name it in the design brief (`fig.design({ brief: 'Following <id>: …' })` and in the chat): follow its composition and glyph vocabulary, never its content, words or pictures; a figure never follows its own paper's figure (`figures refs` leaves it out). Before you finish, open your print-size preview beside that reference image and compare: the concept drawn, not boxed; one story axis; one glyph family in one view; colour for one meaning; pictures inside the drawing; the contribution leading by size. Fix the largest difference first."

/** The drawn glyph family: concepts drawn the way the references draw them. */
export const FIGURE_DRAWN_RULE =
  "Draw the concept, not a box: a tensor or feature volume as a cuboid with its sizes (`fig.tensor`), feature maps as stacked planes or a shrinking staircase (`fig.planes`), multi-scale tokens as maps on a pedestal (`fig.tokenMaps`), a voxel grid (`fig.voxelGrid`), a video as a 3D filmstrip (`fig.filmstrip`), memory tiers as a pyramid (`fig.pyramid`), a tiled matrix with its loops (`fig.tiledMatrix`), dense skips as curved arcs (`fig.skipArcs`), tokens as one row of pills (`fig.pills`), scenes with rays and cones in `fig.perspective`; `figures kit drawn` lists them, all in one oblique view, and their colours that encode values (a tier, a source layer, a picture's pixels) stay as drawn under the design pass."

/**
 * The Figure agent's switches (the person turns each on or off per project; a request says which
 * are on). Careful drawing: sketches first, then a separate art director's rounds.
 */
export const FIGURE_CAREFUL_RULE =
  'Careful drawing (only when its switch is on; the request says so and gives N): first sketch 3–4 compositions that differ in layout, not in detail (each a different arrangement or story axis; rough boxes, arrows and one-word labels) as copies of the figure in `.careful/<slug>/s1.excalidraw` to `s4.excalidraw` beside it (`figures careful --figure <slug> --start --rounds N` makes the folder), record them with `figures careful --figure <slug> --sketches "s1: … | s2: …"` and pick one with `figures careful --figure <slug> --chose s<k> --why "…"`; when the person picks, stop after the sketches until they choose one in the panel. Then draw it in full and run N art director rounds: preview, then `figures careful --figure <slug> --review` prints the separate art director\'s address and the request to send (`aster orchestration send`, then `aster orchestration check --wait`); record its reply with `figures careful --figure <slug> --round <k> --fixes "…"`, make every fix, and go on until round N or a SHIP answer, then `figures careful --figure <slug> --done "…"`. Never review your own figure in its place; when no art director answers, say so in the chat.'

/** What the art director (the separate critic careful drawing starts) checks and answers. */
export const FIGURE_ART_DIRECTOR_RULE =
  "Art director's review: compare the print-size render with the reference image it follows and with the rubric (the idea clear in five seconds; the concept drawn, not boxed; one story axis; one glyph family in one view; colour for one meaning; the contribution leading by size or place; each fact once; rows and columns aligned; every label legible at print size). Answer SHIP or REVISE on the first line, then at most 8 fixes, largest first, each specific and measurable: the element or region (its id or label), what is wrong as a number (a gap of 37 units against 16, text at 5.5 pt against 7 pt, three hues against two) and the target value or position. Check that last round's fixes were made; no praise, no redrawing, no file edits."

/** References off: no `figures refs` step. */
export const FIGURE_REFERENCES_OFF_RULE =
  'References off (the person\'s switch): skip `figures refs` and the comparison with a reference image; compose from the method itself and the closest worked example, and write "no reference" in the design brief.'

/** References the person pinned from their reference folder. */
export const FIGURE_PINNED_REFERENCES_RULE =
  'Pinned references: when the person pins references, `figures refs --pin <ids>` prints those first (an image of their own has no recipe: read its layout, glyphs and colour roles from the image); follow one of them unless none fits the figure, and say why.'

/** The concept image: an image model's picture, measured and redrawn as editable shapes. */
export const FIGURE_CONCEPT_RULE =
  "Concept image (experimental; only when its switch is on): before drawing, generate one concept image of the figure with Codex's image generation (your own image tool when you are Codex, else `codex exec --enable image_generation`), save it as `references/<slug>-concept.png` in the figures folder, then recreate it as editable shapes the way a recreation reads a reference: positions and sizes measured from the image scaled to the page width, in the paper look, with every word, symbol and formula taken from the paper, never from the image (image models misspell and invent labels). It is a sketch to measure, not a reference to keep: its colours and type give way to the paper look. With careful drawing on too, the concept image is one sketch, not the plan: draw its composition roughly as one of s1–s4 (say which in `--sketches`), the others your own compositions, and the pick goes by composition as for any sketch."

/**
 * The concept switch's second way: generated art for the illustrative parts only, textless, with
 * the layout and everything precise drawn by the kit over it (round 20).
 */
export const FIGURE_HYBRID_RULE =
  "Hybrid figure (experimental; only when the concept image switch is on with \"hybrid: generated art + vector text\"): an image model draws only the illustrative parts, without any text, and you lay out the figure with the kit and draw everything precise over them as editable vector. Lay the figure out first (brief, references, structure, the page) and decide each illustrative slot with its place and size: a 3D scene or lit volume box, an object, a photo-textured oblique plane, a rendered sample the project has no picture for. Small icons (cameras, lamps, a sun) come out as clip art: draw them with the kit. Everything precise stays kit work: all text, math, arrows, brackets, labels, panel captions, plain boxes, exact counts (grids, windows, patches: `art.grid` or `fig.quadGrid` over the art) and the project's own pictures. For each slot, or one band of several (`--split` cuts separate objects apart), write `art/<slug>/<part>.prompt.txt` in the figures folder: the parts in plain visual words, never a paper's, method's or figure's name and never \"the X figure\" (image models recall published figures and copy them), no text in it, every prompt of the figure ending with the same STYLE line (one light direction, one palette); then `figures art --figure <slug> --part <part> --gen --aspect <slot w/h>` (at most 4 images a figure; `--ref` passes one of the project's own pictures as content, never a published figure). Open each grid image it writes: regenerate a part with letters, numbers, a wrong count or view, or draw it with the kit. Place each with `fig.art({ id, part, x, y, w | h, anchors })`, anchors read off the grid image as shares [u, v] (a plane's corners tl, tr, br, bl are found for you; `grid({ veil: 40 })` keeps lines readable over a photo), and set labels, math and arrows at `art.at(name)`; at print size check each label sits beside or on a clear part of its object, each arrow ends on the drawn object, and the art and the vector agree."

/** The switch rules, each in the Figures guide word for word. */
export const FIGURE_MODE_RULES = [
  FIGURE_CAREFUL_RULE,
  FIGURE_ART_DIRECTOR_RULE,
  FIGURE_REFERENCES_OFF_RULE,
  FIGURE_PINNED_REFERENCES_RULE,
  FIGURE_CONCEPT_RULE,
  FIGURE_HYBRID_RULE
]

export const FIGURE_STYLE_RULES = [
  FIGURE_REFERENCE_RULE,
  FIGURE_DRAWN_RULE,
  FIGURE_PAPER_RULE,
  FIGURE_COLOUR_RULE,
  FIGURE_DESIGN_RULE,
  FIGURE_LEGEND_RULE,
  FIGURE_SMALL_PAGE_RULE,
  FIGURE_EXAMPLES_RULE,
  FIGURE_DISTRIBUTION_RULE
]
