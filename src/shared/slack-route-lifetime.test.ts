import { describe, expect, it } from 'vitest'
import type { SlackProjectRoute } from './slack-project-connection'
import {
  assertSlackRouteLifetimeCompatible,
  slackBackgroundRouteBlocker
} from './slack-route-lifetime'

const local: SlackProjectRoute = {
  projectKey: 'local',
  projectName: 'Local',
  workspacePath: '/project',
  channelIds: ['C123'],
  allowedUsers: ['U123'],
  agent: 'codex'
}
const vip: SlackProjectRoute = {
  ...local,
  projectKey: 'vip',
  executionHostId: 'runtime:vip',
  environmentId: 'vip',
  workspaceId: 'repo::/project',
  hostKeyFingerprint: 'a'.repeat(64),
  runtimeId: 'runtime-vip'
}

describe('Slack route lifetime', () => {
  const dependency = (id: string) => (id === 'vip' ? 'ssh-tunnel' : undefined)

  it('blocks moving a VIP route into the app-closed service', () => {
    expect(slackBackgroundRouteBlocker([local, vip], dependency)).toContain('needs Aster open')
    expect(() => assertSlackRouteLifetimeCompatible([local, vip], true, dependency)).toThrow(
      'needs Aster open'
    )
  })

  it('blocks adding VIP while the service owns the socket, but permits the app-owned socket', () => {
    expect(() => assertSlackRouteLifetimeCompatible([vip], true, dependency)).toThrow()
    expect(() => assertSlackRouteLifetimeCompatible([vip], false, dependency)).not.toThrow()
    expect(() => assertSlackRouteLifetimeCompatible([local], true, dependency)).not.toThrow()
  })

  it('does not mistake an independent relay runtime for an app-owned SSH tunnel', () => {
    expect(slackBackgroundRouteBlocker([{ ...vip, environmentId: 'relay' }], dependency)).toBeNull()
  })
})
