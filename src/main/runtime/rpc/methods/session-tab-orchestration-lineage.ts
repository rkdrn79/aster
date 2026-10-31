import type { RuntimeSessionTabsOrchestrationLineage } from '../../../../shared/runtime-types'
import { defineMethod } from '../core'

export const SESSION_TAB_ORCHESTRATION_LINEAGE_METHODS = [
  defineMethod({
    name: 'session.tabs.orchestrationLineage',
    permission: 'workspace',
    params: null,
    // Why: a paired client mirrors these panes but never syncs a window graph, the desktop's carrier.
    handler: (_params, { runtime }): RuntimeSessionTabsOrchestrationLineage => ({
      agentOrchestrationByPaneKey: runtime.getAgentOrchestrationByPaneKey()
    })
  })
]
