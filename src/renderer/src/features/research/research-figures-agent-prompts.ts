import { withAsterContext } from '../../../../shared/aster-context-block'
import type { FigureNeighbour } from '../../../../research-harness/research-figures-lint.mjs'
import {
  FIGURE_UNITS_PER_INCH,
  type FigureElementSummary,
  type FigurePage
} from '../../../../research-harness/research-figures-model.mjs'
import {
  FIGURE_ACCENTS,
  FIGURE_STYLES,
  figureStyle
} from '../../../../research-harness/research-figures-style.mjs'

/** Everything a prompt names: the files on the host that holds the project, and the page. */
export type FigurePromptContext = {
  /** Absolute paths on the project's host. `folderPath` is the open figure's own folder. */
  folderPath: string
  /** The working folder (`<record root>/figures`): where new figures and plots go. */
  workFolderPath: string
  manuscriptPath: string | null
  figure: {
    slug: string
    scenePath: string
    page: FigurePage | null
    /** The figure still lives beside the manuscript, an older figure Aster did not move. */
    besideManuscript?: boolean
  } | null
}

export type FigureQuickRequest = 'draw-method' | 'clean-up' | 'sketch' | 'plot'

export const FIGURE_QUICK_ACTIONS: readonly { request: FigureQuickRequest; label: string }[] = [
  { request: 'draw-method', label: 'Draw from the method section' },
  { request: 'clean-up', label: 'Clean up for the paper' },
  { request: 'sketch', label: 'Turn my sketch into a diagram' },
  { request: 'plot', label: 'Plot from Runs' }
]

export type FigureAreaRequest = {
  prompt: string
  area: { id: string; name: string; x: number; y: number; width: number; height: number }
  touching: readonly FigureElementSummary[]
  /** Shapes just outside the area that new arrows may connect to. */
  neighbours: readonly FigureNeighbour[]
  /** Sketch images saved as files the agent can read. */
  sketches: readonly { elementId: string; path: string }[]
}

export type FigureSelectionRequest = {
  prompt: string
  selected: readonly FigureElementSummary[]
  bounds: { x: number; y: number; width: number; height: number }
}

const round = (value: number): number => Math.round(value * 10) / 10

function boundsText(box: { x: number; y: number; width: number; height: number }): string {
  return `x=${round(box.x)} y=${round(box.y)} width=${round(box.width)} height=${round(box.height)}`
}

function elementLines(elements: readonly FigureElementSummary[]): string[] {
  return elements.map(
    (element) =>
      `   - ${element.id} ${element.type}${element.label ? ` "${element.label}"` : ''}${element.frameId ? ` (frame ${element.frameId})` : ''}`
  )
}

/** Which preset a figure of each genre takes when nobody chose one (the skill's choice). */
const GENRE_STYLES =
  "a method block diagram stays graphite; an overview, teaser, motivation, conceptual or data-pipeline figure takes 'illustrative'; a grid of qualitative examples takes 'outline' or graphite"

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

/** The figure's style, its colours, and the rules that keep it from looking generated. */
export function paperStyleLines(page: FigurePage | null = null): string[] {
  const style = figureStyle(page?.style, page?.accent)
  return [
    `${styleChoiceLine(page)} Presets ${Object.keys(FIGURE_STYLES).join(', ')}; accents ${Object.keys(FIGURE_ACCENTS).join(', ')} or any #hex (\`figures kit colors\`). Text in two sizes: ${style.textSize} (8 pt) for labels, ${style.smallSize} (7 pt) for tokens, arrow labels and notes; math is typeset by MathJax. Arrows by role: data (gray, 1 pt, the default), main (dark, 1.25 pt) only for the paper's contribution path, side (gray, 0.75 pt), aux (dashed); arrows run only horizontally and vertically (straight, or one sharp elbow the kit routes around boxes; a curve only for a loop in an illustrative figure), and boxes in a row or column line up exactly on an 8-unit grid. Trained modules in the accent, frozen ones gray, with the line flame and snowflake badges only when the figure mixes the two (never emoji). Show the objective the way the figure needs it (a name, a short symbol, a match link, or the full formula only when the formula is the point), in ink; colour only if asked. One meaning per hue. Figures beyond the method have their own pieces (\`figures kit genres\`): a data pipeline (\`pipeline\` with counts and examples per stage), a motivation or teaser figure (\`card\`, \`mark\`, \`chart\`, \`subcaption\`), qualitative examples (\`examples\`). ${FIGURE_UNITS_PER_INCH} units per inch.`
  ]
}

