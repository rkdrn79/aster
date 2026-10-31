import { describe, expect, it } from 'vitest'
import type {
  ResearchProjectExperimentOverview,
  ResearchProjectRunOverview
} from '../../../shared/research/research-project-api'
import type { ResearchExperimentBrief } from '../../../shared/research/research-experiment-brief'
import { experimentStanding, standingVersusBaseline } from './phone-experiment-standing'

function run(id: string, series: { name: string; split: string | null; last: number }[]) {
  const overview: ResearchProjectRunOverview = {
    id,
    name: id,
    state: 'succeeded',
    exitCode: 0,
    startedAt: null,
    finishedAt: null,
    manifest: 'present',
    metrics: {
      status: 'present',
      value: {
        series: series.map((entry) => ({ ...entry, lastStep: 1, direction: null })),
        omittedSeries: 0,
        partial: false
      }
    }
  }
  return overview
}

function brief(overrides: Partial<ResearchExperimentBrief>): ResearchExperimentBrief {
  return {
    question: 'q',
    hypothesis: null,
    status: 'running',
    primaryMetric: { name: 'loss', split: 'val', direction: 'minimize' },
    evaluation: null,
    baseline: 'warmup/w0',
    minSeeds: null,
    rubric: null,
    agentPolicy: { triage: 'suggest', proposals: 'approval' },
    conclusion: null,
    updatedAt: null,
    updatedBy: null,
    ...overrides
  }
}

function experimentOf(
  experimentBrief: ResearchExperimentBrief,
  runs: ResearchProjectRunOverview[]
): ResearchProjectExperimentOverview {
  return {
    slug: 'warmup',
    name: 'Warmup',
    brief: experimentBrief,
    loop: { status: 'absent' },
    runCount: runs.length,
    latestRun: runs.at(-1) ?? null,
    runs
  }
}

describe('experiment standing', () => {
  const w0 = run('w0', [{ name: 'loss', split: 'val', last: 1.12 }])
  const w100 = run('w100', [
    { name: 'loss', split: 'train', last: 0.5 },
    { name: 'loss', split: 'val', last: 1.07 }
  ])
  const unmeasured = run('w200', [{ name: 'acc', split: 'val', last: 0.9 }])

  it('picks the best Run by direction on exactly the primary metric and finds the baseline', () => {
    const experiment = experimentOf(brief({}), [w0, w100, unmeasured])
    const standing = experimentStanding(experiment, { experiments: [experiment] })
    expect(standing?.metric).toBe('val loss')
    expect(standing?.best).toEqual({ run: w100, value: 1.07 })
    expect(standing?.baseline).toEqual({ reference: 'warmup/w0', run: w0, value: 1.12 })
    expect(standingVersusBaseline(standing!)).toEqual({
      text: '0.05 below the baseline',
      beats: true
    })
  })

  it('says when the baseline is still best, and needs a primary metric at all', () => {
    const maximize = brief({ primaryMetric: { name: 'loss', split: 'val', direction: 'maximize' } })
    const experiment = experimentOf(maximize, [w0, w100])
    const standing = experimentStanding(experiment, { experiments: [experiment] })
    expect(standingVersusBaseline(standing!)).toEqual({
      text: 'The baseline is still the best Run',
      beats: null
    })
    expect(
      experimentStanding(experimentOf(brief({ primaryMetric: null }), [w0]), { experiments: [] })
    ).toBeNull()
  })
})
