import { describe, expect, it } from 'vitest'
import type { AgentDotState } from '@/components/AgentStateDot'
import type { ResearchRunExecutionState } from '../../../shared/research/research-run-manifest'
import {
  phoneRunKey,
  phoneSessionKey,
  runsThatEnded,
  sessionsEnteringNeedsYou
} from './phone-attention-events'
import type { PhoneRunSummary } from './phone-run-summaries'
import type { PhoneSession } from './phone-sessions'

function session(tabId: string, state: AgentDotState): PhoneSession {
  return {
    worktreeId: 'repo::/work/proj',
    tabId,
    leafId: null,
    contentType: 'terminal',
    title: tabId,
    state,
    agentType: 'claude',
    detail: '',
    activityAt: 0,
    stateSince: 0,
    running: true,
    idleShell: false
  }
}

function run(id: string, state: ResearchRunExecutionState): PhoneRunSummary {
  return {
    worktreeId: 'repo::/work/proj',
    experimentSlug: 'lr-sweep',
    experimentName: 'LR sweep',
    run: {
      id,
      name: id,
      state,
      exitCode: null,
      startedAt: null,
      finishedAt: null,
      manifest: 'present',
      metrics: { status: 'absent' }
    },
    keyMetric: null,
    at: 0
  }
}

function states(sessions: PhoneSession[]): Map<string, AgentDotState> {
  return new Map(sessions.map((entry) => [phoneSessionKey(entry), entry.state]))
}

describe('sessionsEnteringNeedsYou', () => {
  it('announces an agent that stops working to ask, once', () => {
    const before = [session('a', 'working'), session('b', 'waiting')]
    const after = [session('a', 'permission'), session('b', 'waiting')]
    expect(sessionsEnteringNeedsYou(states(before), after).map((entry) => entry.tabId)).toEqual([
      'a'
    ])
    expect(sessionsEnteringNeedsYou(states(after), after)).toEqual([])
  })

  it('stays quiet on the first read and while the snapshot is still loading', () => {
    const after = [session('a', 'waiting'), session('b', 'blocked')]
    expect(sessionsEnteringNeedsYou(null, after)).toEqual([])
    expect(sessionsEnteringNeedsYou(states([session('a', 'idle')]), after)).toEqual([])
  })
})

describe('runsThatEnded', () => {
  it('announces finished and failed Runs that were running, not cancels or unseen Runs', () => {
    const previous = new Map(
      [run('ok', 'running'), run('bad', 'running'), run('stop', 'running')].map((entry) => [
        phoneRunKey(entry),
        entry.run.state
      ])
    )
    const ended = runsThatEnded(previous, [
      run('ok', 'succeeded'),
      run('bad', 'failed'),
      run('stop', 'cancelled'),
      run('new', 'failed')
    ])
    expect(ended.map((entry) => entry.run.id)).toEqual(['ok', 'bad'])
  })
})