/** The one rule about the paper: it receives a figure only when the person asks for that. */
function paperRule(context: FigurePromptContext): string {
  const figure = context.figure
  if (figure?.besideManuscript) {
    return `This figure lives beside the manuscript in ${JSON.stringify(context.folderPath)}, where the paper reads it; there is nothing to publish.`
  }
  const slug = figure?.slug ?? '<slug>'
  return `Working files stay in ${JSON.stringify(context.workFolderPath)}; the paper only gets a figure when I ask. Never copy anything into the manuscript's folder and never edit the manuscript for this yourself. When I say to put the figure in the paper or use it there, run \`node H/cli.mjs figures publish --figure ${slug}\` (it copies the vector PDF next to the manuscript, and updates that copy when I ask you to refresh it); do not run it on your own, not even when a figure is finished.`
}

function header(context: FigurePromptContext, recreating = false): string[] {
  const { figure } = context
  const page = figure?.page
  return [
    'You are the Figure agent of this research project. Figures are Excalidraw JSON files in',
    `${JSON.stringify(context.workFolderPath)}; Aster shows each change on its Figures page as soon as the file is saved and writes <slug>.svg and <slug>.pdf next to it.`,
    ...(figure
      ? [
          `Figure "${figure.slug}": ${JSON.stringify(figure.scenePath)}.`,
          page
            ? `Page: frame ${page.id}, ${page.widthIn} × ${page.heightIn} in, ${boundsText(page)}. Keep everything inside it.`
            : 'This figure has no page frame; keep it compact.'
        ]
      : []),
    ...(context.manuscriptPath
      ? [
          `Manuscript: ${JSON.stringify(context.manuscriptPath)}; \`node H/cli.mjs figures context --manuscript ${JSON.stringify(context.manuscriptPath)}\` lists its sections and run-in headings (not the project's default paper).`
        ]
      : []),
    `Follow the Figures section of the aster-research-track skill: run \`aster research harness-path\` for H. Draw with a script kept at ${JSON.stringify(`${context.folderPath}/src/${figure?.slug ?? '<slug>'}.figure.mjs`)} (committed, so the figure can be regenerated) that starts with \`import { openFigure } from './aster-figures-kit.mjs'\` (a portable shim beside it, never H's absolute path); run it with \`node H/cli.mjs figures run --figure ${figure?.slug ?? '<slug>'}\`, which writes the shim when missing. \`node H/cli.mjs figures kit\` prints an index of the kit's functions and \`figures kit <topic|name>\` their options and defaults; \`figures show\` lists what is there.`,
    ...(recreating
      ? [
          'This figure recreates a reference: keep its colours (as hex), line weights and text sizes; the paper palette does not apply and `figures check` knows it. Use editable shapes, never the reference pasted as one image.'
        ]
      : paperStyleLines(page)),
    paperRule(context),
    'Keep the ids of elements you keep; give new elements new unique ids. Write the whole file back as valid JSON.',
    `After every edit: \`node H/cli.mjs figures check${figure ? ` --figure ${figure.slug}` : ''}\` (fix every ERROR), then \`node H/cli.mjs figures preview${figure ? ` --figure ${figure.slug}` : ''}\`, open the PNG it prints and look at it (and the copy with lint findings boxed in red, when it prints one). Before you finish, open the print-size PNG it prints too and check every label is still easy to read at that size. Fix what looks wrong and repeat, at most three rounds.`,
    ''
  ]
}

