export type SlackProjectRoute = {
  projectKey: string
  projectName: string
  workspacePath: string
  channelIds: string[]
  allowedUsers: string[]
  agent: 'codex' | 'claude'
}

export type SlackConnectionStatus = {
  configured: boolean
  connection: 'disabled' | 'connecting' | 'connected' | 'disconnected' | 'error'
  error: string | null
  routes: SlackProjectRoute[]
}
