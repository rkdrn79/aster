import type { TuiAgent } from './tui-agent'
import { isTuiAgent, TUI_AGENT_CONFIG, type TuiAgentConfig } from './tui-agent-config'
import { PRODUCT_NAME } from './product-brand'

/** Why: agent ids persist in automations and settings, so they outlive the build that
 * wrote them — an id a branch build understood reads back as unknown here. Name the id
 * instead of letting a bare `TUI_AGENT_CONFIG[agent].x` lookup fail with the unreadable
 * "Cannot read properties of undefined (reading 'preflightTrust')". */
export function requireTuiAgentConfig(agent: TuiAgent): TuiAgentConfig {
  if (!isTuiAgent(agent)) {
    throw new Error(
      `Unknown agent "${String(agent)}". This version of ${PRODUCT_NAME} has no such agent — pick a different agent and try again.`
    )
  }
  return TUI_AGENT_CONFIG[agent]
}
