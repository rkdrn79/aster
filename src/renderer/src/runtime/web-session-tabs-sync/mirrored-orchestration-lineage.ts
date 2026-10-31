import type { AgentStatusOrchestrationContext } from '../../../../shared/agent-status-types'
import { makePaneKey, parsePaneKey } from '../../../../shared/stable-pane-id'
import { toWebTerminalSurfaceTabId } from '../../../../shared/terminal-surface-id'

/** This client's key for a host pane: host terminal tabs are mirrored under `web-terminal-` ids. */
export function toMirroredHostPaneKey(hostPaneKey: string): string | null {
  const parsed = parsePaneKey(hostPaneKey)
  return parsed ? makePaneKey(toWebTerminalSurfaceTabId(parsed.tabId), parsed.leafId) : null
}

/** A host lineage row whose parent names this client's mirror of the parent pane. */
export function mirrorHostOrchestrationContext(
  context: AgentStatusOrchestrationContext
): AgentStatusOrchestrationContext {
  // Why: chat tabs are not mirrored under host tab ids; clients find a chat parent by its session.
  if (!context.parentPaneKey || context.parentAgentSessionId) {
    return context
  }
  const { parentPaneKey, ...rest } = context
  const mirroredParentPaneKey = toMirroredHostPaneKey(parentPaneKey)
  return mirroredParentPaneKey ? { ...rest, parentPaneKey: mirroredParentPaneKey } : rest
}

/** The host's `agentOrchestrationByPaneKey`, rekeyed to the panes this client mirrors. */
export function mirrorHostOrchestrationLineage(
  byHostPaneKey: Readonly<Record<string, AgentStatusOrchestrationContext>>
): Record<string, AgentStatusOrchestrationContext> {
  const mirrored: Record<string, AgentStatusOrchestrationContext> = {}
  for (const [hostPaneKey, context] of Object.entries(byHostPaneKey)) {
    const paneKey = context.agentSessionId ? hostPaneKey : toMirroredHostPaneKey(hostPaneKey)
    if (paneKey) {
      mirrored[paneKey] = mirrorHostOrchestrationContext(context)
    }
  }
  return mirrored
}
