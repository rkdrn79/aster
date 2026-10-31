import { structuredLaunchFailure } from '@/lib/structured-agent-session-launch-failure'
import { StructuredAgentSessionCreateRefusalError } from '@/lib/structured-agent-session-launch-errors'

// The host's launch refusals by what the user can do about them. A refusal arrives as its bare code;
// see workspace-selectors.ts, pty-registration.ts, spawn-options.ts and host-spawn-admission.ts.
const WORKSPACE_MISSING = new Set([
  'selector_not_found',
  'selector_ambiguous',
  'worktree_execution_host_unresolved',
  'worktree_not_found'
])
const HOST_NOT_READY = new Set([
  'runtime_unavailable',
  'agent_session_claim_unavailable',
  'execution_owner_unavailable',
  'agent_session_ownership_unknown'
])
const REQUEST_REFUSED = new Set([
  'agent_session_operation_invalid',
  'agent_session_operation_conflict',
  'agent_session_operation_expired',
  'agent_session_operation_unknown'
])
const BARE_CODE = /^[\w.:-]+$/

/** A launch failure as a sentence the phone can show; `message` is the host's word for it. */
export function phoneAgentLaunchFailureText(message: string | undefined, agent: string): string {
  const said = message?.trim() ?? ''
  if (!said) {
    return `The host did not start ${agent}.`
  }
  if (WORKSPACE_MISSING.has(said)) {
    return 'The host can’t find this workspace anymore. Choose it again, then retry.'
  }
  if (said === 'structured_agent_session_unsupported' || /\bENOENT\b/.test(said)) {
    return `${agent} isn’t installed or signed in on this host.`
  }
  if (said === 'agent_session_exited_during_start' || said === 'agent_session_identity_required') {
    return `${agent} stopped as it started. It may not be installed or signed in on this host.`
  }
  if (HOST_NOT_READY.has(said) || said.startsWith('terminal_spawn_deferred')) {
    return 'The host isn’t ready to start sessions right now. Try again in a moment.'
  }
  if (REQUEST_REFUSED.has(said)) {
    return `The host turned down this start of ${agent}. Try again.`
  }
  if (/timed out/i.test(said)) {
    // Why not "failed": a lost reply can still mean the session started.
    return `The host didn’t answer in time. ${agent} may still start; check Agents before retrying.`
  }
  return BARE_CODE.test(said) ? `The host couldn’t start ${agent} (${said}).` : said
}

/** A failed chat start in words: the host's sign-in or workspace reason when it gave one. */
export function phoneChatLaunchFailureText(error: unknown, agent: string): string {
  if (error instanceof StructuredAgentSessionCreateRefusalError && error.hostReason === 'agent') {
    return `${agent} isn’t installed or signed in on this host.`
  }
  const failure = structuredLaunchFailure(error)
  if (failure?.causeText) {
    return failure.causeText
  }
  if (
    failure?.code === 'agent_session_operation_invalid' &&
    failure.details?.reason === 'notSignedIn'
  ) {
    return `${agent} isn’t signed in on this host.`
  }
  return phoneAgentLaunchFailureText(
    error instanceof Error ? error.message : typeof error === 'string' ? error : undefined,
    agent
  )
}
