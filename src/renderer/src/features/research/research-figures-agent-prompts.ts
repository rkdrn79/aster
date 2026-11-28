import { withAsterContext } from '../../../../shared/aster-context-block'
import type { FigureNeighbour } from '../../../../research-harness/research-figures-lint.mjs'
import type {
  FigureElementSummary,
  FigurePage
} from '../../../../research-harness/research-figures-model.mjs'
import {
  plotHeaderLines,
  plotQuickBody,
  type FigurePlotContext
} from './research-figure-plot-prompts'
import { STRUCTURE_FIRST, paperStyleLines } from './research-figure-style-prompts'
import { personEditPromptLines } from './research-figure-person-prompt'
import {
  figureBriefStep,
  figureCompareClause,
  figureKeepCompositionLines,
  figureModeLines,
  figureModeSteps,
  figureModesKey,
  figureModeTarget as modeTarget,
  figureRedrawLine,
  type FigurePromptKind,
  type FigurePromptModes
} from './research-figure-mode-prompts'

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
    /** The person's hand edits Aster keeps over script runs, in words. */
    personEdits?: readonly string[]
  } | null
  /** The open plot (a Python data figure), when a plot rather than a diagram is open. */
  plot?: FigurePlotContext | null
  /** The person's switches (careful drawing, references, concept image); absent: the defaults. */
  modes?: FigurePromptModes | null
}

export type { FigurePlotContext }

export type FigureQuickRequest = 'draw-method' | 'clean-up' | 'sketch' | 'plot' | 'plot-dist'

