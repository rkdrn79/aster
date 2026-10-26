import { describe, expect, it } from 'vitest'
import { slackProjectRouteId, upsertSlackProjectRoute } from './slack-project-route-binding'
import type { SlackProjectRoute } from './slack-project-connection'

const alpha: SlackProjectRoute = {
  projectKey: 'project-a',
  projectName: 'Alpha',
  workspacePath: '/work/a',
  channelIds: ['C123'],
  allowedUsers: ['U123'],
  agent: 'codex'
}

describe('Slack project binding', () => {
  it('keeps one channel in one project and allows a distinct project channel', () => {
    expect(() =>
      upsertSlackProjectRoute([alpha], { ...alpha, projectKey: 'project-b', channelIds: ['C123'] })
    ).toThrow('already connected')
    expect(
      upsertSlackProjectRoute([alpha], { ...alpha, projectKey: 'project-b', channelIds: ['C456'] })
    ).toHaveLength(2)
  })

  it('changes thread identity when the workspace or coordinator changes', () => {
    expect(slackProjectRouteId({ ...alpha, workspacePath: '/work/b' })).not.toBe(
      slackProjectRouteId(alpha)
    )
    expect(slackProjectRouteId({ ...alpha, agent: 'claude' })).not.toBe(slackProjectRouteId(alpha))
    expect(
      slackProjectRouteId({
        ...alpha,
        executionHostId: 'runtime:research',
        environmentId: 'research'
      })
    ).not.toBe(slackProjectRouteId(alpha))
  })

  it('deduplicates IDs and rejects a wildcard mixed with user IDs', () => {
    expect(
      upsertSlackProjectRoute([], { ...alpha, channelIds: ['C123', 'C123'] })[0]?.channelIds
    ).toEqual(['C123'])
    expect(() => upsertSlackProjectRoute([], { ...alpha, allowedUsers: ['*', 'U123'] })).toThrow(
      'either *'
    )
  })
})
