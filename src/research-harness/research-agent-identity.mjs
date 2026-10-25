const codexMarkers = [
  'CODEX_THREAD_ID',
  'CODEX_SANDBOX',
  'CODEX_SANDBOX_NETWORK_DISABLED',
  'CODEX_MANAGED_BY_NPM',
  'CODEX_MANAGED_BY_BUN'
]

function agentProvider(env) {
  if (env.CLAUDECODE === '1' || env.CLAUDE_CODE_ENTRYPOINT) {
    return 'claude-code'
  }
  if (codexMarkers.some((key) => env[key])) {
    return 'codex'
  }
  if (env.GEMINI_CLI === '1') {
    return 'gemini-cli'
  }
  // Why: AI_AGENT is a cross-tool convention, e.g. "claude-code_2-1-309_agent".
  return env.AI_AGENT?.split('_')[0] || null
}

/**
 * The agent that launched a command, from the env Aster injects into agent terminals and the env
 * agent CLIs set for their own tool commands. `sessionId` is only Aster's session ID.
 */
export function agentIdentityFromEnvironment(env = process.env) {
  const identity = {
    provider: agentProvider(env),
    sessionId: env.ORCA_AGENT_SESSION_ID || null,
    terminalHandle: env.ORCA_TERMINAL_HANDLE || null,
    paneKey: env.ORCA_PANE_KEY || env.ORCA_AGENT_PANE || null,
    providerSessionId: env.CLAUDE_CODE_SESSION_ID || env.CODEX_THREAD_ID || null
  }
  return Object.values(identity).some(Boolean) ? identity : null
}
