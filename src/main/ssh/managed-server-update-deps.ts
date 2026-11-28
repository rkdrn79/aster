/** The live update-check collaborators, shared by the connect decision and the tunnel restore. */
import { getAppEnvironment } from '../../shared/app-environment'
import type { ManagedServerUpdateDeps } from './managed-server-update-check'
import {
  autoUpdateManagedOrcadEnvironment,
  type ManagedOrcadUpdateGate,
  type ManagedOrcadUpdateGateInput
} from '../managed-server/lifecycle/orcad-managed-auto-update'
import { getServerAutoUpdateGate } from '../managed-server/auto-update/server-auto-update-gate-registry'
import { requireManagedOrcadTargetStore } from '../managed-server/lifecycle/orcad-managed-runtime-context'
import {
  orcadUpdateFailedThisLaunch,
  recordOrcadUpdateFailedThisLaunch
} from '../managed-server/lifecycle/orcad-managed-update-failure-memory'

/**
 * `scheduled` is the server-update scheduler's own run, which already checked the host's chats;
 * every other caller (connect, tunnel restore) asks the published policy gate.
 */
export function managedServerUpdateDeps(
  userDataPath: string,
  scheduled?: {
    intent: 'connect' | 'update'
    gate: (input: ManagedOrcadUpdateGateInput) => ManagedOrcadUpdateGate
  }
): ManagedServerUpdateDeps {
  const registry = requireManagedOrcadTargetStore()
  const appVersion = getAppEnvironment().getVersion()
  const gate = scheduled?.gate ?? getServerAutoUpdateGate()
  return {
    autoUpdate: (environmentId, options) =>
      autoUpdateManagedOrcadEnvironment(userDataPath, {
        environmentId,
        appVersion,
        ...options,
        ...(scheduled ? { intent: scheduled.intent } : {}),
        ...(gate ? { gate } : {})
      }),
    // Why the stored row: the caller's target is a copy taken before an overlapping check recorded.
    recordedUpdateFailure: (target) => {
      const failure = (registry.getTarget(target.id) ?? target).managedServerUpdateFailure
      return failure?.appVersion === appVersion ? failure.reason : null
    },
    // Why only a failure counts: a deferral or skip never tried the update. Why session-only:
    // SshTarget is published to peers.
    failedThisLaunch: (target) => orcadUpdateFailedThisLaunch({ kind: 'ssh', id: target.id }),
    recordUpdateFailure: (target, reason) => {
      recordOrcadUpdateFailedThisLaunch(
        { kind: 'ssh', id: target.id },
        { code: 'orcad_update_failed', reason }
      )
      registry.updateTarget(target.id, { managedServerUpdateFailure: { reason, appVersion } })
    },
    clearUpdateFailure: (target) => {
      registry.updateTarget(target.id, { managedServerUpdateFailure: undefined })
    }
  }
}
