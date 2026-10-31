import type { AgentStatusOrchestrationContext } from '../../../shared/agent-status-types'

type OrchestrationLineage = Record<string, AgentStatusOrchestrationContext>
type OrchestrationLineageSetter = (entries: OrchestrationLineage) => void

let localLineage: OrchestrationLineage = {}
const lineageByEnvironmentId = new Map<string, OrchestrationLineage>()

function mergedLineage(): OrchestrationLineage {
  if (lineageByEnvironmentId.size === 0) {
    return localLineage
  }
  const merged = { ...localLineage }
  for (const lineage of lineageByEnvironmentId.values()) {
    Object.assign(merged, lineage)
  }
  return merged
}

/** This client's own runtime lineage, answered by its window graph sync. */
export function publishLocalOrchestrationLineage(
  setLineage: OrchestrationLineageSetter | undefined,
  lineage: OrchestrationLineage
): void {
  localLineage = lineage
  setLineage?.(mergedLineage())
}

/** A paired host's lineage keyed by this client's mirrored panes; null withdraws it. */
export function publishEnvironmentOrchestrationLineage(
  setLineage: OrchestrationLineageSetter,
  environmentId: string,
  lineage: OrchestrationLineage | null
): void {
  if (lineage) {
    lineageByEnvironmentId.set(environmentId, lineage)
  } else if (!lineageByEnvironmentId.delete(environmentId)) {
    // Why: a host that never answered lineage leaves the store exactly as it was.
    return
  }
  setLineage(mergedLineage())
}
