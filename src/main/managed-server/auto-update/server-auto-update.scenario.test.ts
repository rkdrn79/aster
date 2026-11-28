/**
 * The automatic server update end to end on a local stand-in host: the real scheduler, the real
 * Slack bridge hold over `/bin/sh`, stub orcad builds launched and stopped with the real
 * commands, stub chat agents that end with their server, and fake Slack bridges.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ServerAutoUpdateMode } from '../../../shared/server-auto-update'
import { holdOldSlackBridges } from './slack-bridge-hold'
import { ServerAutoUpdateScheduler } from './server-auto-update-scheduler'
import type { ServerAutoUpdateSchedulerDeps, ServerUpdateHold } from './server-auto-update-policy'
import { LocalOrcadRemote } from './local-orcad-remote.test-fixture'

const OLD = '0.1.0+db14881a735c'
const NEW = '0.1.0+5ac1e0ffee00'

let remote: LocalOrcadRemote | null = null
afterEach(() => {
  remote?.cleanup()
  remote = null
})

function setup(options: { mode?: ServerAutoUpdateMode } = {}) {
  const host = new LocalOrcadRemote([OLD, NEW], OLD)
  remote = host
  const traces: { event: string; attributes: Record<string, unknown> }[] = []
  const timers: (() => void)[] = []
  const deps: ServerAutoUpdateSchedulerDeps = {
    now: () => new Date(),
    setTimer: (run) => {
      timers.push(run)
      return () => {}
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
    versions: async () => {
      const { active } = host.record()
      return {
        state: active === NEW ? 'current' : 'due',
        activeVersion: active,
        bundledVersion: NEW
      }
    },
    chats: async () => ({
      busy: Object.entries(host.chats())
        .filter(([, chat]) => chat.status === 'working')
        .map(([sessionId]) => ({ sessionId, agent: 'claude' })),
      recent: []
    }),
    update: vi.fn<ServerAutoUpdateSchedulerDeps['update']>(async (_id, request) => {
      request.onUpdating()
      let hold: ServerUpdateHold | undefined
      const result = await host.activate(NEW, async () => {
        hold = await request.hold(true)
        if (hold.refusedAgents !== undefined) {
          return { refused: { code: 'orcad_update_agents_working', reason: 'busy' } }
        }
        const bridges = await holdOldSlackBridges(async (command) => host.sh(command), host.root)
        const shown = bridges.bridges?.[0]
        hold = {
          ...hold,
          ...(shown ? { slackBridge: { kind: shown.kind, unit: shown.unit } } : {})
        }
        return { release: bridges.release }
      })
      switch (result.outcome) {
        case 'activated':
          return { outcome: 'updated', activeVersion: NEW, previousVersion: OLD, hold }
        case 'refused':
          return {
            outcome: 'waiting',
            wait: { reason: 'agents-working', agents: hold?.refusedAgents ?? 0 },
            hold
          }
        case 'rejected':
          return {
            outcome: 'failed',
            reason: 'The new server did not start; the old one runs again.'
          }
        case 'stop-incomplete':
          return { outcome: 'failed', reason: 'orcad_outgoing_stop_incomplete' }
      }
    }),
    // Like agentSession.continueInterrupted: only a reply the stop cut is carried on.
    resume: async (_id, sessionIds) => {
      let continued = 0
      for (const id of sessionIds) {
        const chat = host.chat(id)
        if (chat.turn === 'cut') {
          host.writeChat(id, { ...chat, status: 'working', continued: chat.continued + 1 })
          continued += 1
        }
      }
      return continued
    },
    publish: () => {},
    trace: (event, attributes) => traces.push({ event, attributes })
  }
  const scheduler = new ServerAutoUpdateScheduler(deps)
  return { host, deps, scheduler, traces, timers, status: () => scheduler.statuses()[0]! }
}

async function startOld(host: LocalOrcadRemote): Promise<number> {
  expect(await host.launch(OLD)).toBe(true)
  return host.servingPid(OLD)!
}

async function agentOf(host: LocalOrcadRemote, id: string): Promise<number> {
  await vi.waitFor(() => expect(host.chat(id).agentPid).toBeGreaterThan(0), { timeout: 20_000 })
  return host.chat(id).agentPid!
}

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// Why the long timeout: real processes on a machine that may run the whole suite at once.
describe('automatic server update on a local host', { timeout: 120_000 }, () => {
  it('updates an idle host on its own; its idle chat keeps its place', async () => {
    const { host, scheduler, status, traces } = setup()
    host.writeChat('chat-idle', { status: 'idle', turn: 'done', continued: 0 })
    await startOld(host)
    await scheduler.check('env-vip', 'startup')
    expect(status()).toMatchObject({ phase: 'updated', activeVersion: NEW, updatedFrom: OLD })
    expect(host.record()).toMatchObject({ active: NEW, previous: OLD })
    expect(host.servingPid(NEW)).not.toBeNull()
    expect(host.servingPid(OLD)).toBeNull()
    expect(host.chat('chat-idle')).toMatchObject({ turn: 'done', continued: 0 })
    expect(
      traces.find((trace) => trace.event === 'server.autoUpdate.outcome')?.attributes
    ).toMatchObject({ outcome: 'updated', from: OLD, to: NEW })
  })

  it('waits while an agent works, then updates once the reply is done', async () => {
    const { host, scheduler, status, timers } = setup()
    host.writeChat('chat-a', { status: 'working', turn: 'in-progress', continued: 0 })
    await startOld(host)
    const agent = await agentOf(host, 'chat-a')
    await scheduler.check('env-vip', 'connect')
    expect(status()).toMatchObject({
      phase: 'waiting',
      wait: { reason: 'agents-working', agents: 1 }
    })
    expect(host.record().active).toBe(OLD)
    expect(isAlive(agent)).toBe(true)

    host.writeChat('chat-a', { ...host.chat('chat-a'), status: 'idle', turn: 'done' })
    timers.shift()!()
    await vi.waitFor(() => expect(status().phase).toBe('updated'), { timeout: 30_000 })
    expect(host.record().active).toBe(NEW)
  })

  it('Update now stops the working agent with the old server and continues its chat on the new one', async () => {
    const { host, scheduler, status } = setup()
    host.writeChat('chat-a', { status: 'working', turn: 'in-progress', continued: 0 })
    await startOld(host)
    const oldAgent = await agentOf(host, 'chat-a')

    const result = await scheduler.updateNow('env-vip')
    expect(result).toEqual({ outcome: 'updated', activeVersion: NEW, resumedChats: 1 })
    // What dies today: the agent was the old server's child and ended with it.
    await vi.waitFor(() => expect(isAlive(oldAgent)).toBe(false), { timeout: 20_000 })
    // The new server started it again for the continued reply.
    await vi.waitFor(() => expect(host.chat('chat-a').agentPid).not.toBe(oldAgent), {
      timeout: 30_000
    })
    expect(host.chat('chat-a')).toMatchObject({ status: 'working', continued: 1 })
    expect(status()).toMatchObject({ phase: 'updated', resumedChats: 1 })
  })

  it('pauses an old Slack bridge so it cannot restart the old server mid-update', async () => {
    const { host, scheduler, status } = setup()
    await startOld(host)
    const bridge = host.startBridge(OLD, 'old')
    await new Promise((done) => setTimeout(done, 300))
    await scheduler.check('env-vip', 'startup')
    expect(status()).toMatchObject({ phase: 'updated', slackBridge: { kind: 'old' } })
    expect(host.bridgeLog()).toEqual([])
    await new Promise((done) => setTimeout(done, 300))
    expect(host.processArgs(bridge.pid!)).toContain(`orcad-${OLD}`)
    expect(host.servingPid(NEW)).not.toBeNull()
    expect(host.bridgeLog()).toEqual([])
  })

  it('a bridge that follows updates stands down, then re-executes itself on the new version', async () => {
    const { host, scheduler, status } = setup()
    await startOld(host)
    const bridge = host.startBridge(OLD, 'follows')
    await vi.waitFor(() => expect(host.bridgeLog()[0]).toBe(`started ${bridge.pid} ${OLD}`), {
      timeout: 30_000
    })
    await scheduler.check('env-vip', 'startup')
    expect(status()).toMatchObject({ phase: 'updated', slackBridge: { kind: 'follows' } })
    await vi.waitFor(() => expect(host.bridgeLog()).toContain(`now ${bridge.pid} orcad-${NEW}`), {
      timeout: 30_000
    })
    expect(host.bridgeLog()).toContain(`reexec ${bridge.pid} ${NEW}`)
    expect(host.bridgeLog().some((line) => line.startsWith('respawned'))).toBe(false)
    expect(host.processArgs(bridge.pid!)).toContain(`orcad-${NEW}/out/cli/index.js slack bridge`)
  })

  it('a candidate that does not start rolls back: the old server serves and the failure shows', async () => {
    const { host, scheduler, status } = setup()
    host.writeSlot(NEW, false)
    await startOld(host)
    await scheduler.check('env-vip', 'startup')
    expect(status()).toMatchObject({ phase: 'failed', activeVersion: OLD })
    expect(status().failure).toContain('old one runs again')
    expect(host.record().active).toBe(OLD)
    expect(host.servingPid(OLD)).not.toBeNull()
  })

  it('never updates a host whose setting is off', async () => {
    const { host, scheduler, status, deps } = setup({ mode: 'off' })
    await startOld(host)
    await scheduler.check('env-vip', 'startup')
    expect(status().phase).toBe('off')
    expect(deps.update).not.toHaveBeenCalled()
    expect(host.record().active).toBe(OLD)
  })
})
