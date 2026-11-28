/**
 * The desktop's server-update service: the scheduler wired to this profile's managed servers,
 * the connect's policy gate, the IPC the Remote Aster servers settings use, and the trace.
 */
import { ipcMain } from 'electron'
import { getAppEnvironment } from '../../../shared/app-environment'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import { listEnvironments } from '../../../shared/runtime-environment-store'
import { getOrcadSshDeployment } from '../../../shared/runtime-environments'
import {
  normalizeServerAutoUpdateMode,
  resolveServerAutoUpdateMode,
  type ServerAutoUpdateHostStatus
} from '../../../shared/server-auto-update'
import { SERVER_AUTO_UPDATE_CHANGED_CHANNEL } from '../../../shared/server-auto-update-channels'
import { startSpan } from '../../observability/tracer'
import { readManagedOrcadUpdatePlan } from '../../managed-server/lifecycle/orcad-managed-auto-update'
import { orcadUpdateFailedThisLaunch } from '../../managed-server/lifecycle/orcad-managed-update-failure-memory'
import {
  setServerAutoUpdateGate,
  setServerAutoUpdatePolicyListener
} from '../../managed-server/auto-update/server-auto-update-gate-registry'
import { ServerAutoUpdateScheduler } from '../../managed-server/auto-update/server-auto-update-scheduler'
import {
  CONNECT_SETTLE_MS,
  type ServerAutoUpdateHost,
  type ServerVersionCheck
} from '../../managed-server/auto-update/server-auto-update-policy'
import {
  continueChatsCutByUpdate,
  readServerChatActivity
} from '../../managed-server/auto-update/server-chat-activity'
import { managedServerChatCaller } from '../../managed-server/auto-update/server-chat-caller'
import {
  getSshConnectionManager,
  getSshTargetRegistryStore
} from '../../ssh/targets/ssh-target-registry'
import { isRuntimeEnvironmentManuallyDisconnected } from './runtime-environment-manual-disconnect'
import { runScheduledServerUpdate } from './server-auto-update-run'
import { requiredString } from './orcad-runtime-lifecycle-handlers'

export type ServerAutoUpdateServiceOptions = {
  getUserDataPath: () => string
  getSettings: () => Pick<GlobalSettings, 'serverAutoUpdate'>
  invalidateTransport: (environmentId: string) => Promise<void> | void
  broadcast: (channel: string, payload: unknown) => void
}

/** Lets the launch's own status probes and restores settle before the first look. */
const STARTUP_SWEEP_MS = 20_000

let scheduler: ServerAutoUpdateScheduler | null = null

export function getServerAutoUpdateScheduler(): ServerAutoUpdateScheduler | null {
  return scheduler
}

function linkedHosts(options: ServerAutoUpdateServiceOptions): ServerAutoUpdateHost[] {
  const settings = options.getSettings()
  const registry = getSshTargetRegistryStore()
  return listEnvironments(options.getUserDataPath()).flatMap((environment) => {
    const deployment = getOrcadSshDeployment(environment)
    if (!deployment || isRuntimeEnvironmentManuallyDisconnected(environment.id)) {
      return []
    }
    const target = registry?.getTarget(deployment.sshTargetId) ?? null
    const { mode, source } = resolveServerAutoUpdateMode(
      settings.serverAutoUpdate,
      target?.serverAutoUpdate
    )
    return [
      {
        environmentId: environment.id,
        sshTargetId: deployment.sshTargetId,
        hostLabel: target?.label ?? environment.name,
        mode,
        modeSource: source
      }
    ]
  })
}

async function readVersions(
  options: ServerAutoUpdateServiceOptions,
  host: ServerAutoUpdateHost | undefined
): Promise<ServerVersionCheck> {
  if (!host) {
    throw new Error('This server is no longer linked.')
  }
  // Why only a live session: a host this desktop is not using is not connected just to compare.
  if (getSshConnectionManager()?.getState(host.sshTargetId)?.status !== 'connected') {
    return { state: 'offline' }
  }
  const read = await readManagedOrcadUpdatePlan(options.getUserDataPath(), {
    environmentId: host.environmentId,
    appVersion: getAppEnvironment().getVersion(),
    failedBefore: orcadUpdateFailedThisLaunch({ kind: 'ssh', id: host.sshTargetId })
  })
  const versions = { activeVersion: read.activeVersion, bundledVersion: read.candidateVersion }
  if (read.plan.action === 'update') {
    return { state: 'due', ...versions }
  }
  return read.plan.reason === 'current'
    ? { state: 'current', ...versions }
    : { state: 'held', ...versions, why: read.plan.reason }
}

