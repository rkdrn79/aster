import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import type { RuntimeMobileSessionTabsResult } from '../../shared/runtime-types'

type AgentChat = {
  workspaceId: string
  sessionId: string
  agent: string
  title: string
  state: string | null
}

export function openAgentChats(snapshots: readonly RuntimeMobileSessionTabsResult[]): AgentChat[] {
  return snapshots.flatMap((snapshot) =>
    snapshot.tabs.flatMap((tab) =>
      tab.type === 'agent-session'
        ? [
            {
              workspaceId: snapshot.worktree,
              sessionId: tab.sessionId,
              agent: tab.agent,
              title: tab.title,
              state: tab.chatStatus?.state ?? null
            }
          ]
        : []
    )
  )
}

export const AGENT_LIST_HANDLERS: Record<string, CommandHandler> = {
  'agent list': async ({ client, json }) => {
    const response = await client.call<{ snapshots: RuntimeMobileSessionTabsResult[] }>(
      'session.tabs.listAll'
    )
    const agents = openAgentChats(response.result.snapshots)
    printResult({ ...response, result: { agents } }, json, ({ agents: listed }) =>
      listed.length === 0
        ? 'No open agent chats on this host.'
        : listed
            .map(
              (agent) =>
                `${agent.title} (${agent.agent}, ${agent.state ?? 'state unknown'})\n  ${agent.workspaceId}\n  orca_session_id:${agent.sessionId}`
            )
            .join('\n')
    )
  }
}
