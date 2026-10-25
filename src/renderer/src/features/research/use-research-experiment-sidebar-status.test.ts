import { describe, expect, it } from 'vitest'
import { experimentSidebarStatus } from './use-research-experiment-sidebar-status'
import {
  findingRecord,
  proposalRecord,
  runRecord
} from './research-experiment-notebook.test-fixture'

describe('experimentSidebarStatus', () => {
  const none = { findings: [], proposals: [], dismissedRuns: new Set<string>() }

  it('shows the most urgent state and counts what the notebook lists under Needs you', () => {
    expect(experimentSidebarStatus({ ...none, runs: [runRecord('a', 'running')] })).toEqual({
      state: 'running',
      needsYou: 0
    })
    expect(
      experimentSidebarStatus({
        ...none,
        runs: [runRecord('a', 'running')],
        proposals: [proposalRecord('p', 'pending')],
        findings: [findingRecord('w', { severity: 'warn' })]
      })
    ).toEqual({ state: 'needs-you', needsYou: 2 })
    expect(
      experimentSidebarStatus({
        ...none,
        runs: [runRecord('a', 'running'), runRecord('b', 'failed', { manifestPath: null })]
      })
    ).toEqual({ state: 'failed', needsYou: 1 })
    expect(
      experimentSidebarStatus({
        ...none,
        runs: [runRecord('b', 'failed', { manifestPath: null })],
        dismissedRuns: new Set(['run:b'])
      })
    ).toEqual({ state: null, needsYou: 0 })
  })
})
