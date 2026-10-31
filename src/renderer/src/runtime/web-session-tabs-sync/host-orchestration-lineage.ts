import type { AgentStatusOrchestrationContext } from '../../../../shared/agent-status-types'
import type { RuntimeSessionTabsOrchestrationLineage } from '../../../../shared/runtime-types'
import { lastVerifiedRuntimeStatus } from '../../../../shared/runtime-host-status'
import { SESSION_TABS_ORCHESTRATION_LINEAGE_RUNTIME_CAPABILITY } from '../../../../shared/session-tabs-runtime-capabilities'
import { useAppStore } from '../../store'
import { publishEnvironmentOrchestrationLineage } from '../agent-orchestration-lineage-sources'
import { callRuntimeRpc } from '../runtime-rpc-client'
import { mirrorHostOrchestrationLineage } from './mirrored-orchestration-lineage'

// Why coalesce: one read answers a burst of tab and agent-status frames.
const LINEAGE_REFRESH_COALESCE_MS = 100
const LINEAGE_READ_TIMEOUT_MS = 15_000

type LineageRefresh = {
  timer: ReturnType<typeof setTimeout> | null
  reading: boolean
  rereadAfterRead: boolean
}

const refreshByEnvironmentId = new Map<string, LineageRefresh>()

function setRuntimeLineage(entries: Record<string, AgentStatusOrchestrationContext>): void {
  useAppStore.getState().setRuntimeAgentOrchestrationByPaneKey(entries)
}

function hostAnswersLineage(environmentId: string): boolean {
  const status = lastVerifiedRuntimeStatus(
    useAppStore.getState().runtimeStatusByEnvironmentId.get(environmentId)
  )
  return (
    status?.capabilities?.includes(SESSION_TABS_ORCHESTRATION_LINEAGE_RUNTIME_CAPABILITY) === true
  )
}

async function refreshHostOrchestrationLineage(
  environmentId: string,
  refresh: LineageRefresh
): Promise<void> {
  if (!hostAnswersLineage(environmentId)) {
    // Why: older hosts lack the method, so they are never asked and show workers as plain tabs.
    publishEnvironmentOrchestrationLineage(setRuntimeLineage, environmentId, null)
    return
  }
  refresh.reading = true
  try {
    const result = await callRuntimeRpc<RuntimeSessionTabsOrchestrationLineage>(
      { kind: 'environment', environmentId },
      'session.tabs.orchestrationLineage',
      undefined,
      { timeoutMs: LINEAGE_READ_TIMEOUT_MS }
    )
    if (refreshByEnvironmentId.get(environmentId) === refresh) {
      publishEnvironmentOrchestrationLineage(
        setRuntimeLineage,
        environmentId,
        mirrorHostOrchestrationLineage(result.agentOrchestrationByPaneKey)
      )
    }
  } catch {
    // Why keep the last answer: an empty map would unfold every folded worker until the next read.
  } finally {
    refresh.reading = false
    if (refresh.rereadAfterRead && refreshByEnvironmentId.get(environmentId) === refresh) {
      refresh.rereadAfterRead = false
      scheduleHostOrchestrationLineageRefresh(environmentId)
    }
  }
}

/** Re-reads a paired host's subagent lineage after its session tabs stream answered. */
export function scheduleHostOrchestrationLineageRefresh(environmentId: string): void {
  let refresh = refreshByEnvironmentId.get(environmentId)
  if (!refresh) {
    refresh = { timer: null, reading: false, rereadAfterRead: false }
    refreshByEnvironmentId.set(environmentId, refresh)
  }
  if (refresh.reading) {
    refresh.rereadAfterRead = true
    return
  }
  if (refresh.timer !== null) {
    return
  }
  const scheduled = refresh
  scheduled.timer = setTimeout(() => {
    scheduled.timer = null
    void refreshHostOrchestrationLineage(environmentId, scheduled)
  }, LINEAGE_REFRESH_COALESCE_MS)
}

/** Withdraws a host's lineage once this client stops mirroring it. */
export function forgetHostOrchestrationLineage(environmentId: string): void {
  const refresh = refreshByEnvironmentId.get(environmentId)
  if (refresh?.timer) {
    clearTimeout(refresh.timer)
  }
  refreshByEnvironmentId.delete(environmentId)
  publishEnvironmentOrchestrationLineage(setRuntimeLineage, environmentId, null)
}
