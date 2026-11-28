import { describe, expect, it, vi } from 'vitest'
import type {
  ServerAutoUpdateHostStatus,
  ServerAutoUpdateMode
} from '../../../shared/server-auto-update'
import { ServerAutoUpdateScheduler } from './server-auto-update-scheduler'
import {
  AGENTS_RECHECK_MS,
  type ScheduledServerUpdate,
  type ServerAutoUpdateSchedulerDeps,
  type ServerUpdateHold,
  type ServerVersionCheck
} from './server-auto-update-policy'
import type { ServerChatActivity } from './server-chat-activity'

const OLD = '0.1.0+db14881a735c'
const NEW = '0.1.3+5ac1e0ffee00'

type Timer = { run: () => void; ms: number; cancelled: boolean }

function harness(options: {
  mode?: ServerAutoUpdateMode
  versions?: ServerVersionCheck
  chats?: (ServerChatActivity | null)[]
  update?: ServerAutoUpdateSchedulerDeps['update']
}) {
  const timers: Timer[] = []
  const published: ServerAutoUpdateHostStatus[][] = []
  const traces: { event: string; attributes: Record<string, unknown> }[] = []
  const chatAnswers = [...(options.chats ?? [{ busy: [], recent: [] }])]
  let active = OLD
  const deps: ServerAutoUpdateSchedulerDeps = {
    now: () => new Date('2026-11-29T10:00:00.000Z'),
    setTimer: (run, ms) => {
      const timer = { run, ms, cancelled: false }
      timers.push(timer)
      return () => {
        timer.cancelled = true
      }
    },
    hosts: () => [
      {
        environmentId: 'env-vip',
        sshTargetId: 'ssh-vip',
        hostLabel: 'VIP',
        mode: options.mode ?? 'idle',
        modeSource: 'global'
      }
    ],
    versions: vi.fn(async () =>
      active === NEW
        ? { state: 'current' as const, activeVersion: NEW, bundledVersion: NEW }
        : (options.versions ?? { state: 'due' as const, activeVersion: OLD, bundledVersion: NEW })
    ),
    chats: vi.fn(async () => (chatAnswers.length > 1 ? chatAnswers.shift()! : chatAnswers[0]!)),
    update: vi.fn(
      options.update ??
        (async (_id, request) => {
          request.onUpdating()
          const hold = await request.hold(true)
          if (hold.refusedAgents !== undefined) {
            return {
              outcome: 'waiting' as const,
              wait: { reason: 'agents-working' as const, agents: hold.refusedAgents },
              hold
            }
          }
          active = NEW
          return { outcome: 'updated' as const, activeVersion: NEW, previousVersion: OLD, hold }
        })
    ),
    resume: vi.fn(async (_id: string, sessionIds: string[]) => sessionIds.length),
    publish: (statuses) => published.push(statuses),
    trace: (event, attributes) => traces.push({ event, attributes })
  }
  const scheduler = new ServerAutoUpdateScheduler(deps)
  const status = (): ServerAutoUpdateHostStatus => scheduler.statuses()[0]!
  const fireNext = async (): Promise<Timer> => {
    const timer = timers.find((candidate) => !candidate.cancelled)
    if (!timer) {
      throw new Error('no timer armed')
    }
    timer.cancelled = true
    timer.run()
    await vi.waitFor(() => expect(status().phase).not.toBe('checking'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    return timer
  }
  return { scheduler, deps, timers, published, traces, status, fireNext }
}

const busy = (...ids: string[]): ServerChatActivity => ({
  busy: ids.map((sessionId) => ({ sessionId, agent: 'claude' })),
  recent: []
})

describe('server auto-update scheduler', () => {
  it('updates an idle host on its own and records the outcome in the trace', async () => {
    const h = harness({})
    await h.scheduler.check('env-vip', 'startup')
    expect(h.deps.update).toHaveBeenCalledWith(
      'env-vip',
      expect.objectContaining({ intent: 'auto' })
    )
    expect(h.status()).toMatchObject({
      phase: 'updated',
      activeVersion: NEW,
      updatedFrom: OLD,
      updatedAt: '2026-11-29T10:00:00.000Z'
    })
    expect(h.published.some((list) => list[0]?.phase === 'updating')).toBe(true)
    expect(h.traces).toContainEqual({
      event: 'server.autoUpdate.outcome',
      attributes: expect.objectContaining({ host: 'VIP', outcome: 'updated', from: OLD, to: NEW })
    })
  })

  it('waits while agents work, re-checks, and updates once the host is idle', async () => {
    const h = harness({ chats: [busy('chat-a', 'chat-b'), { busy: [], recent: [] }] })
    await h.scheduler.check('env-vip', 'connect')
    expect(h.deps.update).not.toHaveBeenCalled()
    expect(h.status()).toMatchObject({
      phase: 'waiting',
      wait: { reason: 'agents-working', agents: 2 }
    })
    expect(h.traces.at(-1)).toMatchObject({
      event: 'server.autoUpdate.waiting',
      attributes: { detail: '2 agents working on VIP' }
    })
    const timer = await h.fireNext()
    expect(timer.ms).toBe(AGENTS_RECHECK_MS)
    await vi.waitFor(() => expect(h.status().phase).toBe('updated'))
    expect(h.deps.update).toHaveBeenCalledTimes(1)
  })

  it('keeps the old server when chats start right before the stop', async () => {
    const h = harness({ chats: [{ busy: [], recent: [] }, busy('chat-late')] })
    await h.scheduler.check('env-vip', 'connect')
    expect(h.status()).toMatchObject({ phase: 'waiting', wait: { reason: 'agents-working' } })
    expect(h.status().activeVersion).toBe(OLD)
  })

  it('Update now runs past working agents and continues the chats it cut', async () => {
    const h = harness({ chats: [busy('chat-a', 'chat-b')] })
    const result = await h.scheduler.updateNow('env-vip')
    expect(result).toEqual({ outcome: 'updated', activeVersion: NEW, resumedChats: 2 })
    expect(h.deps.resume).toHaveBeenCalledWith('env-vip', ['chat-a', 'chat-b'])
    expect(h.status()).toMatchObject({ phase: 'updated', resumedChats: 2 })
    expect(h.traces.map((trace) => trace.event)).toContain('server.autoUpdate.chatsContinued')
  })

  it('also continues chats that moved just before the stop', async () => {
    const h = harness({ chats: [{ busy: [], recent: ['chat-recent'] }] })
    await h.scheduler.check('env-vip', 'startup')
    expect(h.deps.resume).toHaveBeenCalledWith('env-vip', ['chat-recent'])
  })

  it('reports a failed update with the old version still serving and does not retry', async () => {
    const h = harness({
      update: async (_id, request) => {
        request.onUpdating()
        await request.hold(true)
        return { outcome: 'failed', reason: 'The candidate did not become ready.' }
      }
    })
    await h.scheduler.check('env-vip', 'startup')
    expect(h.status()).toMatchObject({
      phase: 'failed',
      failure: 'The candidate did not become ready.',
      activeVersion: OLD
    })
    expect(h.timers.filter((timer) => !timer.cancelled)).toEqual([])
  })

  it('never touches a host whose setting is off', async () => {
    const h = harness({ mode: 'off' })
    await h.scheduler.check('env-vip', 'startup')
    expect(h.status().phase).toBe('off')
    expect(h.deps.versions).not.toHaveBeenCalled()
    expect(h.deps.chats).not.toHaveBeenCalled()
    expect(h.deps.update).not.toHaveBeenCalled()
  })

  it('asks first: reports the update and waits for Update now', async () => {
    const h = harness({ mode: 'ask' })
    await h.scheduler.check('env-vip', 'startup')
    expect(h.status()).toMatchObject({ phase: 'waiting', wait: { reason: 'ask' } })
    expect(h.deps.update).not.toHaveBeenCalled()
    await h.scheduler.updateNow('env-vip')
    expect(h.status().phase).toBe('updated')
  })

  it('shows an up-to-date host without probing its chats', async () => {
    const h = harness({
      versions: { state: 'current', activeVersion: NEW, bundledVersion: NEW }
    })
    await h.scheduler.check('env-vip', 'startup')
    expect(h.status()).toMatchObject({ phase: 'up-to-date', activeVersion: NEW })
    expect(h.deps.chats).not.toHaveBeenCalled()
  })

  it('waits on a host it cannot reach and does not call that idle', async () => {
    const h = harness({ chats: [null] })
    await h.scheduler.check('env-vip', 'startup')
    expect(h.status()).toMatchObject({ phase: 'waiting', wait: { reason: 'unreachable' } })
    expect(h.deps.update).not.toHaveBeenCalled()
  })

  it('reports the Slack bridge the update paused', async () => {
    const hold: ServerUpdateHold = {
      mayCut: [],
      slackBridge: { kind: 'old', unit: 'aster-slack-bridge-e81daafe.service' }
    }
    const h = harness({
      update: async (): Promise<ScheduledServerUpdate & { hold?: ServerUpdateHold }> => ({
        outcome: 'updated',
        activeVersion: NEW,
        previousVersion: OLD,
        hold
      })
    })
    await h.scheduler.check('env-vip', 'startup')
    expect(h.status().slackBridge).toEqual(hold.slackBridge)
  })

  it('leaves a host it is not connected to alone until it connects', async () => {
    const h = harness({ versions: { state: 'offline' } })
    await h.scheduler.check('env-vip', 'startup')
    expect(h.status().phase).toBe('unknown')
    expect(h.deps.chats).not.toHaveBeenCalled()
    expect(h.timers.filter((timer) => !timer.cancelled)).toEqual([])
    expect(h.traces).toEqual([])
  })

  it('folds overlapping checks of one host into one', async () => {
    const h = harness({})
    await Promise.all([h.scheduler.check('env-vip', 'a'), h.scheduler.check('env-vip', 'b')])
    expect(h.deps.update).toHaveBeenCalledTimes(1)
  })
})
