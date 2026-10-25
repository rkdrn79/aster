import { describe, expect, it } from 'vitest'
import { experimentAgentPaneBounds } from './research-experiment-agent-pane-width'

describe('experimentAgentPaneBounds', () => {
  it('caps the agent at 60% of the screen and keeps the notebook its minimum', () => {
    expect(experimentAgentPaneBounds(1600)).toEqual({ minWidth: 300, maxWidth: 960 })
    expect(experimentAgentPaneBounds(1000)).toEqual({ minWidth: 300, maxWidth: 574 })
  })

  it('shrinks both below their minimums together on a narrow screen', () => {
    expect(experimentAgentPaneBounds(680)).toEqual({ minWidth: 280, maxWidth: 280 })
  })

  it('falls back to the absolute limits before the screen is measured', () => {
    expect(experimentAgentPaneBounds(0)).toEqual({ minWidth: 300, maxWidth: 1200 })
  })
})
