import { describe, expect, it } from 'vitest'
import { splitAsterContext } from '../../../../shared/aster-context-block'
import { FIGURE_REQUESTS_WITHOUT_FIGURE, PLOT_QUICK_REQUESTS } from './research-figure-plot-prompts'
import {
  FIGURE_COLOUR_RULE,
  FIGURE_EXAMPLES_RULE,
  FIGURE_LEGEND_RULE,
  FIGURE_PAPER_RULE,
  FIGURE_SMALL_PAGE_RULE
} from '../../../../research-harness/research-figures-style-rules.mjs'
import {
  FIGURE_QUICK_ACTIONS,
  buildFigureAreaPrompt,
  buildFigureMessageContext,
  buildFigureQuickPrompt,
  buildFigureSelectionPrompt,
  figureContextKey,
  type FigurePromptContext
} from './research-figures-agent-prompts'
import { buildFigureRecreatePrompt } from './research-figure-recreate-prompt'

const context: FigurePromptContext = {
  folderPath: '/home/me/proj/.aster/figures',
  workFolderPath: '/home/me/proj/.aster/figures',
  manuscriptPath: '/home/me/proj/paper/main.tex',
  figure: {
    slug: 'method',
    scenePath: '/home/me/proj/.aster/figures/method.excalidraw',
    page: {
      id: 'figure-page',
      widthIn: 3.25,
      heightIn: 2,
      reference: null,
      style: null,
      accent: null,
      x: 0,
      y: 0,
      width: 468,
      height: 288
    }
  }
}

function body(prompt: string): { request: string; context: string } {
  const parsed = splitAsterContext(prompt)
  if (!parsed) {
    throw new Error('no context block')
  }
  return { request: parsed.request, context: parsed.contexts.map((entry) => entry.body).join('\n') }
}

