import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { AgentChildWorkView } from '../../../../shared/agent-status-child-work-view'
import { AGENT_STATUS_STALE_AFTER_MS } from '../../../../shared/agent-status-freshness'
import { researchActiveAgentTaskCount, researchLiveAgentTasks } from './research-live-agent-tasks'

const NOW = Date.parse('2026-10-25T10:00:00Z')

function child(
  id: string,
  state: AgentChildWorkView['state'],
  membership: AgentChildWorkView['membership'] = 'live'
): AgentChildWorkView {
  return {
    id,
    kind: 'agent',
    name: id,
    state,
    membership,
    firstObservedAt: NOW - 1_000,
    observedAt: NOW - 500,
    stoppable: false,
    invocation: { invocationId: id, generation: 1 }
  }
}

function parent(
  paneKey: string,
  children: AgentChildWorkView[],
  updatedAt = NOW,
  extra: Partial<AgentStatusEntry> = {}
): AgentStatusEntry {
  return {
    state: 'working',
    prompt: '',
    updatedAt,
    stateStartedAt: updatedAt,
    paneKey,
    stateHistory: [],
    children,
    ...extra
  }
}

describe('researchLiveAgentTasks', () => {
  it('lists only children still running, and only for agents heard from recently', () => {
    const statuses = {
      fresh: parent('fresh', [
        child('sweep', 'working'),
        child('settled', 'done', 'settled'),
        child('just-done', 'done'),
        child('asks', 'waiting'),
        child('resting', 'idle')
      ]),
      stale: parent('stale', [child('old', 'working')], NOW - AGENT_STATUS_STALE_AFTER_MS - 1)
    }
    expect(researchLiveAgentTasks(statuses, {}, NOW).map((task) => task.name)).toEqual([
      'sweep',
      'asks'
    ])
    expect(researchActiveAgentTaskCount(statuses, NOW)).toBe(2)
  })

  it('shows unverifiable children as status unavailable without counting them as running', () => {
    const statuses = {
      unverified: parent('unverified', [child('maybe', 'working')], NOW, {
        subagentObservation: 'unverifiable'
      })
    }
    expect(researchLiveAgentTasks(statuses, {}, NOW)).toMatchObject([
      { name: 'maybe', state: 'Status unavailable', active: false }
    ])
    expect(researchActiveAgentTaskCount(statuses, NOW)).toBe(0)
  })

  it('hides a legacy child as soon as its host reports it idle', () => {
    const statuses = {
      legacy: {
        ...parent('legacy', []),
        children: undefined,
        subagents: [
          { id: 'finished', state: 'idle' as const, startedAt: NOW - 1_000 },
          { id: 'active', state: 'working' as const, startedAt: NOW - 1_000 }
        ]
      }
    }
    expect(researchLiveAgentTasks(statuses, {}, NOW).map((task) => task.name)).toEqual(['Subagent'])
  })

  it('allows a reported child to be hidden until it has newer activity', () => {
    const statuses = { fresh: parent('fresh', [child('running', 'working')]) }
    const id = 'fresh:running'
    const dismissed = { [`child:${id}`]: NOW - 500 }
    expect(researchLiveAgentTasks(statuses, {}, NOW, dismissed)).toEqual([])
    expect(researchActiveAgentTaskCount(statuses, NOW, dismissed)).toBe(0)
    statuses.fresh.children = [{ ...child('running', 'working'), observedAt: NOW + 100 }]
    expect(researchLiveAgentTasks(statuses, {}, NOW + 100, dismissed)).toHaveLength(1)
  })
})
