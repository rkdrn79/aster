import { describe, expect, it } from 'vitest'
import { validateWritingAgentBinding } from './research-writing-agent-binding'

const experiment = {
  id: '00000000-0000-4000-8000-000000000001',
  workspaceId: 'workspace-1',
  hostId: 'runtime:host-a'
}
const tab = {
  id: 'tab-1',
  entityId: 'writing-session-1',
  worktreeId: 'workspace-1',
  contentType: 'agent-session' as const,
  agentSessionAgent: 'claude' as const
}
const valid = {
  experiment,
  boundSessionId: tab.entityId,
  currentWorkspaceId: experiment.workspaceId,
  currentHostId: experiment.hostId,
  tab,
  tabOwnerHostId: experiment.hostId
}

describe('Writing agent binding', () => {
  it('accepts only the explicit chat on the active workspace and host', () => {
    expect(validateWritingAgentBinding(valid)).toEqual({
      ok: true,
      binding: { sessionId: 'writing-session-1', tabId: 'tab-1' }
    })
  })

  it.each([
    [{ boundSessionId: null }, 'no-binding'],
    [{ currentWorkspaceId: 'workspace-2' }, 'workspace-changed'],
    [{ currentHostId: 'runtime:host-b' }, 'host-changed'],
    [{ tab: null }, 'chat-closed'],
    [{ tab: { ...tab, entityId: 'other' } }, 'chat-closed'],
    [{ tab: { ...tab, worktreeId: 'workspace-2' } }, 'chat-closed'],
    [{ tab: { ...tab, contentType: 'terminal' as const } }, 'chat-closed'],
    [{ tabOwnerHostId: 'runtime:host-b' }, 'chat-owner-changed'],
    [{ tabOwnerHostId: null }, 'chat-owner-changed']
  ] as const)('refuses a stale or mismatched binding: %s', (override, reason) => {
    expect(validateWritingAgentBinding({ ...valid, ...override })).toEqual({ ok: false, reason })
  })
})
