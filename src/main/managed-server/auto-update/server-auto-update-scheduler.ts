/**
 * Brings every managed server to the build this app bundles, without cutting work.
 *
 * A host is checked when the desktop starts (which includes the first start after an app update),
 * when it connects, and again while an update waits. In `idle` mode it updates only once no chat
 * agent on it is working; terminals and jobs live in the separate daemon and carry across. `ask`
 * reports the update and waits for Update now; `off` never touches the host. Update now runs past
 * working agents and continues the chats it cut once the new server answers.
 */
import type {
  ServerAutoUpdateHostStatus,
  ServerAutoUpdateNowResult,
  ServerAutoUpdateWait
} from '../../../shared/server-auto-update'
import {
  heldVersionStatus,
  recheckDelay,
  type HeldWhy,
  waitText,
  type ScheduledServerUpdate,
  type ServerAutoUpdateHost,
  type ServerAutoUpdateSchedulerDeps,
  type ServerUpdateHold,
  type ServerVersionCheck
} from './server-auto-update-policy'

type Entry = {
  status: ServerAutoUpdateHostStatus
  timer: (() => void) | null
  running: Promise<unknown> | null
}

export class ServerAutoUpdateScheduler {
  private readonly entries = new Map<string, Entry>()

  constructor(private readonly deps: ServerAutoUpdateSchedulerDeps) {}

  statuses(): ServerAutoUpdateHostStatus[] {
    const hosts = this.deps.hosts()
    return hosts.map((host) => this.entryFor(host).status)
  }

  /** Checks a host after `delayMs`; a pending check for it is replaced, not doubled. */
  schedule(environmentId: string, trigger: string, delayMs = 0): void {
    const host = this.host(environmentId)
    if (!host) {
      return
    }
    const entry = this.entryFor(host)
    entry.timer?.()
    entry.timer = this.deps.setTimer(() => {
      entry.timer = null
      void this.check(environmentId, trigger)
    }, delayMs)
  }

  scheduleAll(trigger: string, delayMs = 0): void {
    for (const host of this.deps.hosts()) {
      this.schedule(host.environmentId, trigger, delayMs)
    }
  }

  /** One check; overlapping checks of the same host share the first. */
  check(environmentId: string, trigger: string): Promise<void> {
    const host = this.host(environmentId)
    if (!host) {
      return Promise.resolve()
    }
    const entry = this.entryFor(host)
    if (entry.running) {
      return entry.running.then(() => undefined)
    }
    const run = this.runCheck(host, entry, trigger).finally(() => {
      entry.running = null
    })
    entry.running = run
    return run
  }

  async updateNow(environmentId: string): Promise<ServerAutoUpdateNowResult> {
    const host = this.host(environmentId)
    if (!host) {
      return { outcome: 'failed', reason: 'This server is not linked to this desktop.' }
    }
    const entry = this.entryFor(host)
    await entry.running?.catch(() => undefined)
    entry.timer?.()
    entry.timer = null
    const run = this.runUpdate(host, entry, 'now', 'update-now')
    entry.running = run
    try {
      return await run
    } finally {
      entry.running = null
    }
  }

  private async runCheck(host: ServerAutoUpdateHost, entry: Entry, trigger: string): Promise<void> {
    if (entry.status.phase === 'unknown') {
      this.set(entry, { phase: 'checking' })
    }
    if (host.mode === 'off') {
      this.settle(entry, { phase: 'off' })
      return
    }
    let versions: ServerVersionCheck
    try {
      versions = await this.deps.versions(host.environmentId)
    } catch (error) {
      this.wait(entry, host, { reason: 'unreachable', detail: message(error) }, trigger)
      return
    }
    if (versions.state === 'offline') {
      // Why no retry: a host this desktop is not using is checked when it connects again.
      this.settle(entry, {
        phase: entry.status.phase === 'checking' ? 'unknown' : entry.status.phase
      })
      return
    }
    this.set(entry, {
      activeVersion: versions.activeVersion,
      bundledVersion: versions.bundledVersion
    })
    if (versions.state === 'held') {
      this.hold(entry, host, versions.why, trigger)
      return
    }
    if (versions.state === 'current') {
      this.settle(entry, { phase: entry.status.phase === 'updated' ? 'updated' : 'up-to-date' })
      return
    }
    if (host.mode === 'ask') {
      this.wait(entry, host, { reason: 'ask' }, trigger)
      return
    }
    const chats = await this.deps.chats(host.environmentId)
    if (!chats) {
      this.wait(
        entry,
        host,
        { reason: 'unreachable', detail: 'The server did not answer.' },
        trigger
      )
      return
    }
    if (chats.busy.length > 0) {
      this.wait(entry, host, { reason: 'agents-working', agents: chats.busy.length }, trigger)
      return
    }
    await this.runUpdate(host, entry, 'auto', trigger)
  }

