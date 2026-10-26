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
const research: SlackProjectRoute = {
  ...local,
  projectKey: 'research',
  executionHostId: 'runtime:research',
  environmentId: 'research',
  workspaceId: 'repo::/project',
  hostKeyFingerprint: 'a'.repeat(64),
  runtimeId: 'runtime-research'
}

describe('Slack route lifetime', () => {
  const dependency = (id: string) => (id === 'research' ? 'ssh-tunnel' : undefined)

  it('blocks moving a Research host route into the app-closed service', () => {
    expect(slackBackgroundRouteBlocker([local, research], dependency)).toContain('needs Aster open')
    expect(() => assertSlackRouteLifetimeCompatible([local, research], true, dependency)).toThrow(
      'needs Aster open'
    )
  })

  it('blocks adding Research host while the service owns the socket, but permits the app-owned socket', () => {
    expect(() => assertSlackRouteLifetimeCompatible([research], true, dependency)).toThrow()
    expect(() => assertSlackRouteLifetimeCompatible([research], false, dependency)).not.toThrow()
    expect(() => assertSlackRouteLifetimeCompatible([local], true, dependency)).not.toThrow()
  })

  it('does not mistake an independent relay runtime for an app-owned SSH tunnel', () => {
    expect(
      slackBackgroundRouteBlocker([{ ...research, environmentId: 'relay' }], dependency)
    ).toBeNull()
  })
})
