import { describe, expect, it, vi } from 'vitest'
import type { ResearchLocation } from './research-history'

vi.mock('./research-navigation', () => ({
  isResearchPage: (view: string) => view.startsWith('research-')
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({ activeView: 'terminal' }) } }))

const {
  EMPTY_RESEARCH_HISTORY,
  MAX_RESEARCH_HISTORY,
  pushResearchLocation,
  replaceResearchLocation,
  researchHistoryTarget,
  researchLocation
} = await import('./research-history')

function at(view: ResearchLocation['view'], workspaceId: string | null = 'ws'): ResearchLocation {
  return { workspaceId, view, experimentId: null, page: null }
}
const reachable = (): boolean => true

describe('research history', () => {
  it('walks back and forward, ignores no-op visits, and branches on a new visit', () => {
    let history = EMPTY_RESEARCH_HISTORY
    for (const view of ['terminal', 'research-writing', 'research-library'] as const) {
      history = pushResearchLocation(history, at(view))
    }
    expect(pushResearchLocation(history, at('research-library'))).toBe(history)
    const back = researchHistoryTarget(history, 'back', reachable)
    expect(back).toBe(1)
    history = { entries: history.entries, index: back ?? -1 }
    expect(researchHistoryTarget(history, 'forward', reachable)).toBe(2)
    history = pushResearchLocation(history, at('research-experiments'))
    expect(history.entries.map((entry) => entry.view)).toEqual([
      'terminal',
      'research-writing',
      'research-experiments'
    ])
    expect(researchHistoryTarget(history, 'forward', reachable)).toBeNull()
  })

  it('skips entries whose workspace is gone and caps its length', () => {
    let history = EMPTY_RESEARCH_HISTORY
    history = pushResearchLocation(history, at('terminal', 'kept'))
    history = pushResearchLocation(history, at('terminal', 'removed'))
    history = pushResearchLocation(history, at('research-writing', 'kept'))
    expect(researchHistoryTarget(history, 'back', (entry) => entry.workspaceId !== 'removed')).toBe(
      0
    )
    for (let i = 0; i < MAX_RESEARCH_HISTORY + 5; i += 1) {
      history = pushResearchLocation(history, at('terminal', `ws-${i}`))
    }
    expect(history.entries).toHaveLength(MAX_RESEARCH_HISTORY)
    expect(history.index).toBe(MAX_RESEARCH_HISTORY - 1)
    expect(history.entries.at(-1)?.workspaceId).toBe(`ws-${MAX_RESEARCH_HISTORY + 4}`)
  })

  it('corrects the reached entry without dropping the forward branch', () => {
    let history = EMPTY_RESEARCH_HISTORY
    history = pushResearchLocation(history, at('terminal'))
    history = pushResearchLocation(history, at('research-writing'))
    const reached = replaceResearchLocation(
      { entries: history.entries, index: 0 },
      at('research-experiments')
    )
    expect(reached.index).toBe(0)
    expect(reached.entries.map((entry) => entry.view)).toEqual([
      'research-experiments',
      'research-writing'
    ])
  })
})

describe('researchLocation', () => {
  it('keeps the Experiment and page only on Experiment screens, folding the two views', () => {
    const pageOf = () => 'compare' as const
    expect(
      researchLocation({ workspaceId: 'ws', view: 'research-runs', experimentId: 'e', pageOf })
    ).toEqual({ workspaceId: 'ws', view: 'research-compare', experimentId: 'e', page: 'compare' })
    expect(
      researchLocation({ workspaceId: 'ws', view: 'research-writing', experimentId: 'e', pageOf })
    ).toEqual(at('research-writing'))
    expect(
      researchLocation({ workspaceId: 'ws', view: 'settings', experimentId: 'e', pageOf })
    ).toBeNull()
  })
})
