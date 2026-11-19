// What the Figure agent hears about plots (Python data figures drawn with aster_plot.py): the
// open plot's files, the plot commands, and the two plot quick requests.

/** Quick requests that make or edit a plot (a Python data figure) rather than a diagram. */
export const PLOT_QUICK_REQUESTS: ReadonlySet<string> = new Set(['plot', 'plot-dist'])
/** Quick requests that need no open diagram: they start a figure or a plot themselves. */
export const FIGURE_REQUESTS_WITHOUT_FIGURE: ReadonlySet<string> = new Set([
  'draw-method',
  'plot',
  'plot-dist'
])

/** Absolute paths on the project's host of an open plot's files (aster_plot contract). */
export type FigurePlotContext = {
  slug: string
  /** `<figures>/src/<slug>.plot.py`, the source of truth. */
  scriptPath: string
  pngPath: string
  pdfPath: string
  manifestPath: string
}

/** How a plot is made to look like the paper's diagrams; aster_plot keeps most of it. */
export const PLOT_STYLE_LINE =
  'Paper style, kept by aster_plot: the true page size (`ap.panels(..., size="single"|"double", height=...)`, 3.25 or 6.75 in wide; never bbox_inches="tight"), 8 pt labels and 7 pt ticks and legends (nothing under 6 pt), ours in the accent (`ap.color("ours")`), the one compared baseline in the given hue and other baselines gray (bars hatched); lines of several methods each in its own hue (`ap.series`, four hues at most), never grays told apart only by dashes; one meaning per hue, perceptual colour maps (`ap.cmap("seq")`, never jet), no title (the caption carries it), labelled axes with units, several plots in one figure as panels of one `ap.panels` layout with (a)/(b) labels and one shared legend.'

/** The checks after each edit of a plot, the same loop as a diagram's. */
export function plotCheckLine(slug: string): string {
  return `After every edit: \`node H/cli.mjs figures plot run --figure ${slug}\` (it finds a Python with numpy and matplotlib, on this computer or the SSH host, or says how to install one), then \`figures plot check --figure ${slug}\` (fix every ERROR and the warnings you can) and \`figures plot preview --figure ${slug}\`: open the PNG, the print-size PNG, and the lint PNG when it prints one, and look. Fix what looks wrong and repeat, at most three rounds.`
}

/** What the agent hears with a plot open: its files, the commands and the style. */
export function plotHeaderLines(
  plot: FigurePlotContext,
  parts: { manuscript: readonly string[]; paperRule: string }
): string[] {
  return [
    'You are the Figure agent of this research project. Data figures (plots) are Python scripts that draw with aster_plot.py (numpy and matplotlib), kept beside them; Aster shows the PNG each run writes on its Figures page.',
    `Plot "${plot.slug}": script ${JSON.stringify(plot.scriptPath)}, the source of truth (committed). Running it writes ${JSON.stringify(plot.pdfPath)} (vector, page-true), its SVGs, ${JSON.stringify(plot.pngPath)} and ${JSON.stringify(plot.manifestPath)} (size, panels and what the checks found); never write those yourself.`,
    ...parts.manuscript,
    `Before your first plot in this chat, read the Figures guide, its Data figures part above all: \`aster skills get aster-research-track --section Figures\` (read all of it, in parts if your tool shortens long output). Run \`aster research harness-path\` for H. \`node H/cli.mjs figures plot kit\` lists aster_plot's functions with their options and the starter kinds; \`figures plot style\` the colours.`,
    PLOT_STYLE_LINE,
    parts.paperRule,
    plotCheckLine(plot.slug),
    ''
  ]
}

type PlotRequestInput = {
  plot: FigurePlotContext | null
  workFolderPath: string
  manuscriptPath: string | null
}

/** Where a plot request draws: the open plot's script, or a new one from a starter kind. */
function plotTarget(input: PlotRequestInput, kind: string): string {
  return input.plot
    ? `Edit the open plot's script, ${JSON.stringify(input.plot.scriptPath)}, unless I ask for a new one.`
    : `Start a plot: \`node H/cli.mjs figures plot new --name "<name>" --kind ${kind} --size single|double\` writes ${JSON.stringify(`${input.workFolderPath}/src/<slug>.plot.py`)} from a finished demo, with aster_plot.py beside it; swap in the project's data.`
}

/** The steps of Plot from Runs and of Plot a distribution or trajectory. */
export function plotQuickBody(request: 'plot' | 'plot-dist', input: PlotRequestInput): string[] {
  if (request === 'plot') {
    return [
      `1. Find the Runs and metrics to plot with \`node H/cli.mjs context --json\` and \`node H/cli.mjs run show <ref>\` (each Run's metrics.jsonl). Ask me which Runs and metric if it is not clear.`,
      `2. ${plotTarget(input, 'runs')} The runs starter reads metrics.jsonl files with \`ap.load_runs\` (mean ± std over seeds); use curves, bars, heat or results (\`figures plot kit\` lists the kinds) when the comparison needs another form. Point it at the Runs, relative to the script.`,
      `3. ${PLOT_STYLE_LINE}`,
      `4. ${plotCheckLine(input.plot?.slug ?? '<slug>')}`,
      '5. Tell me in two sentences what it shows and propose its caption. When I ask to put it in the paper, run `node H/cli.mjs figures publish --figure <slug>` and reply with its \\includegraphics line.'
    ]
  }
  return [
    `1. From my request and ${input.manuscriptPath ? JSON.stringify(input.manuscriptPath) : 'the manuscript'}, decide what the figure must show and write a two-line brief in the chat: the one comparison a reader must see in five seconds, and the data (the project's own samples, paths or checkpoints; when there are none yet, seeded toy data standing in, and say so).`,
    `2. ${plotTarget(input, 'teaser')} Pick the closest kind: trajectories (ODE vs SDE, straight vs curved flow paths), teaser (noise to data along t), sampling (1D paths with density profiles), landscape (optimisation paths), field, density (2D contours, a mixture, a joint plot with marginals), distributions (density, histogram, violin, box, ECDF, ridgeline), surface (a 3D loss surface with its path), manifold (point clouds, a manifold sheet, a sphere with geodesics); 4D: fourd (3D coloured by a 4th variable), snapshots3d (3D along t), trajectories3d (3D paths coloured by time, motion trails), slices (z-slices × t), embedding (projections, parallel coordinates); results from Runs: runs, curves, bars, heat, results. \`figures plot kit\` lists them with every helper's options.`,
    '3. Several plots that make one point go in one figure: one `ap.panels("ab;cc", ...)` layout (3D, joint, polar and legend cells mix with 2D ones; `p.inset` for a zoom), (a)/(b) labels and one shared legend. Show the distribution itself (contours at highest-density levels, fading paths with start and end marks), not a box naming it.',
    `4. ${PLOT_STYLE_LINE}`,
    `5. ${plotCheckLine(input.plot?.slug ?? '<slug>')}`,
    '6. Tell me in two sentences what it shows and propose its caption. When I ask to put it in the paper, run `node H/cli.mjs figures publish --figure <slug>`.'
  ]
}
