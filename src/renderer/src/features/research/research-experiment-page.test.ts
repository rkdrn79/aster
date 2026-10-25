import { describe, expect, it, vi } from 'vitest'

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({ activeView: 'research-runs' }) } }))
vi.mock('./research-navigation', () => ({ openResearchView: vi.fn() }))

const {
  experimentSwitchPage,
  lastExperimentDetailPage,
  openResearchExperimentPage,
  toggledExperimentPage
} = await import('./research-experiment-page')

describe('toggledExperimentPage', () => {
  it('returns the notebook to the Details page last used for that Experiment', () => {
    expect(toggledExperimentPage('notebook', lastExperimentDetailPage('a'))).toBe('runs')
    openResearchExperimentPage('a', 'outputs')
    openResearchExperimentPage('a', 'notebook')
    expect(toggledExperimentPage('notebook', lastExperimentDetailPage('a'))).toBe('outputs')
    expect(toggledExperimentPage('outputs', lastExperimentDetailPage('a'))).toBe('notebook')
    expect(lastExperimentDetailPage('b')).toBe('runs')
  })
})

describe('experimentSwitchPage', () => {
  it('keeps the page on screen when switching Experiments from the Experiment screen', () => {
    openResearchExperimentPage('a', 'runs')
    expect(experimentSwitchPage()).toBe('runs')
    openResearchExperimentPage('a', 'notebook')
    expect(experimentSwitchPage()).toBe('notebook')
  })
})
