/**
 * One scheduled server update: the connect's update check, run with the server-update policy's
 * own gate. It carries running terminals across (the daemon outlives orcad), re-checks the chats
 * right before the stop, and pauses an older Slack bridge that would restart the old server.
 */
import type { ManagedOrcadAutoUpdateOutcome } from '../../managed-server/lifecycle/orcad-managed-auto-update'
import {
  ORCAD_UPDATE_AGENTS_WORKING_CODE,
  isWaitingOrcadUpdateDeferral
} from '../../managed-server/lifecycle/orcad-managed-auto-update'
import { requireManagedOrcadEnvironment } from '../../managed-server/lifecycle/orcad-managed-runtime-context'
import { clearOrcadUpdateFailedThisLaunch } from '../../managed-server/lifecycle/orcad-managed-update-failure-memory'
import { ORCAD_ACTIVATION_FENCE_BUSY_CODE } from '../../managed-server/activation/orcad-activation-fence-hold'
import { holdSlotSlackBridges } from '../../managed-server/auto-update/slack-bridge-hold'
import type {
  ScheduledServerUpdate,
  ServerAutoUpdateSchedulerDeps,
  ServerUpdateHold
} from '../../managed-server/auto-update/server-auto-update-policy'
import { checkManagedServerUpdate } from '../../ssh/managed-server-update-check'
import { managedServerUpdateDeps } from '../../ssh/managed-server-update-deps'
import { getSshTargetRegistryStore } from '../../ssh/targets/ssh-target-registry'
import { describeAgentsWorking } from '../../../shared/server-auto-update'
import {
  clearManagedServerNotes,
  publishHostServerStatus
} from './runtime-environment-managed-tunnel'

type UpdateRequest = Parameters<ServerAutoUpdateSchedulerDeps['update']>[1]

export async function runScheduledServerUpdate(
  userDataPath: string,
  environmentId: string,
  request: UpdateRequest,
  options: {
    hostLabel: string
    invalidateTransport: (environmentId: string) => Promise<void> | void
  }
): Promise<ScheduledServerUpdate & { hold?: ServerUpdateHold }> {
  const { deployment } = requireManagedOrcadEnvironment(userDataPath, environmentId)
  const target = getSshTargetRegistryStore()?.getTarget(deployment.sshTargetId)
  if (!target) {
    return { outcome: 'failed', reason: 'The SSH host for this server is no longer registered.' }
  }
  let captured: ServerUpdateHold | undefined
  let refusedAgents: number | null = null
  const deps = managedServerUpdateDeps(userDataPath, {
    intent: request.intent === 'now' ? 'update' : 'connect',
    gate: () => ({
      action: 'proceed',
      carryLiveTerminals: true,
      holdActivation: async (deploy) => {
        const hold = await request.hold(true)
        if (hold.refusedAgents !== undefined) {
          refusedAgents = hold.refusedAgents
          return {
            refused: {
              code: ORCAD_UPDATE_AGENTS_WORKING_CODE,
              reason: `${describeAgentsWorking(hold.refusedAgents, options.hostLabel)}; the current server keeps running.`
            }
          }
        }
        const bridges = await holdSlotSlackBridges(deploy)
        captured = { ...hold, ...(bridges.summary ? { slackBridge: bridges.summary } : {}) }
        return { release: bridges.release }
      }
    })
  })
  // Why a holder: the check reports a note; the scheduler needs the outcome under it.
  const seen: { outcome: ManagedOrcadAutoUpdateOutcome | null } = { outcome: null }
  const checked = await checkManagedServerUpdate(
    target,
    environmentId,
    {
      ...deps,
      autoUpdate: async (id, autoOptions) => (seen.outcome = await deps.autoUpdate(id, autoOptions))
    },
    () => {
      request.onUpdating()
      publishHostServerStatus(target.id, { kind: 'setting-up', phase: 'updating' })
    }
  )
  publishHostServerStatus(target.id, {
    kind: 'managed',
    environmentId,
    ...(checked.note ? { update: checked.note } : {})
  })
  const settled = seen.outcome
  if (request.intent === 'now' && settled?.outcome !== 'deferred') {
    clearOrcadUpdateFailedThisLaunch({ kind: 'ssh', id: target.id })
  }
  if (settled?.outcome === 'updated') {
    // Why: the restarted server dropped the old connection; reconnect on the new one.
    await options.invalidateTransport(environmentId)
    clearManagedServerNotes(target.id, environmentId)
  }
  return {
    ...scheduledOutcome(settled, checked.note?.detail, refusedAgents),
    ...(captured ? { hold: captured } : {})
  }
}

function scheduledOutcome(
  outcome: ManagedOrcadAutoUpdateOutcome | null,
  checkFailure: string | undefined,
  refusedAgents: number | null
): ScheduledServerUpdate {
  if (!outcome) {
    return { outcome: 'failed', reason: checkFailure ?? 'The update check did not finish.' }
  }
  switch (outcome.outcome) {
    case 'updated':
      return {
        outcome: 'updated',
        activeVersion: outcome.activeVersion,
        previousVersion: outcome.previousVersion ?? null
      }
    case 'failed':
      return { outcome: 'failed', reason: outcome.reason }
    case 'deferred':
      return { outcome: 'waiting', wait: deferredWait(outcome, refusedAgents) }
    case 'skipped':
      return skippedOutcome(outcome.reason)
  }
}

function deferredWait(
  outcome: Extract<ManagedOrcadAutoUpdateOutcome, { outcome: 'deferred' }>,
  refusedAgents: number | null
): Extract<ScheduledServerUpdate, { outcome: 'waiting' }>['wait'] {
  if (outcome.code === ORCAD_UPDATE_AGENTS_WORKING_CODE) {
    return refusedAgents
      ? { reason: 'agents-working', agents: refusedAgents }
      : { reason: 'unreachable', detail: 'The server did not report its chats.' }
  }
  if (
    outcome.code === ORCAD_ACTIVATION_FENCE_BUSY_CODE ||
    !isWaitingOrcadUpdateDeferral(outcome.code)
  ) {
    return { reason: 'other', detail: outcome.reason }
  }
  return { reason: 'terminals', detail: outcome.reason }
}

function skippedOutcome(
  reason: Extract<ManagedOrcadAutoUpdateOutcome, { outcome: 'skipped' }>['reason']
): ScheduledServerUpdate {
  switch (reason) {
    case 'current':
    case 'host-newer':
    case 'no-template':
      return { outcome: 'current', activeVersion: null }
    case 'failed-before':
      return {
        outcome: 'failed',
        reason: 'The last update to this version failed during this launch.'
      }
    case 'rolled-back':
      return {
        outcome: 'waiting',
        wait: { reason: 'other', detail: 'this server was rolled back from this version' }
      }
    case 'migrating':
      return {
        outcome: 'waiting',
        wait: { reason: 'other', detail: 'a move into this server is still running' }
      }
    case 'policy-off':
    case 'policy-ask':
    case 'scheduled':
      return { outcome: 'waiting', wait: { reason: 'other', detail: 'held by the update setting' } }
  }
}
