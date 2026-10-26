export type SlackProjectRoute = {
  projectKey: string
  projectName: string
  workspacePath: string
  /** Absent only for bindings saved before host-aware routing; those are local. */
  executionHostId?: string
  workspaceId?: string
  /** Paired runtime identity pinned when a remote binding is approved. Never a credential. */
  environmentId?: string
  hostKeyFingerprint?: string
  runtimeId?: string
  channelIds: string[]
  allowedUsers: string[]
  agent: 'codex' | 'claude'
}

export type SlackBackgroundStatus = {
  /** Why this build or platform cannot keep Slack connected with the app closed, or null. */
  unavailableReason: string | null
  enabled: boolean
  /** True when turning this on also installed the background runtime (`serve service`). */
  installedRuntime: boolean
}

export type SlackConnectionStatus = {
  configured: boolean
  connection: 'disabled' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'standby'
  error: string | null
  routes: SlackProjectRoute[]
  /** Which bridge holds the Socket Mode connection right now. */
  owner: 'app' | 'service' | 'other' | null
  /** Catch-up and scope notes from the active bridge. */
  notice: string | null
  background: SlackBackgroundStatus
}
