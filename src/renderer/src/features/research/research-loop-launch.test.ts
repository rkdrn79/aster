import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/launch-agent-in-new-tab', () => ({ launchAgentInNewTab: vi.fn() }))

const { researchLoopPrompt } = await import('./research-loop-launch')

describe('research loop prompt', () => {
  it('works for an agent without the skills installed and states the whole contract', () => {
    const prompt = researchLoopPrompt(
      {
        directory: '/Apps/Aster/research-harness',
        cli: '/Apps/Aster/research-harness/cli.mjs',
        loopSkill: '/Apps/Aster/research-harness/loop/SKILL.md',
        trackSkill: '/Apps/Aster/research-harness/track/SKILL.md',
        verifySkill: '/Apps/Aster/research-harness/verify/SKILL.md'
      },
      {
        experiment: 'lr-sweep',
        objective: 'Raise val accuracy above 0.9',
        metric: 'acc',
        direction: 'maximize',
        maxRuns: 8,
        maxHours: 6,
        maxParallel: 2,
        gpuPolicy: 'Approved host: one GPU'
      },
      'objective-3'
    )
    expect(prompt).toContain('/Apps/Aster/research-harness/loop/SKILL.md')
    expect(prompt).toContain(
      'node "/Apps/Aster/research-harness/cli.mjs" loop show --experiment lr-sweep'
    )
    expect(prompt).toContain('objective-3')
    expect(prompt).toContain('acc, higher is better')
    expect(prompt).toContain('at most 8 runs and 6 hours, up to 2 runs at a time')
    expect(prompt).toContain('Approved host: one GPU')
    expect(prompt).toContain('preflight --experiment lr-sweep --loop --json')
    expect(prompt).toContain("Aster's orchestration")
  })
})
