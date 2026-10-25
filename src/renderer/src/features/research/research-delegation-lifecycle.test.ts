import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import { AGENT_STATUS_STALE_AFTER_MS } from '../../../../shared/agent-status-freshness'
import type { ResearchDelegationRecord } from '../../../../shared/research/research-records'
import {
  DELEGATION_DONE_LINGER_MS,
  researchDelegationActivity,
  researchDelegationIsActive,
  researchDelegationIsLive
} from './research-delegation-lifecycle'

const LAUNCHED = Date.parse('2026-10-25T10:00:00Z')

function delegation(state: ResearchDelegationRecord['state']): ResearchDelegationRecord {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    sourceWorkspaceId: 'w',
    sourceHostId: 'local',
    sourceExperimentId: null,
    targetWorkspaceId: 'w',
    targetHostId: 'local',
    targetLabel: 'this machine',
    agent: 'claude',
    task: 'Sweep learning rates',
    tabId: 'tab-1',
    sessionId: null,
    state,
    createdAt: new Date(LAUNCHED).toISOString(),
    updatedAt: new Date(LAUNCHED).toISOString()
  }
}

function status(state: AgentStatusEntry['state'], at: number): AgentStatusEntry {
  return {
    state,
    prompt: '',
    updatedAt: at,
    stateStartedAt: at,
    paneKey: 'tab-1:leaf',
    tabId: 'tab-1',
    stateHistory: []
  }
}

function phaseAt(
  record: ResearchDelegationRecord,
  entry: AgentStatusEntry | null,
  now: number,
  options: { reachable?: boolean; tabOpen?: boolean } = {}
) {
  return researchDelegationActivity({
    delegation: record,
    status: entry,
    reachable: options.reachable ?? true,
    tabOpen: options.tabOpen ?? true,
    now
  })
}

describe('researchDelegationActivity', () => {
  it('reads "Done" briefly when the agent finishes, then leaves the live list', () => {
    const finishedAt = LAUNCHED + 60_000
    const justDone = phaseAt(delegation('ready'), status('done', finishedAt), finishedAt + 1_000)
    expect(justDone).toMatchObject({ phase: 'done', label: 'Done' })
    expect(justDone.leavesAt).toBe(finishedAt + DELEGATION_DONE_LINGER_MS)
    expect(researchDelegationIsLive(justDone, undefined)).toBe(true)
    expect(researchDelegationIsActive(justDone, undefined)).toBe(false)

    const later = phaseAt(
      delegation('ready'),
      status('done', finishedAt),
      finishedAt + DELEGATION_DONE_LINGER_MS
    )
    expect(later.phase).toBe('finished')
    expect(researchDelegationIsLive(later, undefined)).toBe(false)
  })

  it('does not take a session-start idle for a finished task', () => {
    const boundary = { ...status('done', LAUNCHED + 1_000), sessionBoundary: true }
    expect(phaseAt(delegation('ready'), boundary, LAUNCHED + 2_000).phase).toBe('running')
  })

  it('keeps failed launches and questions until dismissed, and shows them again on newer news', () => {
    const failed = phaseAt(delegation('failed'), null, LAUNCHED + 5 * AGENT_STATUS_STALE_AFTER_MS)
    expect(failed.phase).toBe('failed')
    expect(researchDelegationIsLive(failed, undefined)).toBe(true)
    expect(researchDelegationIsLive(failed, LAUNCHED + 1)).toBe(false)

    const askedAt = LAUNCHED + 10_000
    const waiting = phaseAt(delegation('ready'), status('waiting', askedAt), askedAt + 3_600_000)
    expect(waiting).toMatchObject({ phase: 'attention', label: 'Agent needs input' })
    expect(researchDelegationIsActive(waiting, undefined)).toBe(true)
    expect(researchDelegationIsLive(waiting, askedAt + 5)).toBe(false)
    const askedAgain = phaseAt(
      delegation('ready'),
      status('waiting', askedAt + 60_000),
      askedAt + 60_001
    )
    expect(researchDelegationIsLive(askedAgain, askedAt + 5)).toBe(true)
  })

  it('drops tasks nobody has heard from for the freshness window', () => {
    const stale = LAUNCHED + AGENT_STATUS_STALE_AFTER_MS + 1
    expect(phaseAt(delegation('unknown'), null, LAUNCHED + 1_000).phase).toBe('attention')
    expect(phaseAt(delegation('unknown'), null, stale).phase).toBe('finished')
    expect(phaseAt(delegation('launching'), null, stale).phase).toBe('finished')
    expect(phaseAt(delegation('ready'), null, stale, { reachable: false }).phase).toBe('finished')
    expect(phaseAt(delegation('ready'), status('working', LAUNCHED), stale).phase).toBe('finished')
  })

  it('lets a reporting agent outrank an unconfirmed delivery, and ends with its closed tab', () => {
    const working = phaseAt(
      delegation('unknown'),
      status('working', LAUNCHED + 5_000),
      LAUNCHED + 6_000
    )
    expect(working).toMatchObject({ phase: 'running', label: 'Agent working' })
    expect(phaseAt(delegation('ready'), null, LAUNCHED + 10_000, { tabOpen: false }).phase).toBe(
      'running'
    )
    expect(phaseAt(delegation('ready'), null, LAUNCHED + 120_000, { tabOpen: false }).phase).toBe(
      'finished'
    )
  })
})