export const FIGURE_QUICK_ACTIONS: readonly { request: FigureQuickRequest; label: string }[] = [
  { request: 'draw-method', label: 'Draw from the method section' },
  { request: 'clean-up', label: 'Clean up for the paper' },
  { request: 'sketch', label: 'Turn my sketch into a diagram' },
  { request: 'plot', label: 'Plot from Runs' },
  { request: 'plot-dist', label: 'Plot a distribution or trajectory' }
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

/** The one rule about the paper: it receives a figure only when the person asks for that. */
function paperRule(context: FigurePromptContext): string {
  const figure = context.figure
  if (figure?.besideManuscript) {
    return `This figure lives beside the manuscript in ${JSON.stringify(context.folderPath)}, where the paper reads it; there is nothing to publish.`
  }
  const slug = figure?.slug ?? context.plot?.slug ?? '<slug>'
  return `Working files stay in ${JSON.stringify(context.workFolderPath)}; the paper only gets a figure when I ask. Never copy anything into the manuscript's folder and never edit the manuscript for this yourself. When I say to put the figure in the paper or use it there, run \`node H/cli.mjs figures publish --figure ${slug}\` (it copies the vector PDF next to the manuscript, and updates that copy when I ask you to refresh it); do not run it on your own, not even when a figure is finished.`
}

function manuscriptLine(context: FigurePromptContext): string[] {
  return context.manuscriptPath
    ? [
        `Manuscript: ${JSON.stringify(context.manuscriptPath)}; \`node H/cli.mjs figures context --manuscript ${JSON.stringify(context.manuscriptPath)}\` lists its sections and run-in headings (not the project's default paper).`
      ]
    : []
}

/** What every Figure prompt starts with: the files, the guide, the style and the check loop. */
export function figurePromptHeader(
  context: FigurePromptContext,
  kind: FigurePromptKind = 'whole'
): string[] {
  const { figure } = context
  if (context.plot && !figure) {
    return plotHeaderLines(context.plot, {
      manuscript: manuscriptLine(context),
      paperRule: paperRule(context)
    })
  }
  const page = figure?.page
  return [
    'You are the Figure agent of this research project. Figures are Excalidraw JSON files in',
    `${JSON.stringify(context.workFolderPath)}; as soon as a file is saved, Aster on my computer writes <slug>.svg, <slug>.pdf and the preview in the background (the figure need not be open) and shows the change on its Figures page.`,
    ...(figure
      ? [
          `Figure "${figure.slug}": ${JSON.stringify(figure.scenePath)}.`,
          page
            ? `Page: frame ${page.id}, ${page.widthIn} × ${page.heightIn} in, ${boundsText(page)}. Keep everything inside it.`
            : 'This figure has no page frame; keep it compact.'
        ]
      : []),
    ...manuscriptLine(context),
    ...personEditPromptLines(figure),
    `Before your first drawing in this chat, read the Figures guide: \`aster skills get aster-research-track --section Figures\` prints the version that matches this Aster, over 400 lines: read all of it, in parts if your tool shortens long output (an installed aster-research-track skill may be missing or older; on an older CLI without --section, read the \`## Figures\` part of \`aster skills get aster-research-track\`). Run \`aster research harness-path\` for H. Draw with a script kept at ${JSON.stringify(`${context.folderPath}/src/${figure?.slug ?? '<slug>'}.figure.mjs`)} (committed, so the figure can be regenerated) that starts with \`import { openFigure } from './aster-figures-kit.mjs'\` (a portable shim beside it, never H's absolute path); run it with \`node H/cli.mjs figures run --figure ${figure?.slug ?? '<slug>'}\`, which writes the shim when missing. \`node H/cli.mjs figures kit\` prints an index of the kit's functions and \`figures kit <topic|name>\` their options and defaults; \`figures show\` lists what is there. A data figure (Runs, distributions, trajectories, 3D) is a Python plot instead: \`figures plot new --kind <kind>\`.`,
    ...(kind === 'recreate'
      ? [
          'This figure recreates a reference: keep its colours (as hex), line weights and text sizes; the paper palette does not apply and `figures check` knows it. Use editable shapes, never the reference pasted as one image.'
        ]
      : paperStyleLines(page, context.modes)),
    ...figureModeLines(modeTarget(context), kind),
    paperRule(context),
    'Keep the ids of elements you keep; give new elements new unique ids. Write the whole file back as valid JSON.',
    `After every edit: \`node H/cli.mjs figures check${figure ? ` --figure ${figure.slug}` : ''}\` (fix every ERROR), then \`node H/cli.mjs figures preview${figure ? ` --figure ${figure.slug}` : ''}\`, open the PNG it prints and look at it (and the copy with lint findings boxed in red, when it prints one). After the first render run \`node H/cli.mjs figures critique${figure ? ` --figure ${figure.slug}` : ''}\`: it prints the focus and whether it leads, each colour with its meaning, what is said twice, the size and spacing spread, the box styles and text sizes, then the cuts; make those cuts before any polishing, and critique again after each round. Before you finish, open the print-size PNG it prints too and check every label is still easy to read at that size. Fix what looks wrong and repeat, at most three rounds.`,
    ''
  ]
}

function quickBody(context: FigurePromptContext, request: FigureQuickRequest): string[] {
  const target = context.figure
    ? `into ${JSON.stringify(context.figure.scenePath)}, inside the page frame`
    : 'into a new figure: `node H/cli.mjs figures new --name "Method overview" --size single`, then edit the file it prints'
  switch (request) {
    case 'draw-method': {
      const steps = figureModeSteps(modeTarget(context))
      return [
        `1. Read ${context.manuscriptPath ? JSON.stringify(context.manuscriptPath) : 'the manuscript'} and find the method section (\`figures context${context.manuscriptPath ? ` --manuscript ${JSON.stringify(context.manuscriptPath)}` : ''}\` lists its sections and paragraph headings; ask me if several could be meant; if there is none, say so and what you assumed).`,
        figureBriefStep(modeTarget(context), STRUCTURE_FIRST),
        ...steps.before,
        "3. Pick the layout that makes that data the spine: a sequence through one shared model (a token strip under a wide model bar, outputs above), two branches meeting at their loss (teacher and student), stacked blocks (one block in detail, in a titled panel), encoder → latent → decoder, frames unrolled in time, or masked and unmasked grids side by side. Use the paper's notation on nodes and edges.",
        `4. Draw it ${target} with the kit in the figure's style (\`figures kit\` lists every function; \`figures kit templates\` the common architectures), in the paper look unless I ask otherwise. Show the data with glyphs (tokens with real words and image patches, photo thumbnails, frames, patches with masked cells, features, attention); prefer the project's own sample images, and if it has none, ask me for a few or a dataset folder and use the bundled photos meanwhile. Show the operations that name the method and every term of the objective, each loss over everything it compares (predictions and targets framed apart, meeting only at the loss beside them: \`loss({ predictions, targets })\`), as a name or a short symbol in ink, the full formula going in the caption. Colour by meaning: name the contribution with \`fig.focus([...ids])\` (it alone takes the accent, a 1 pt outline and a larger label) and at most one dimension with \`fig.colourBy\` (trainable vs frozen, modality, stream); every other part stays ink on white whatever palette I chose, frozen ones gray (said in words, "frozen" and "trainable", only when both kinds appear). Say each fact once: a second place refers to it (an arrow, the same colour, a symbol), never the same words, value or picture again. Only for a conceptual teaser drawn as an illustration, \`fig.style('illustrative')\` gives tinted panels, network glyphs, and the paper's one-line message as a coloured callout; method, pipeline and system figures stay in the paper look. Weight follows the contribution: ordinary flow keeps the default data arrow; choose \`role: 'main'\` on purpose for the paper's contribution path (in DiT that is the conditioning, not the residual stream). Put notes and masks beside what they explain. No prose; a legend only as the style lines above allow. If my request conflicts with the method's definition, follow the method and tell me.`,
        `5. Check and preview as above, then critique the preview against this rubric${figureCompareClause(modeTarget(context))}: the idea is clear in five seconds; the concept is drawn, not boxed; the one detail that names the method is drawn; the data is shown, not named; the whole objective is there; one hero, declared with \`fig.focus\` and leading by size or place; colours by meaning as the palette rule says (ink, the accent on the focus, at most one dimension); each fact once; bold only on the contribution path; every arrow straight or one clean elbow, rows and columns aligned and evenly spaced; boxes fit their labels, no empty regions; parts sit beside what they explain; labels clear of arrows and heads; a double-column page you sized yourself at most 2.8 in tall (a page I or Aster set stays as it is: do not ask about its size); every label legible in the print-size PNG. Fix and repeat, then tell me in two sentences what the figure shows and propose its caption (with the full objective, when the figure shows only its name).`,
        ...steps.after
      ]
    }
    case 'clean-up':
      return [
        'Clean up this figure for the paper without changing what it says:',
        '1. Align related boxes and distribute them evenly on an 8-unit grid; give boxes with the same role the same size.',
        "2. One font (fontFamily 9) at 16 for labels; colours by meaning only (the contribution's accent through `fig.focus`, at most one declared dimension through `fig.colourBy`, every other part ink on white; regions white or very light gray; the loss in ink unless it was coloured on purpose; `figures critique` lists what breaks this); strokeWidth 2 for lines and arrows; roughness 0.",
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
    case 'plot-dist':
      return plotQuickBody(request, {
        plot: context.plot ?? null,
        workFolderPath: context.workFolderPath,
        manuscriptPath: context.manuscriptPath
      })
  }
}

const QUICK_VISIBLE: Record<FigureQuickRequest, string> = {
  'draw-method': 'Draw the method section as a diagram.',
  'clean-up': 'Clean up this figure for the paper.',
  sketch: 'Turn my sketch into a clean diagram.',
  plot: 'Plot results from the Runs.',
  'plot-dist': 'Plot a distribution or trajectory.'
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
  start: FigurePromptContext,
  request: FigureQuickRequest,
  sketches: readonly { elementId: string; path: string }[] = [],
  variants = false
): string {
  const sketchLines = sketches.map(
    (sketch) => `   - ${JSON.stringify(sketch.path)} (image element ${sketch.elementId})`
  )
  // Why: three variants already are the alternatives, so careful drawing's sketches stay out.
  const context =
    variants && start.modes ? { ...start, modes: { ...start.modes, careful: null } } : start
  return withAsterContext(
    variants ? `${QUICK_VISIBLE[request]} (three variants)` : QUICK_VISIBLE[request],
    {
      label: contextLabel(context),
      body: [
        ...figurePromptHeader(context),
        ...quickBody(context, request),
        ...figureKeepCompositionLines(modeTarget(context), request),
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
      ...figurePromptHeader(context, 'part'),
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
        ...figurePromptHeader(context, 'part'),
        `Request: ${request.prompt}`,
        `Selected elements (their common box: ${boundsText(request.bounds)}):`,
        ...elementLines(request.selected),
        '1. Change only these elements, and add new ones next to them when the request needs it (e.g. arrows between them). Leave everything else as it is.',
        '2. Run `figures check`, then reply in one sentence with what changed.'
      ].join('\n')
    }
  )
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
    label: contextLabel(context),
    body: [
      ...figurePromptHeader(context, page?.reference ? 'recreate' : 'whole'),
      context.plot && !context.figure
        ? 'For a new plot or a redraw, follow the Data figures part of the skill: write the two-line brief, start from the closest kind, show the data itself, then check the previews at print size.'
        : figureRedrawLine(modeTarget(context), STRUCTURE_FIRST)
    ].join('\n')
  }
}

function contextLabel(context: FigurePromptContext): string {
  return context.figure
    ? `Figure ${context.figure.slug}`
    : context.plot
      ? `Plot ${context.plot.slug}`
      : 'Figures'
}

/** What the agent must hear about again: another figure or plot, page size, style or reference. */
export function figureContextKey(context: FigurePromptContext): string {
  const page = context.figure?.page
  return [
    context.figure?.scenePath ?? context.plot?.scriptPath ?? context.folderPath,
    page ? `${page.widthIn}x${page.heightIn}` : '',
    page?.style ?? '',
    page?.accent ?? '',
    page?.reference ?? '',
    figureModesKey(context.modes),
    (context.figure?.personEdits ?? []).join('\n')
  ].join('|')
}
