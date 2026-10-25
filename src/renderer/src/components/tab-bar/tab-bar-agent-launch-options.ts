import { buildTabAgentLaunchOptionsFromRows } from './tab-agent-launch-options'
import type { NewTabAgentMenuModel } from './use-new-tab-agent-menu-rows'

export function tabBarAgentLaunchOptions(
  model: NewTabAgentMenuModel,
  chatOnly: boolean,
  commandOverrides: Parameters<typeof buildTabAgentLaunchOptionsFromRows>[1]
) {
  const rows = model.state === 'settled' ? model.rows : []
  return buildTabAgentLaunchOptionsFromRows(
    chatOnly ? rows.filter((row) => row.kind === 'chat') : rows,
    commandOverrides
  )
}
