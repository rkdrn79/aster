import { describe, expect, it } from 'vitest'
import { StructuredAgentSessionCreateRefusalError } from '@/lib/structured-agent-session-launch-errors'
import {
  phoneAgentLaunchFailureText,
  phoneChatLaunchFailureText
} from './phone-agent-launch-failure'

describe('phone agent launch failure text', () => {
  it('says what the host’s bare codes mean', () => {
    expect(phoneAgentLaunchFailureText('selector_not_found', 'Claude')).toBe(
      'The host can’t find this workspace anymore. Choose it again, then retry.'
    )
    expect(phoneAgentLaunchFailureText('agent_session_exited_during_start', 'Claude')).toBe(
      'Claude stopped as it started. It may not be installed or signed in on this host.'
    )
    expect(phoneAgentLaunchFailureText('spawn claude ENOENT', 'Claude')).toBe(
      'Claude isn’t installed or signed in on this host.'
    )
    expect(phoneAgentLaunchFailureText('terminal_spawn_deferred:pressure', 'Codex')).toBe(
      'The host isn’t ready to start sessions right now. Try again in a moment.'
    )
    expect(
      phoneAgentLaunchFailureText('Request timed out: terminal.createAgentSession', 'Codex')
    ).toBe('The host didn’t answer in time. Codex may still start; check Agents before retrying.')
  })

  it('keeps a host sentence and names an unknown code', () => {
    expect(
      phoneAgentLaunchFailureText(
        'Selected agent is disabled. Choose an enabled agent before creating.',
        'Claude'
      )
    ).toBe('Selected agent is disabled. Choose an enabled agent before creating.')
    expect(phoneAgentLaunchFailureText('brand_new_code', 'Claude')).toBe(
      'The host couldn’t start Claude (brand_new_code).'
    )
    expect(phoneAgentLaunchFailureText(undefined, 'Claude')).toBe('The host did not start Claude.')
  })

  it('reads a chat refusal for a missing agent as not installed or signed in', () => {
    const refusal = new StructuredAgentSessionCreateRefusalError(
      'structured_agent_session_unsupported',
      'structured_agent_session_unsupported',
      undefined,
      'agent'
    )
    expect(phoneChatLaunchFailureText(refusal, 'Claude')).toBe(
      'Claude isn’t installed or signed in on this host.'
    )
  })
})