function quickBody(context: FigurePromptContext, request: FigureQuickRequest): string[] {
  const target = context.figure
    ? `into ${JSON.stringify(context.figure.scenePath)}, inside the page frame`
    : 'into a new figure: `node H/cli.mjs figures new --name "Method overview" --size single`, then edit the file it prints'
  switch (request) {
    case 'draw-method':
      return [
        `1. Read ${context.manuscriptPath ? JSON.stringify(context.manuscriptPath) : 'the manuscript'} and find the method section (\`figures context${context.manuscriptPath ? ` --manuscript ${JSON.stringify(context.manuscriptPath)}` : ''}\` lists its sections and paragraph headings; ask me if several could be meant; if there is none, say so and what you assumed).`,
        '2. Before drawing, write a three-line design brief in the chat: the one idea a reader must get in five seconds; the data the method operates on (tokens, image patches, video frames, latents…); the hero element (the contribution) and what you will leave out (tokenizer, patchify, output embeddings and other routine steps become arrow labels or nothing).',
        "3. Pick the layout that makes that data the spine: a sequence through one shared model (a token strip under a wide model bar, outputs above), two branches meeting at their loss (teacher and student), stacked blocks (one block in detail, in a titled panel), encoder → latent → decoder, frames unrolled in time, or masked and unmasked grids side by side. Use the paper's notation on nodes and edges.",
        `4. Draw it ${target} with the kit in the figure's style (\`figures kit\` lists every function; \`figures kit templates\` the common architectures, \`figures kit icons\` the icons). Show the data with glyphs (tokens with real words and image patches, photo thumbnails, frames, patches with masked cells, features, attention); prefer the project's own sample images, and if it has none, ask me for a few or a dataset folder and use the bundled photos meanwhile. Show the operations that name the method and every term of the objective, each loss over everything it compares (predictions and targets framed apart, meeting only at the loss beside them: \`loss({ predictions, targets })\`), as a name or a short symbol in ink, the full formula going in the caption. Colour by role: trained modules in the accent, frozen ones gray (flame and snowflake badges only when both kinds appear), predictions tinted, targets gray. For an overview, teaser or data pipeline rather than method detail, use \`fig.style('illustrative')\`: tinted panels, network glyphs, and the paper's one-line message as a coloured callout. Weight follows the contribution: ordinary flow keeps the default data arrow; choose \`role: 'main'\` on purpose for the paper's contribution path (in DiT that is the conditioning, not the residual stream). Put notes and masks beside what they explain. No prose and no legend: the caption explains. If my request conflicts with the method's definition, follow the method and tell me.`,
        '5. Check and preview as above, then critique the preview against this rubric: the idea is clear in five seconds; the one detail that names the method is drawn; the data is shown, not named; the whole objective is there; one hero; colours by role, at most three hues; bold only on the contribution path; every arrow straight or one clean elbow, rows and columns aligned and evenly spaced; boxes fit their labels, no empty regions; parts sit beside what they explain; labels clear of arrows and heads; a double-column page you sized yourself at most 2.8 in tall (a page I or Aster set stays as it is: do not ask about its size); every label legible in the print-size PNG. Fix and repeat, then tell me in two sentences what the figure shows and propose its caption (with the full objective, when the figure shows only its name).'
      ]
    case 'clean-up':
      return [
        'Clean up this figure for the paper without changing what it says:',
        '1. Align related boxes and distribute them evenly on an 8-unit grid; give boxes with the same role the same size.',
        "2. One font (fontFamily 9) at 16 for labels; the figure style's colours only (neutrals, one accent; the loss in ink unless it was coloured on purpose); strokeWidth 2 for lines and arrows; roughness 0.",
        '3. Bind every arrow to the boxes it connects; straight or elbow arrows only; no crossings you can avoid.',
        '4. Everything inside the page frame and legible at the printed width. Keep ids; add or remove nothing.'
      ]
    case 'sketch':
      return [
        'Turn my sketch in this figure into a clean diagram:',
        '1. Read the sketch: images listed below (open the files), and freedraw or rough elements on the page.',
        "2. Redraw it in the same place with editable rectangles, ellipses, arrows and text in the paper style. Keep its arrangement, tidy the alignment, and use the manuscript's terms for the labels.",
        "3. Delete the sketch elements (images and freedraw) and each image's entry in `files` once the diagram replaces them."
      ]
    case 'plot':
      return [
        `1. Find the Runs and metrics to plot with \`node H/cli.mjs context --json\` and \`node H/cli.mjs run show\` (metrics.jsonl in each Run folder). Ask me which Runs and metric if it is not clear.`,
        `2. Write ${JSON.stringify(`${context.workFolderPath}/<name>.py`)}: matplotlib, 3.25 in wide, 8 pt fonts, neutral grays plus the figure's accent for the method's own curve, no title (the caption goes in LaTeX), labelled axes with units.`,
        `3. Run it so it saves ${JSON.stringify(`${context.workFolderPath}/<name>.pdf`)} and a .png beside it; they appear on the Figures page.`,
        '4. Tell me what it shows. When I ask to put it in the paper, run `node H/cli.mjs figures publish --figure <name>` and reply with its \\includegraphics line.'
      ]
  }
}

