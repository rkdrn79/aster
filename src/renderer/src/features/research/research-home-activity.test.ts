import { describe, expect, it } from 'vitest'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { researchHomeProjectKey, summarizeResearchHomeActivity } from './research-home-activity'
import { runRecord } from './research-experiment-notebook.test-fixture'

function experiment(id: string, patch: Partial<ExperimentRecord> = {}): ExperimentRecord {
  return {
    id,
    name: id,
    projectId: null,
    workspaceId: 'ws-demo',
    workspacePath: '/demo',
    hostId: 'local',
    archived: false,
    createdAt: '2026-10-20T08:00:00Z',
    updatedAt: '2026-10-24T10:00:00Z',
    ...patch
  }
}

const projects = [
  { key: 'repo:demo', workspaces: [{ id: 'ws-demo' }], lastVisitedAt: 0 },
  { key: 'project:remote', workspaces: [{ id: 'ws-remote' }], lastVisitedAt: 5 }
]

describe('home project activity', () => {
  it('counts experiments, live runs, and what needs the user, per project', () => {
    const activity = summarizeResearchHomeActivity({
      projects,
      experiments: [
        experiment('a'),
        experiment('b', { updatedAt: '2026-10-24T12:00:00Z' }),
        experiment('old', { archived: true }),
        experiment('elsewhere', { workspaceId: 'ws-other', projectId: 'remote' })
      ],
      runs: [
        runRecord('alive', 'running', { experimentId: 'a' }),
        runRecord('orphan', 'running', { experimentId: 'a' }),
        runRecord('crashed', 'failed', { experimentId: 'b' }),
        runRecord('dismissed', 'failed', { experimentId: 'b' }),
        runRecord('closed', 'failed', { experimentId: 'b' }),
        runRecord('reopened', 'failed', { experimentId: 'b' }),
        runRecord('archived', 'failed', { experimentId: 'old' }),
        runRecord('remote', 'running', {
          experimentId: 'elsewhere',
          createdAt: '2026-10-25T01:00:00Z'
        })
      ],
      live: new Map([['orphan', { state: 'running' as const, liveness: 'exited' as const }]]),
      failedFindings: new Map([
        ['closed', 'closed' as const],
        ['reopened', 'open' as const]
      ]),
      dismissedRuns: (experimentId) =>
        new Set(experimentId === 'b' ? ['run:dismissed', 'run:reopened'] : [])
    })

    expect(activity.get('repo:demo')).toEqual({
      experiments: 2,
      running: 1,
      stalled: 1,
      failed: 2,
      lastActivityAt: Date.parse('2026-10-24T12:00:00Z')
    })
    expect(activity.get('project:remote')).toEqual({
      experiments: 1,
      running: 1,
      stalled: 0,
      failed: 0,
      lastActivityAt: Date.parse('2026-10-25T01:00:00Z')
    })
  })

  it('keeps the last visit when a project has no research records', () => {
    expect(
      summarizeResearchHomeActivity({
        projects,
        experiments: [],
        runs: [],
        live: new Map(),
        failedFindings: new Map(),
        dismissedRuns: () => new Set()
      }).get('project:remote')
    ).toMatchObject({ experiments: 0, lastActivityAt: 5 })
  })

  it('places an Experiment by its workspace before its recorded project', () => {
    expect(researchHomeProjectKey({ workspaceId: 'ws-demo', projectId: 'remote' }, projects)).toBe(
      'repo:demo'
    )
    expect(researchHomeProjectKey({ workspaceId: 'gone', projectId: 'missing' }, projects)).toBe(
      null
    )
  })
})
