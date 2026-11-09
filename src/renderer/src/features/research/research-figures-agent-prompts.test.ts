import { describe, expect, it } from 'vitest'
import { splitAsterContext } from '../../../../shared/aster-context-block'
import {
  buildFigureAreaPrompt,
  buildFigureRecreatePrompt,
  buildFigureQuickPrompt,
  buildFigureSelectionPrompt,
  type FigurePromptContext
} from './research-figures-agent-prompts'

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
      "an overview, teaser, motivation, conceptual or data-pipeline figure takes 'illustrative'"
    )
    expect(prompt.context).toContain(
      'a match link, or the full formula only when the formula is the point), in ink; colour only if asked'
    )
    expect(prompt.context).toContain(
      'a data pipeline (`pipeline` with counts and examples per stage)'
    )
    expect(prompt.context).not.toContain('dark-red')
    expect(prompt.context).not.toContain('red nowhere else')
    expect(prompt.context).toContain('16 (8 pt) for labels')
    expect(prompt.context).toContain("main (dark, 1.25 pt) only for the paper's contribution path")
    expect(prompt.context).toContain('only horizontally and vertically')
    expect(prompt.context).toContain(
      'flame and snowflake badges only when the figure mixes the two'
    )
    expect(prompt.context).toContain('open the print-size PNG')
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

  it('names the manuscript and figure files in quick actions', () => {
    const draw = body(buildFigureQuickPrompt(context, 'draw-method'))
    expect(draw.context).toContain('Read "/home/me/proj/paper/main.tex"')
    expect(draw.context).toContain('into "/home/me/proj/.aster/figures/method.excalidraw"')
    expect(draw.context).toContain('three-line design brief')
    expect(draw.context).toContain('the data is shown, not named')
    expect(draw.context).toContain('every term of the objective')
    expect(draw.context).toContain('follow the method and tell me')
    expect(draw.context).toContain("choose `role: 'main'` on purpose")
    expect(draw.context).toContain('loss({ predictions, targets })')
    expect(draw.context).toContain('figures context --manuscript "/home/me/proj/paper/main.tex"')
    expect(draw.context).toContain("fig.style('illustrative')")
    expect(draw.context).toContain('figures kit')
    expect(draw.context).not.toContain('one box per stage')
    expect(draw.context).toContain('"/home/me/proj/.aster/figures/src/method.figure.mjs"')
    const plot = body(buildFigureQuickPrompt({ ...context, figure: null }, 'plot'))
    expect(plot.context).toContain('"/home/me/proj/.aster/figures/<name>.py"')
    expect(plot.context).toContain('"/home/me/proj/.aster/figures/<name>.pdf"')
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
    expect(plot.context).toContain('figures publish --figure <name>')
    expect(plot.context).not.toContain('Reply with the \\includegraphics line for the manuscript')
    const figure = { ...context.figure!, besideManuscript: true }
    const beside = body(buildFigureQuickPrompt({ ...context, figure }, 'clean-up'))
    expect(beside.context).toContain('lives beside the manuscript')
    expect(beside.context).not.toContain('figures publish')
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
