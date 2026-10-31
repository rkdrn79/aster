import { getRepoMainWorktreeId } from '../../shared/worktree/id'
import { resolveResearchProjectRoot } from '../research/research-project-files'
import { readResearchProject } from '../research/research-project-overview'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { setPhoneNotifyControl } from '../runtime/phone-notify/phone-notify-control'
import { loadOrCreateVapidKeys } from '../runtime/phone-notify/phone-notify-files'
import {
  PhoneNotifyRunWatch,
  type PhoneNotifyWatchedRun
} from '../runtime/phone-notify/phone-notify-run-watch'
import { PhoneNotifyService } from '../runtime/phone-notify/phone-notify-service'
import { PhoneNotifySubscriptionStore } from '../runtime/phone-notify/phone-notify-subscription-store'
import type { OrcaRuntimeRpcServer } from '../runtime/runtime-rpc'
import type { OrcadRuntimeCleanup } from './orcad-runtime-lifetime'

async function readWatchedRuns(
  runtime: OrcaRuntimeService,
  worktreeId: string
): Promise<PhoneNotifyWatchedRun[]> {
  const overview = await readResearchProject(
    await resolveResearchProjectRoot(runtime, `id:${worktreeId}`)
  )
  return overview.experiments.flatMap((experiment) =>
    experiment.runs.map((run) => ({
      experiment: experiment.slug,
      experimentName: experiment.name || experiment.slug,
      run: run.id,
      runName: run.name || run.id,
      state: run.state
    }))
  )
}

/**
 * Web Push from this host to subscribed phones: agents that need the user, and Runs that end.
 * A failure here leaves phone access and everything else running, just without background alerts.
 */
export function startOrcadPhoneNotify(input: {
  runtime: OrcaRuntimeService
  rpc: OrcaRuntimeRpcServer
  userDataPath: string
  registerCleanup: (cleanup: OrcadRuntimeCleanup) => void
}): void {
  try {
    const stop = startPhoneNotify(input)
    if (stop) {
      input.registerCleanup(stop)
    }
  } catch (error) {
    console.warn(
      '[phone-notify] Phone notifications unavailable:',
      error instanceof Error ? error.message : String(error)
    )
  }
}

function startPhoneNotify(input: {
  runtime: OrcaRuntimeService
  rpc: OrcaRuntimeRpcServer
  userDataPath: string
}): (() => void) | null {
  const registry = input.rpc.getDeviceRegistry()
  if (!registry) {
    return null
  }
  const service = new PhoneNotifyService({
    store: new PhoneNotifySubscriptionStore(input.userDataPath),
    vapid: loadOrCreateVapidKeys(input.userDataPath),
    isPairedDevice: (deviceId) => registry.getDevice(deviceId) !== null
  })
  const stopListening = input.runtime.onNotificationDispatched((event) => {
    void service.notifyDispatched(event)
  })
  const runWatch = new PhoneNotifyRunWatch({
    listWorktreeIds: () => input.runtime.listVisibleRepos().map(getRepoMainWorktreeId),
    readRuns: (worktreeId) => readWatchedRuns(input.runtime, worktreeId),
    isWanted: () => service.activeSubscriptions().length > 0,
    onRunEnded: (run) => {
      void service.notifyRunEnded(run)
    }
  })
  runWatch.start()
  setPhoneNotifyControl(service)
  return () => {
    setPhoneNotifyControl(null)
    stopListening()
    runWatch.stop()
    service.stop()
  }
}