const QUICK_VISIBLE: Record<FigureQuickRequest, string> = {
  'draw-method': 'Draw the method section as a diagram.',
  'clean-up': 'Clean up this figure for the paper.',
  sketch: 'Turn my sketch into a clean diagram.',
  plot: 'Plot results from the Runs.'
}

/** Variants ×3: three alternatives in `.variants/<slug>/v1..v3.excalidraw`, the figure untouched. */
export function figureVariantLines(context: FigurePromptContext): string[] {
  const figure = context.figure
  if (!figure) {
    return []
  }
  const folder = `${context.folderPath}/.variants/${figure.slug}`
  return [
    `Variants ×3: do not change ${JSON.stringify(figure.scenePath)}. Copy it to ${JSON.stringify(`${folder}/v1.excalidraw`)}, v2.excalidraw and v3.excalidraw, and do the request in each copy a different way (layout, emphasis or level of detail), with the kit (\`openFigure(<copy>)\`) or by editing the JSON. Check each copy, then say in one line per variant how it differs. Aster shows the three above the canvas; the person adopts one or discards them.`
  ]
}

export function buildFigureQuickPrompt(
  context: FigurePromptContext,
  request: FigureQuickRequest,
  sketches: readonly { elementId: string; path: string }[] = [],
  variants = false
): string {
  const sketchLines = sketches.map(
    (sketch) => `   - ${JSON.stringify(sketch.path)} (image element ${sketch.elementId})`
  )
  return withAsterContext(
    variants ? `${QUICK_VISIBLE[request]} (three variants)` : QUICK_VISIBLE[request],
    {
      label: context.figure ? `Figure ${context.figure.slug}` : 'Figures',
      body: [
        ...header(context),
        ...quickBody(context, request),
        ...(sketchLines.length ? ['Sketch images:', ...sketchLines] : []),
        ...(variants ? figureVariantLines(context) : [])
      ].join('\n')
    }
  )
}

/** Generate in area: draw only inside one frame of the figure. */
export function buildFigureAreaPrompt(
  context: FigurePromptContext,
  request: FigureAreaRequest
): string {
  const { area } = request
  return withAsterContext(`Fill the area "${area.name}": ${request.prompt}`, {
    label: `Figure area ${area.name}`,
    body: [
      ...header(context),
      `Request for area ${area.id}: ${request.prompt}`,
      `Area: frame id ${JSON.stringify(area.id)}, ${boundsText(area)} (scene units, y grows down).`,
      request.touching.length
        ? 'Already in or overlapping the area:'
        : 'Nothing is in the area yet.',
      ...elementLines(request.touching),
      ...(request.neighbours.length
        ? [
            'Just outside the area (connect to these where the flow needs it):',
            ...request.neighbours.map(
              (entry) =>
                `   - ${entry.id} ${entry.type}${entry.label ? ` "${entry.label}"` : ''} ${boundsText(entry)}`
            )
          ]
        : []),
      ...(request.sketches.length
        ? [
            'Sketch to redraw (read the image file, then delete its element once redrawn):',
            ...request.sketches.map(
              (sketch) => `   - ${JSON.stringify(sketch.path)} (image element ${sketch.elementId})`
            )
          ]
        : []),
      `1. Replace only this area's contents: remove the elements whose frameId is ${JSON.stringify(area.id)} (and text bound to them), then add the new ones with "frameId": ${JSON.stringify(area.id)}.`,
      '2. Keep every new element inside the area bounds. Do not move, resize or delete the frame.',
      '3. Outside the area you may only add arrows with "frameId": null that connect an element inside it to one listed just outside, and add those arrow ids to that neighbour\'s boundElements. Change nothing else outside.',
      `4. Run \`figures check --area ${area.id}\` and preview as above, then reply in one sentence with what you drew.`
    ].join('\n')
  })
}

