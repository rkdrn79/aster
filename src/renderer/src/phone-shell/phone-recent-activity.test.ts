import { describe, expect, it } from 'vitest'
import type { PhoneRunSummary } from './phone-run-summaries'
import type { PhoneSession } from './phone-sessions'
import { recentPhoneActivity } from './phone-recent-activity'

function session(tabId: string, overrides: Partial<PhoneSession>): PhoneSession {
  return {
    worktreeId: 'wt',
    tabId,
    leafId: null,
    contentType: 'terminal',
    title: tabId,
    state: 'working',
    agentType: 'claude',
    detail: '',
    activityAt: 0,
    stateSince: 0,
    running: true,
    idleShell: false,
    ...overrides
  }
}

function run(id: string, at: number): PhoneRunSummary {
  return {
    worktreeId: 'wt',
    experimentSlug: 'exp',
    experimentName: 'Exp',
    keyMetric: null,
    at,
    run: {
      id,
      name: id,
      state: 'succeeded',
      exitCode: 0,
      startedAt: null,
      finishedAt: null,
      manifest: 'present',
      metrics: { status: 'absent' }
    }
  }
}

describe('recent phone activity', () => {
  it('mixes agent turns and Runs newest first, leaving out questions, shells and stale entries', () => {
    const now = 10_000
    const items = recentPhoneActivity(
      [
        session('agent', { stateSince: 9_000 }),
        session('asking', { state: 'waiting', stateSince: 9_900 }),
        session('shell', { agentType: null, activityAt: 9_950 }),
        session('old', { stateSince: 1 })
      ],
      [run('fresh', 9_500), run('future', 20_000)],
      now,
      { count: 4, maxAgeMs: 5_000 }
    )
    expect(
      items.map((item) => (item.kind === 'run' ? item.summary.run.id : item.session.tabId))
    ).toEqual(['fresh', 'agent'])
  })
})