describe('Figure agent prompts', () => {
  it('sends an area with its frame id, exact bounds, neighbors and sketches', () => {
    const prompt = body(
      buildFigureAreaPrompt(context, {
        prompt: 'an attention block',
        area: {
          id: 'area-7',
          name: 'an attention block',
          x: 120.04,
          y: 40,
          width: 200,
          height: 96
        },
        touching: [{ id: 'box-1', type: 'rectangle', label: 'Encoder', frameId: null }],
        neighbours: [
          { id: 'in-x', type: 'rectangle', label: 'Input X', x: 20, y: 60, width: 80, height: 56 }
        ],
        sketches: [
          { elementId: 'img-1', path: '/home/me/proj/.aster/figures/sketches/method-img-1.png' }
        ]
      })
    )
    expect(prompt.request).toBe('Fill the area "an attention block": an attention block')
    expect(prompt.context).toContain('"/home/me/proj/.aster/figures/method.excalidraw"')
    expect(prompt.context).toContain('frame id "area-7", x=120 y=40 width=200 height=96')
    expect(prompt.context).toContain('box-1 rectangle "Encoder"')
    expect(prompt.context).toContain('sketches/method-img-1.png" (image element img-1)')
    expect(prompt.context).toContain('"frameId": "area-7"')
    expect(prompt.context).toContain('in-x rectangle "Input X" x=20 y=60 width=80 height=56')
    expect(prompt.context).toContain('figures check --area area-7')
    expect(prompt.context).toContain('figures preview --figure method')
    expect(prompt.context).toContain('Page: frame figure-page, 3.25 × 2 in')
    expect(prompt.context).toContain('Style: nobody chose one, so Aster\'s default "graphite"')
    expect(prompt.context).toContain(
      "a method, architecture, pipeline or system figure takes the paper's world palette"
    )
    expect(prompt.context).not.toContain('a method block diagram stays graphite')
    expect(prompt.context).toContain(
      'a match link, or the full formula only when the formula is the point), in ink; colour only if asked'
    )
    expect(prompt.context).toContain(
      'a data pipeline (`pipeline` with counts and examples per stage)'
    )
    expect(prompt.context).not.toContain('dark-red')
    expect(prompt.context).not.toContain('red nowhere else')
    expect(prompt.context).toContain('16 (8 pt) for labels')
    expect(prompt.context).toContain("main (ink) only for the paper's contribution path")
    expect(prompt.context).toContain('only horizontally and vertically')
    expect(prompt.context).toContain(
      'said in words ("frozen", "trainable": `fig.frozen`, `fig.trainable`) only when the figure mixes the two'
    )
    expect(prompt.context).toContain('open the print-size PNG')
    // The design layer: the focus alone takes the accent, and a critique pass comes before polish.
    expect(prompt.context).toContain(
      'Only the declared focus (`fig.focus`, the contribution) takes the accent'
    )
    expect(prompt.context).toContain('figures critique --figure method')
    expect(prompt.context).toContain("Each fact appears once; refer, don't repeat")
    expect(prompt.context).not.toContain('each module type its own hue')
  })

  it('keeps a style the person chose, and lets the agent pick by genre otherwise', () => {
    const page = context.figure!.page!
    const chosen = (styleBy: 'person' | 'agent') =>
      body(
        buildFigureQuickPrompt(
          {
            ...context,
            figure: { ...context.figure!, page: { ...page, style: 'slate', styleBy } }
          },
          'clean-up'
        )
      ).context
    expect(chosen('person')).toContain('Style: "slate"')
    expect(chosen('person')).toContain('chosen by the person: keep it')
    expect(chosen('agent')).toContain('picked by the Figure agent earlier')
  })

  it('states the same palette, legend, small-page and examples rules as the Figures guide', () => {
    const page = context.figure!.page!
    const draw = (size: { widthIn: number; heightIn: number }) =>
      body(
        buildFigureQuickPrompt(
          { ...context, figure: { ...context.figure!, page: { ...page, ...size } } },
          'draw-method'
        )
      ).context
    const small = draw({ widthIn: 3.25, heightIn: 1.6 })
    for (const rule of [
      FIGURE_PAPER_RULE,
      FIGURE_COLOUR_RULE,
      FIGURE_LEGEND_RULE,
      FIGURE_EXAMPLES_RULE
    ]) {
      expect(small).toContain(rule)
    }
    expect(small).toContain(FIGURE_SMALL_PAGE_RULE)
    expect(draw({ widthIn: 6.75, heightIn: 2.6 })).not.toContain(FIGURE_SMALL_PAGE_RULE)
    expect(small).not.toContain('at most three hues')
    expect(small).not.toContain('no legend:')
  })

  it('names the manuscript and figure files in quick actions', () => {
    const draw = body(buildFigureQuickPrompt(context, 'draw-method'))
    expect(draw.context).toContain('Read "/home/me/proj/paper/main.tex"')
    expect(draw.context).toContain('into "/home/me/proj/.aster/figures/method.excalidraw"')
    expect(draw.context).toContain('a design brief in the chat: the reference you follow')
    expect(draw.context).toContain('figures refs --figure method --for')
    expect(draw.context).toContain('beside its image')
    expect(draw.context).toContain('the data is shown, not named')
    expect(draw.context).toContain('every term of the objective')
    expect(draw.context).toContain('follow the method and tell me')
    expect(draw.context).toContain("choose `role: 'main'` on purpose")
    expect(draw.context).toContain('loss({ predictions, targets })')
    expect(draw.context).toContain('figures context --manuscript "/home/me/proj/paper/main.tex"')
    expect(draw.context).toContain("fig.style('illustrative')")
    expect(draw.context).toContain('list the key structure from the text')
    expect(draw.context).toContain('fig.structure({ loops, fanouts, skips, feedback, text })')
    expect(draw.context).toContain('figures kit')
    // Why: hosts may have no installed skill, or an old one; the CLI serves the matching guide.
    expect(draw.context).toContain('`aster skills get aster-research-track --section Figures`')
    expect(draw.context).not.toContain('one box per stage')
    expect(draw.context).toContain('"/home/me/proj/.aster/figures/src/method.figure.mjs"')
    const plot = body(buildFigureQuickPrompt({ ...context, figure: null }, 'plot'))
    expect(plot.context).toContain('figures plot new --name "<name>" --kind runs')
    expect(plot.context).toContain('"/home/me/proj/.aster/figures/src/<slug>.plot.py"')
    expect(plot.context).toContain('ap.load_runs')
    expect(plot.context).toContain('figures plot check --figure <slug>')
    const fresh = body(buildFigureQuickPrompt({ ...context, figure: null }, 'draw-method'))
    expect(fresh.context).toContain('figures new --name')
    const sketch = body(
      buildFigureQuickPrompt(context, 'sketch', [{ elementId: 'i', path: '/p/sketch.png' }])
    )
    expect(sketch.context).toContain('"/p/sketch.png" (image element i)')
  })

  it('tells the agent the paper only gets a figure when the person asks', () => {
    const draw = body(buildFigureQuickPrompt(context, 'draw-method'))
    expect(draw.context).toContain('the paper only gets a figure when I ask')
    expect(draw.context).toContain('figures publish --figure method')
    expect(draw.context).toContain('do not run it on your own')
    const plot = body(buildFigureQuickPrompt({ ...context, figure: null }, 'plot'))
    expect(plot.context).toContain('figures publish --figure <slug>')
    expect(plot.context).not.toContain('Reply with the \\includegraphics line for the manuscript')
    const figure = { ...context.figure!, besideManuscript: true }
    const beside = body(buildFigureQuickPrompt({ ...context, figure }, 'clean-up'))
    expect(beside.context).toContain('lives beside the manuscript')
    expect(beside.context).not.toContain('figures publish')
  })

  it('plots: a request for a distribution or trajectory starts from the closest kind', () => {
    const fresh = body(buildFigureQuickPrompt({ ...context, figure: null }, 'plot-dist'))
    expect(fresh.request).toBe('Plot a distribution or trajectory.')
    expect(fresh.context).toContain('figures plot new --name "<name>" --kind teaser')
    expect(fresh.context).toContain('trajectories (ODE vs SDE, straight vs curved flow paths)')
    expect(fresh.context).toContain('ap.panels("ab;cc", ...)')
    expect(fresh.context).toContain('two-line brief')
    expect(fresh.context).toContain('never jet')
    expect(fresh.context).not.toMatch(/colou?r-blind|deuteranop|grayscale/i)
    expect(fresh.context).toContain('never grays told apart only by dashes')
    expect(fresh.context).toContain('figures publish --figure <slug>')
  })

  it('plots: with a plot open the agent hears its script and the plot commands', () => {
    const open: FigurePromptContext = {
      ...context,
      figure: null,
      plot: {
        slug: 'flow',
        scriptPath: '/home/me/proj/.aster/figures/src/flow.plot.py',
        pngPath: '/home/me/proj/.aster/figures/flow.png',
        pdfPath: '/home/me/proj/.aster/figures/flow.pdf',
        manifestPath: '/home/me/proj/.aster/figures/flow.plot.json'
      }
    }
    const dist = body(buildFigureQuickPrompt(open, 'plot-dist'))
    expect(dist.context).toContain(
      `Plot "flow": script "/home/me/proj/.aster/figures/src/flow.plot.py"`
    )
    expect(dist.context).toContain("Edit the open plot's script")
    expect(dist.context).toContain('figures plot run --figure flow')
    expect(dist.context).toContain('figures publish --figure flow')
    expect(dist.context).not.toContain('Excalidraw')
    expect(dist.context).not.toContain('figures plot new --name')
    const typed = buildFigureMessageContext(open)
    expect(typed.label).toBe('Plot flow')
    expect(typed.key).toContain('flow.plot.py')
    expect(typed.body).toContain('Data figures part of the skill')
    expect(figureContextKey(open)).not.toBe(figureContextKey({ ...open, plot: null }))
    expect(FIGURE_REQUESTS_WITHOUT_FIGURE.has('plot-dist')).toBe(true)
    expect(FIGURE_REQUESTS_WITHOUT_FIGURE.has('clean-up')).toBe(false)
    expect(PLOT_QUICK_REQUESTS.has('plot')).toBe(true)
    expect(FIGURE_QUICK_ACTIONS.map((action) => action.request)).toContain('plot-dist')
    const diagram = body(buildFigureQuickPrompt(context, 'draw-method'))
    expect(diagram.context).toContain('is a Python plot instead: `figures plot new --kind <kind>`')
  })

  it('lists the selected elements and their common box', () => {
    const prompt = body(
      buildFigureSelectionPrompt(context, {
        prompt: 'add arrows between these',
        selected: [
          { id: 'a', type: 'rectangle', label: 'Encoder', frameId: null },
          { id: 'b', type: 'rectangle', label: 'Decoder', frameId: 'area-7' }
        ],
        bounds: { x: 10, y: 20, width: 300, height: 60 }
      })
    )
    expect(prompt.request).toBe('About the 2 selected elements: add arrows between these')
    expect(prompt.context).toContain('x=10 y=20 width=300 height=60')
    expect(prompt.context).toContain('b rectangle "Decoder" (frame area-7)')
  })

  it('recreates a reference at its scale, with its colours, comparing previews to it', () => {
    const prompt = body(
      buildFigureRecreatePrompt(context, {
        referencePath: '/home/me/proj/.aster/figures/references/method.png',
        pixels: { width: 936, height: 576 }
      })
    )
    expect(prompt.request).toBe('Recreate this reference figure as it is.')
    expect(prompt.context).toContain('references/method.png" (936 × 576 px)')
    expect(prompt.context).toContain('one reference pixel is 0.5 units')
    expect(prompt.context).toContain('the paper palette does not apply')
    expect(prompt.context).not.toContain('Style: "graphite"')
    expect(prompt.context).toContain('Open the compare PNG')
    expect(prompt.context).toContain('figures reference')
    expect(prompt.context).toContain('fig.reset()')
  })

  it('writes the reference scale as a short decimal', () => {
    // A 468-unit page over a 307 px reference: 1.52443… units per pixel.
    const prompt = body(
      buildFigureRecreatePrompt(context, {
        referencePath: '/home/me/proj/.aster/figures/references/dit.png',
        pixels: { width: 307, height: 497 }
      })
    )
    expect(prompt.context).toContain('one reference pixel is 1.5244 units')
    expect(prompt.context).toContain('reference position × 1.5244.')
  })
})