/** Ask about selection: change the elements the user selected. */
export function buildFigureSelectionPrompt(
  context: FigurePromptContext,
  request: FigureSelectionRequest
): string {
  return withAsterContext(
    `About the ${request.selected.length} selected elements: ${request.prompt}`,
    {
      label: 'Figure selection',
      body: [
        ...header(context),
        `Request: ${request.prompt}`,
        `Selected elements (their common box: ${boundsText(request.bounds)}):`,
        ...elementLines(request.selected),
        '1. Change only these elements, and add new ones next to them when the request needs it (e.g. arrows between them). Leave everything else as it is.',
        '2. Run `figures check`, then reply in one sentence with what changed.'
      ].join('\n')
    }
  )
}

export type FigureRecreateRequest = {
  /** Absolute path of the reference image on the project's host. */
  referencePath: string
  pixels: { width: number; height: number }
}

/** Recreate a published figure as it is, with editable shapes, comparing previews to it. */
export function buildFigureRecreatePrompt(
  context: FigurePromptContext,
  request: FigureRecreateRequest
): string {
  const page = context.figure?.page
  const unitsPerPixel = page
    ? Number((page.width / request.pixels.width).toFixed(4)).toString()
    : null
  return withAsterContext('Recreate this reference figure as it is.', {
    label: `Figure recreation ${context.figure?.slug ?? ''}`.trim(),
    body: [
      ...header(context, true),
      `Reference: ${JSON.stringify(request.referencePath)} (${request.pixels.width} × ${request.pixels.height} px). Open it and read every shape, arrow, label, colour and photo. \`node H/cli.mjs figures reference\` lists its colour regions (filled shapes, outlines, lines) already in scene units: start from those numbers.`,
      ...(page && unitsPerPixel
        ? [
            `The page is ${page.widthIn} × ${page.heightIn} in (${page.width} × ${page.height} units), so one reference pixel is ${unitsPerPixel} units: place each element at its reference position × ${unitsPerPixel}. \`fig.setPage({ matchReference: true })\` fits the page to the reference's shape if needed.`
          ]
        : []),
      '1. Reproduce the layout, proportions and text exactly: same wording, line breaks, relative sizes and colours, every arrow with its route and head.',
      '2. Write one script that starts with `fig.reset()` and draws everything, so you can rerun it after each fix. Use the kit with measured sizes (`exact: true` keeps a box at w × h): box, trapezoid (`corners` for lopsided ones), rounded, grid, stack, node, dot, polyline, stopGrad, arrow (`gap`, `headSize`, `points`, `head: "chevron"`), math. For a photo or video frame use `await fig.photo({ id, x, y, w, h, crop: { x, y, width, height } })` with the crop in reference pixels; without crop it is a placeholder.',
      "3. Excalidraw has no italic, bold, serif or dash-dot: write captions as regular text at the reference's size, a heavier strokeWidth for bold rules, dashed for dash-dot.",
      '4. Check and preview as above: for a recreation `figures preview` also prints a compare PNG (reference beside your preview, one scale) and an overlay PNG (your preview over a faded reference). Open the compare PNG and go region by region: positions, sizes, colours, text and arrow ends; in the overlay an offset shows as a ghost edge. Fix and repeat, up to four rounds, then tell me what still differs.'
    ].join('\n')
  })
}

/** The figure context a typed Figure chat message carries, and the key that says when it changed. */
export function buildFigureMessageContext(context: FigurePromptContext): {
  key: string
  label: string
  body: string
} {
  const page = context.figure?.page
  return {
    key: figureContextKey(context),
    label: context.figure ? `Figure ${context.figure.slug}` : 'Figures',
    body: [
      ...header(context, Boolean(page?.reference)),
      'For a new figure or a redraw, follow the skill: write the design brief, pick the layout, draw the data, then check the preview against the rubric.'
    ].join('\n')
  }
}

/** What the agent must hear about again: another figure, page size, style or reference. */
export function figureContextKey(context: FigurePromptContext): string {
  const page = context.figure?.page
  return [
    context.figure?.scenePath ?? context.folderPath,
    page ? `${page.widthIn}x${page.heightIn}` : '',
    page?.style ?? '',
    page?.accent ?? '',
    page?.reference ?? ''
  ].join('|')
}
