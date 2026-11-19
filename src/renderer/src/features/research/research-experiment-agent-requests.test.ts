import { describe, expect, it } from 'vitest'
import { splitAsterContext } from '../../../../shared/aster-context-block'
import type { AgentReviewSetup } from './research-agent-review-prompt'
import {
  experimentChatIntro,
  experimentDesignGuideLine
} from './research-experiment-agent-requests'

const setup: AgentReviewSetup = {
  projectPath: '/work/paper',
  experiment: 'tidemark-experiments',
  experimentName: 'Tidemark experiments',
  cli: '/app/research-harness/cli.mjs',
  trackSkill: '/app/research-harness/track/SKILL.md',
  brief: null,
  briefError: null
}

describe('experiment design guide in the Experiment agent prompts', () => {
  it('names the version-matched section and the bundled file as a fallback', () => {
    const line = experimentDesignGuideLine(setup)
    expect(line).toContain('`aster skills get aster-research-track --section "Experiment design"`')
    expect(line).toContain(
      '`## Experiment design` section of "/app/research-harness/track/SKILL.md"'
    )
  })

  it('tells a new Experiment chat how to plan a set of experiments', () => {
    const intro = experimentChatIntro(
      setup,
      'Tidemark experiments',
      'Design the experiments for this paper.'
    )
    const split = splitAsterContext(intro)
    expect(split?.request).toBe('Design the experiments for this paper.')
    const role = split?.contexts[0]?.body ?? ''
    expect(role).toContain('plan them above this Experiment as an experiment plan')
    expect(role).toContain('reviewer pre-mortem, then `plan submit` for my approval')
    expect(role).toContain('--section "Experiment design"')
  })
})
