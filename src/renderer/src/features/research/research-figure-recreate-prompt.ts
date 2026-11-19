// The prompt that recreates a published figure as it is, with editable shapes.
import { withAsterContext } from '../../../../shared/aster-context-block'
import { figurePromptHeader, type FigurePromptContext } from './research-figures-agent-prompts'

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
      ...figurePromptHeader(context, 'recreate'),
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