function trace(event: string, attributes: Record<string, unknown>): void {
  const span = startSpan(event, { kind: 'internal', attributes })
  span.end()
  console.info(`[server-auto-update] ${event}`, attributes)
}

export function installServerAutoUpdate(
  options: ServerAutoUpdateServiceOptions
): ServerAutoUpdateScheduler {
  const userDataPath = options.getUserDataPath
  const hosts = (): ServerAutoUpdateHost[] => linkedHosts(options)
  const host = (environmentId: string): ServerAutoUpdateHost | undefined =>
    hosts().find((candidate) => candidate.environmentId === environmentId)
  const created = new ServerAutoUpdateScheduler({
    now: () => new Date(),
    setTimer: (run, ms) => {
      const timer = setTimeout(run, ms)
      timer.unref?.()
      return () => clearTimeout(timer)
    },
    hosts,
    versions: (environmentId) => readVersions(options, host(environmentId)),
    chats: (environmentId) =>
      readServerChatActivity(managedServerChatCaller(userDataPath(), environmentId), Date.now()),
    update: (environmentId, request) =>
      runScheduledServerUpdate(userDataPath(), environmentId, request, {
        hostLabel: host(environmentId)?.hostLabel ?? environmentId,
        invalidateTransport: options.invalidateTransport
      }),
    resume: async (environmentId, sessionIds) =>
      (
        await continueChatsCutByUpdate(
          managedServerChatCaller(userDataPath(), environmentId),
          sessionIds
        )
      ).length,
    publish: (statuses: ServerAutoUpdateHostStatus[]) =>
      options.broadcast(SERVER_AUTO_UPDATE_CHANGED_CHANNEL, statuses),
    trace
  })
  scheduler = created
  // A changed setting or host choice takes effect on the next look, which comes now.
  setServerAutoUpdatePolicyListener(() => created.scheduleAll('policy', 0))
  setServerAutoUpdateGate(({ environmentId, activeVersion }) => {
    const linked = host(environmentId)
    const mode = linked?.mode ?? 'idle'
    if (mode === 'off') {
      created.schedule(environmentId, 'connect', 0)
      return { action: 'skip', reason: 'policy-off' }
    }
    // Why at once: a stopped server runs no chats, and the call that found it needs it serving.
    if (activeVersion === null && mode === 'idle') {
      return { action: 'proceed' }
    }
    created.schedule(environmentId, 'connect', mode === 'ask' ? 0 : CONNECT_SETTLE_MS)
    return { action: 'skip', reason: mode === 'ask' ? 'policy-ask' : 'scheduled' }
  })
  for (const channel of SERVER_AUTO_UPDATE_HANDLER_CHANNELS) {
    ipcMain.removeHandler(channel)
  }
  ipcMain.handle('runtimeEnvironments:serverAutoUpdateStatus', () => created.statuses())
  ipcMain.handle('runtimeEnvironments:serverAutoUpdateNow', (_event, args: { selector: string }) =>
    created.updateNow(requiredString(args?.selector, 'Server'))
  )
  ipcMain.handle(
    'runtimeEnvironments:setServerAutoUpdateMode',
    (_event, args: { sshTargetId: string; mode: unknown }) => {
      const registry = getSshTargetRegistryStore()
      const sshTargetId = requiredString(args?.sshTargetId, 'SSH host')
      if (!registry?.getTarget(sshTargetId)) {
        throw new Error('This SSH host is no longer registered.')
      }
      // Why not ssh:updateTarget: an edit there rebuilds the host's managed tunnel.
      registry.updateTarget(sshTargetId, {
        serverAutoUpdate: normalizeServerAutoUpdateMode(args?.mode)
      })
      created.scheduleAll('policy', 0)
    }
  )
  created.scheduleAll('startup', STARTUP_SWEEP_MS)
  return created
}

export const SERVER_AUTO_UPDATE_HANDLER_CHANNELS = [
  'runtimeEnvironments:serverAutoUpdateStatus',
  'runtimeEnvironments:serverAutoUpdateNow',
  'runtimeEnvironments:setServerAutoUpdateMode'
] as const
