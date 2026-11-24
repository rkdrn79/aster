import { describe, expect, it } from 'vitest'
import { researchExperimentStatusView } from './research-experiment-status'

const brief = (status: 'planned' | 'abandoned' = 'planned', conclusion: string | null = null) => ({
  status,
  conclusion
})

describe('Experiment status view', () => {
  it('follows Runs and the conclusion while the brief stays at planned', () => {
    expect(researchExperimentStatusView(brief(), [])).toEqual({ status: 'planned', derived: false })
    expect(researchExperimentStatusView(brief(), ['succeeded', 'running'])).toEqual({
      status: 'running',
      derived: true
    })
    expect(researchExperimentStatusView(brief(), ['failed', 'succeeded'])).toEqual({
      status: 'analyzing',
      derived: true
    })
    expect(researchExperimentStatusView(brief('planned', 'C beats B'), ['running'])).toEqual({
      status: 'concluded',
      derived: true
    })
  })

  it('keeps a status someone set by hand', () => {
    expect(researchExperimentStatusView(brief('abandoned'), ['running'])).toEqual({
      status: 'abandoned',
      derived: false
    })
    expect(researchExperimentStatusView(null, [])).toEqual({ status: 'planned', derived: false })
  })
})
