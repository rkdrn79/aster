import { describe, expect, it } from 'vitest'
import { splitAsterContext } from '../../../../shared/aster-context-block'
import { plotStartPrompt } from './research-figure-chat-send'
import { buildFigureQuickPrompt, type FigurePromptContext } from './research-figures-agent-prompts'

const context: FigurePromptContext = {
  folderPath: '/p/.aster/figures',
  workFolderPath: '/p/.aster/figures',
  manuscriptPath: null,
  figure: null
}

describe('the New figure plot start', () => {
  it("carries the person's words, the slug and the size to the agent", () => {
    const prompt = plotStartPrompt(buildFigureQuickPrompt(context, 'plot-dist'), {
      slug: 'flows',
      words: 'ODE vs SDE paths side by side',
      size: '6.75x2.5'
    })
    const parsed = splitAsterContext(prompt)
    expect(parsed?.request).toBe(
      'Plot: ODE vs SDE paths side by side Make it as the plot flows: `node H/cli.mjs figures plot new --name "flows" --slug flows --kind <kind> --size 6.75x2.5`.'
    )
    expect(parsed?.contexts[0].body).toContain('Pick the closest kind')
    expect(parsed?.contexts[0].body).toContain('slices (z-slices × t)')
  })

  it('without words it plots results from the Runs', () => {
    const prompt = plotStartPrompt(buildFigureQuickPrompt(context, 'plot'), {
      slug: null,
      words: '',
      size: null
    })
    expect(splitAsterContext(prompt)?.request).toBe('Plot results from the Runs.')
    expect(prompt).toContain('--kind runs')
  })
})
