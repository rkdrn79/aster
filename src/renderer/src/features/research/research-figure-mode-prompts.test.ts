import { describe, expect, it } from 'vitest'
import { splitAsterContext } from '../../../../shared/aster-context-block'
import {
  FIGURE_CAREFUL_RULE,
  FIGURE_CONCEPT_RULE,
  FIGURE_HYBRID_RULE,
  FIGURE_PINNED_REFERENCES_RULE,
  FIGURE_REFERENCE_RULE,
  FIGURE_REFERENCES_OFF_RULE
} from '../../../../research-harness/research-figures-style-rules.mjs'
import {
  buildFigureAreaPrompt,
  buildFigureMessageContext,
  buildFigureQuickPrompt,
  buildFigureSelectionPrompt,
  figureContextKey,
  type FigurePromptContext
} from './research-figures-agent-prompts'
import { buildFigureRecreatePrompt } from './research-figure-recreate-prompt'
import type { FigurePromptModes } from './research-figure-reference-library'

const base: FigurePromptContext = {
  folderPath: '/home/me/proj/.aster/figures',
  workFolderPath: '/home/me/proj/.aster/figures',
  manuscriptPath: '/home/me/proj/paper/main.tex',
  figure: {
    slug: 'method',
    scenePath: '/home/me/proj/.aster/figures/method.excalidraw',
    page: {
      id: 'figure-page',
      widthIn: 6.75,
      heightIn: 2.5,
      reference: null,
      style: null,
      accent: null,
      x: 0,
      y: 0,
      width: 972,
      height: 360
    }
  }
}

function body(prompt: string): string {
  return (splitAsterContext(prompt)?.contexts ?? []).map((entry) => entry.body).join('\n')
}

function modes(careful: boolean, references: boolean, concept: boolean): FigurePromptModes {
  return {
    careful: careful ? { rounds: 5, pick: 'agent' } : null,
    references: references ? { pinned: [], library: null } : null,
    concept
  }
}

const COMBINATIONS = [false, true].flatMap((careful) =>
  [false, true].flatMap((references) =>
    [false, true].map((concept) => ({ careful, references, concept }))
  )
)

describe('every combination of the Figure agent switches', () => {
  it.each(COMBINATIONS)(
    'careful $careful, references $references, concept $concept: the draw request and the chat context agree',
    ({ careful, references, concept }) => {
      const context = { ...base, modes: modes(careful, references, concept) }
      const draw = body(buildFigureQuickPrompt(context, 'draw-method'))
      const chat = buildFigureMessageContext(context).body
      const summary = `The person's switches for this project: careful drawing ${careful ? 'on (N = 5 art director rounds; you pick the sketch)' : 'off'}, references ${references ? 'on' : 'off'}, concept image ${concept ? 'on (experimental)' : 'off'}.`
      for (const text of [draw, chat]) {
        expect(text).toContain(summary)
        expect(text.includes(FIGURE_CAREFUL_RULE)).toBe(careful)
        expect(text.includes(FIGURE_CONCEPT_RULE)).toBe(concept)
        expect(text.includes(FIGURE_REFERENCE_RULE)).toBe(references)
        expect(text.includes(FIGURE_REFERENCES_OFF_RULE)).toBe(!references)
        expect(text.includes('node H/cli.mjs figures refs')).toBe(references)
        expect(text.includes('/home/me/proj/.aster/figures/references/method-concept.png')).toBe(
          concept
        )
      }
      expect(draw.includes('2b. Careful drawing')).toBe(careful)
      expect(draw.includes('6. Then run the 5 art director rounds')).toBe(careful)
      expect(draw.includes('2a. Concept image')).toBe(concept)
      // Why: with careful drawing the concept is one sketch candidate, never the only path.
      expect(draw.includes("one of them the concept image's composition")).toBe(careful && concept)
      expect(draw.includes('it is one of the sketches in 2b, not the plan')).toBe(
        careful && concept
      )
      expect(draw.includes('against the reference you follow')).toBe(references)
      expect(draw.includes('2. References are off')).toBe(!references)
      expect(chat.includes('sketch 3–4 compositions and pick one')).toBe(careful)
      expect(chat.includes('"no reference": references are off')).toBe(!references)
    }
  )

  it.each([false, true])(
    'careful %s, concept as hybrid art: the hybrid rule, the art folder and its step, never the redraw',
    (careful) => {
      const context = {
        ...base,
        modes: { ...modes(careful, true, true), conceptStyle: 'hybrid' as const }
      }
      const draw = body(buildFigureQuickPrompt(context, 'draw-method'))
      const chat = buildFigureMessageContext(context).body
      for (const text of [draw, chat]) {
        expect(text).toContain(
          'concept image on (experimental, hybrid: generated art + vector text)'
        )
        expect(text).toContain(FIGURE_HYBRID_RULE)
        expect(text.includes(FIGURE_CONCEPT_RULE)).toBe(false)
        expect(text).toContain('"/home/me/proj/.aster/figures/art/method/"')
        expect(text).toContain('figures art --figure method --part <part> --gen')
      }
      expect(draw).toContain('2a. Hybrid art')
      expect(draw.includes('(the chosen sketch)')).toBe(careful)
      expect(draw.includes("one of them the concept image's composition")).toBe(false)
      expect(figureContextKey(context)).not.toBe(
        figureContextKey({ ...base, modes: modes(careful, true, true) })
      )
    }
  )

  it('gives every combination its own context key, so a typed message hears a change', () => {
    const keys = COMBINATIONS.map(({ careful, references, concept }) =>
      figureContextKey({ ...base, modes: modes(careful, references, concept) })
    )
    expect(new Set(keys).size).toBe(COMBINATIONS.length)
  })

  it.each(COMBINATIONS)(
    'careful $careful, concept $concept: an area or a selection change stays one pass',
    ({ careful, references, concept }) => {
      const context = { ...base, modes: modes(careful, references, concept) }
      const area = body(
        buildFigureAreaPrompt(context, {
          prompt: 'draw the encoder',
          area: { id: 'area-1', name: 'encoder', x: 0, y: 0, width: 100, height: 100 },
          touching: [],
          neighbours: [],
          sketches: []
        })
      )
      const selection = body(
        buildFigureSelectionPrompt(context, {
          prompt: 'align',
          selected: [],
          bounds: { x: 0, y: 0, width: 10, height: 10 }
        })
      )
      for (const text of [area, selection]) {
        expect(text).not.toContain(FIGURE_CAREFUL_RULE)
        expect(text).not.toContain(FIGURE_CONCEPT_RULE)
        expect(text.includes('apply to whole figures, not to this change')).toBe(careful || concept)
        expect(text.includes(FIGURE_REFERENCES_OFF_RULE)).toBe(!references)
      }
    }
  )
})

