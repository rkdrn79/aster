import { toast } from 'sonner'
import type { LaunchAgentInNewTabResult } from '@/lib/launch-agent-in-new-tab'
import type { ResearchDelegationRecord } from '../../../../shared/research/research-records'
import { useResearchRecords } from './research-records-store'

type DelegationLaunchPatch = Partial<
  Pick<ResearchDelegationRecord, 'state' | 'sessionId' | 'tabId'>
>

export async function updateResearchDelegation(
  id: string,
  patch: Partial<ResearchDelegationRecord>
): Promise<void> {
  await useResearchRecords.getState().update((current) => ({
    ...current,
    delegations: current.delegations.map((entry) =>
      entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString() } : entry
    )
  }))
}

/** What a background launch did once it settled, as a patch for its delegation record. */
function settleDelegationLaunch(
  result: NonNullable<LaunchAgentInNewTabResult>
): Promise<DelegationLaunchPatch> {
  if (result.structuredSettlement) {
    return result.structuredSettlement.then(async (outcome) => {
      if (outcome.kind !== 'structured') {
        return outcome.kind === 'visibility-unknown'
          ? { state: 'unknown' as const, sessionId: outcome.sessionId }
          : outcome.kind === 'cancelled'
            ? { state: 'cancelled' as const, sessionId: outcome.sessionId }
            : { state: 'failed' as const }
      }
      const delivery = await outcome.promptDeliveryResult?.catch(() => ({ delivered: false }))
      return {
        state: delivery && !delivery.delivered ? ('unknown' as const) : ('ready' as const),
        sessionId: outcome.sessionId
      }
    })
  }
  if (result.terminalCompletion) {
    return result.terminalCompletion.then(async (completion) => {
      const delivery = await result.promptDeliveryResult?.catch(() => ({ delivered: false }))
      return {
        state:
          completion.outcome.status === 'failed'
            ? ('failed' as const)
            : !delivery || delivery.delivered
              ? ('ready' as const)
              : ('unknown' as const),
        ...(completion.tabId ? { tabId: completion.tabId } : {})
      }
    })
  }
  if (result.promptDeliveryResult) {
    return result.promptDeliveryResult
      .then((delivery) => ({
        state: delivery.delivered ? ('ready' as const) : ('unknown' as const)
      }))
      .catch(() => ({ state: 'unknown' as const }))
  }
  return Promise.resolve({ state: 'ready' as const })
}

/** Saves how a delegated launch settled; a failed save is shown, not thrown. */
export function trackDelegationLaunch(
  id: string,
  result: NonNullable<LaunchAgentInNewTabResult>
): void {
  void settleDelegationLaunch(result)
    .then((patch) => updateResearchDelegation(id, patch))
    .catch((cause: unknown) => {
      toast.error(`Delegation status could not be saved: ${String(cause)}`)
    })
}