  private async runUpdate(
    host: ServerAutoUpdateHost,
    entry: Entry,
    intent: 'auto' | 'now',
    trigger: string
  ): Promise<ServerAutoUpdateNowResult> {
    const startedAt = this.deps.now()
    let mayCut: string[] = []
    const hold = async (refuseIfBusy: boolean): Promise<ServerUpdateHold> => {
      const chats = await this.deps.chats(host.environmentId)
      const busy = chats?.busy.map((chat) => chat.sessionId) ?? []
      if (refuseIfBusy && (chats === null || busy.length > 0)) {
        return { refusedAgents: busy.length, mayCut: [] }
      }
      mayCut = [...busy, ...(chats?.recent ?? [])]
      return { mayCut }
    }
    let result: ScheduledServerUpdate & { hold?: ServerUpdateHold }
    try {
      result = await this.deps.update(host.environmentId, {
        intent,
        onUpdating: () => this.set(entry, { phase: 'updating', wait: undefined }),
        hold: (refuseIfBusy) => hold(refuseIfBusy && intent === 'auto')
      })
    } catch (error) {
      result = { outcome: 'failed', reason: message(error) }
    }
    if (result.hold?.slackBridge) {
      this.set(entry, { slackBridge: result.hold.slackBridge })
    }
    this.deps.trace('server.autoUpdate.outcome', {
      host: host.hostLabel,
      environmentId: host.environmentId,
      intent,
      trigger,
      outcome: result.outcome,
      ...(result.outcome === 'updated'
        ? { from: result.previousVersion, to: result.activeVersion }
        : {}),
      ...(result.outcome === 'waiting' ? { wait: result.wait.reason } : {}),
      ...(result.outcome === 'failed' ? { reason: result.reason } : {}),
      slackBridge: result.hold?.slackBridge?.kind ?? 'none',
      durationMs: this.deps.now().getTime() - startedAt.getTime()
    })
    switch (result.outcome) {
      case 'updated': {
        this.settle(entry, {
          phase: 'updated',
          activeVersion: result.activeVersion,
          updatedAt: this.deps.now().toISOString(),
          updatedFrom: result.previousVersion,
          failure: undefined,
          resumedChats: 0
        })
        const resumed = mayCut.length > 0 ? await this.resume(host, mayCut) : 0
        this.set(entry, { resumedChats: resumed })
        return { outcome: 'updated', activeVersion: result.activeVersion, resumedChats: resumed }
      }
      case 'current': {
        const activeVersion = result.activeVersion ?? entry.status.activeVersion
        this.settle(entry, { phase: 'up-to-date', activeVersion })
        return { outcome: 'already-current', activeVersion: activeVersion ?? '' }
      }
      case 'waiting':
        this.wait(entry, host, result.wait, trigger)
        return { outcome: 'deferred', reason: waitText(result.wait, host.hostLabel) }
      case 'failed':
        // Why no retry timer: the old server keeps serving; the next launch or Update now retries.
        this.settle(entry, { phase: 'failed', failure: result.reason })
        return { outcome: 'failed', reason: result.reason }
    }
  }

  private async resume(host: ServerAutoUpdateHost, sessionIds: string[]): Promise<number> {
    try {
      const resumed = await this.deps.resume(host.environmentId, sessionIds)
      this.deps.trace('server.autoUpdate.chatsContinued', {
        host: host.hostLabel,
        candidates: sessionIds.length,
        continued: resumed
      })
      return resumed
    } catch (error) {
      console.warn('[server-auto-update] Could not continue chats after the update:', error)
      return 0
    }
  }

  private hold(entry: Entry, host: ServerAutoUpdateHost, why: HeldWhy, trigger: string): void {
    const held = heldVersionStatus(why, entry.status.failure)
    if ('wait' in held) {
      this.wait(entry, host, held.wait, trigger)
    } else {
      this.settle(entry, held)
    }
  }

  private wait(
    entry: Entry,
    host: ServerAutoUpdateHost,
    wait: ServerAutoUpdateWait,
    trigger: string
  ): void {
    const since =
      entry.status.phase === 'waiting' && entry.status.wait?.reason === wait.reason
        ? entry.status.wait.since
        : this.deps.now().toISOString()
    this.settle(entry, { phase: 'waiting', wait: { ...wait, since } })
    if (wait.reason !== 'ask') {
      this.deps.trace('server.autoUpdate.waiting', {
        host: host.hostLabel,
        trigger,
        reason: wait.reason,
        detail: waitText(wait, host.hostLabel)
      })
      this.schedule(host.environmentId, 'retry', recheckDelay(wait))
    }
  }

  private settle(entry: Entry, patch: Partial<ServerAutoUpdateHostStatus>): void {
    this.set(entry, { ...patch, checkedAt: this.deps.now().toISOString() })
  }

  private set(entry: Entry, patch: Partial<ServerAutoUpdateHostStatus>): void {
    entry.status = { ...entry.status, ...patch }
    if (patch.phase && patch.phase !== 'waiting' && !('wait' in patch)) {
      delete entry.status.wait
    }
    this.deps.publish(this.statuses())
  }

  private host(environmentId: string): ServerAutoUpdateHost | null {
    return this.deps.hosts().find((host) => host.environmentId === environmentId) ?? null
  }

  private entryFor(host: ServerAutoUpdateHost): Entry {
    let entry = this.entries.get(host.environmentId)
    if (!entry) {
      entry = {
        status: {
          environmentId: host.environmentId,
          sshTargetId: host.sshTargetId,
          hostLabel: host.hostLabel,
          mode: host.mode,
          modeSource: host.modeSource,
          activeVersion: null,
          bundledVersion: null,
          phase: host.mode === 'off' ? 'off' : 'unknown'
        },
        timer: null,
        running: null
      }
      this.entries.set(host.environmentId, entry)
    }
    // The host's label and choice can change between checks; the row shows the current ones.
    entry.status = {
      ...entry.status,
      hostLabel: host.hostLabel,
      mode: host.mode,
      modeSource: host.modeSource
    }
    return entry
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