describe('the switches in detail', () => {
  it('passes the reference folder and the pins to figures refs, with the pinned rule', () => {
    const context = {
      ...base,
      modes: {
        careful: null,
        references: { pinned: ['nerf', 'my-teaser'], library: '/Users/me/refs' },
        concept: false
      }
    }
    const draw = body(buildFigureQuickPrompt(context, 'draw-method'))
    expect(draw).toContain(
      'node H/cli.mjs figures refs --figure method --library "/Users/me/refs" --pin nerf,my-teaser --for'
    )
    expect(draw).toContain(FIGURE_PINNED_REFERENCES_RULE)
    expect(draw).toContain('references on; pinned: nerf, my-teaser')
  })

  it('says the person picks the sketch and the rounds they chose', () => {
    const context = {
      ...base,
      modes: { careful: { rounds: 3, pick: 'person' as const }, references: null, concept: false }
    }
    const draw = body(buildFigureQuickPrompt(context, 'draw-method'))
    expect(draw).toContain('Here N = 3. The person picks the sketch')
    expect(draw).toContain('figures careful --figure method --start --rounds 3')
    expect(draw).toContain('6. Then run the 3 art director rounds')
  })

  it('keeps the composition of Clean up and Turn my sketch: rounds only, no sketches', () => {
    const context = { ...base, modes: modes(true, true, false) }
    for (const request of ['clean-up', 'sketch'] as const) {
      const text = body(buildFigureQuickPrompt(context, request))
      expect(text).toContain('Careful drawing for this request: no sketches')
      expect(text).toContain('run the 5 art director rounds')
    }
    expect(
      body(buildFigureQuickPrompt({ ...base, modes: modes(false, true, false) }, 'clean-up'))
    ).not.toContain('Careful drawing for this request')
  })

  it('leaves careful drawing out of a request for three variants', () => {
    const context = { ...base, modes: modes(true, true, false) }
    const variants = body(buildFigureQuickPrompt(context, 'draw-method', [], true))
    expect(variants).not.toContain(FIGURE_CAREFUL_RULE)
    expect(variants).toContain('careful drawing off')
  })

  it('keeps a recreation free of the switches', () => {
    const context = { ...base, modes: modes(true, false, true) }
    const recreate = body(
      buildFigureRecreatePrompt(context, {
        referencePath: '/home/me/proj/.aster/figures/references/method.png',
        pixels: { width: 1000, height: 400 }
      })
    )
    expect(recreate).not.toContain("The person's switches")
    expect(recreate).not.toContain(FIGURE_CAREFUL_RULE)
  })

  it('keeps the reference step for a prompt built without switches', () => {
    const draw = body(buildFigureQuickPrompt(base, 'draw-method'))
    expect(draw).toContain(FIGURE_REFERENCE_RULE)
    expect(draw).not.toContain("The person's switches")
    expect(figureContextKey(base).endsWith('|')).toBe(true)
  })
})
