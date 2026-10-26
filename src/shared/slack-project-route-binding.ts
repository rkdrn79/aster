import { createHash } from 'node:crypto'
import type { SlackProjectRoute } from './slack-project-connection'

export function slackProjectRouteId(route: SlackProjectRoute): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        route.projectKey,
        route.executionHostId ?? 'local',
        route.environmentId ?? null,
        route.workspaceId ?? route.workspacePath,
        route.channelIds,
        route.agent
      ])
    )
    .digest('hex')
    .slice(0, 24)
}

export function upsertSlackProjectRoute(
  routes: readonly SlackProjectRoute[],
  route: SlackProjectRoute
): SlackProjectRoute[] {
  const channelIds = [...new Set(route.channelIds)]
  const allowedUsers = [...new Set(route.allowedUsers)]
  if (allowedUsers.includes('*') && allowedUsers.length !== 1) {
    throw new Error('Use either * or a list of Slack user IDs')
  }
  const claimed = new Set(
    routes.filter((item) => item.projectKey !== route.projectKey).flatMap((item) => item.channelIds)
  )
  if (channelIds.some((id) => claimed.has(id))) {
    throw new Error('A Slack channel is already connected to another project')
  }
  return [
    ...routes.filter((item) => item.projectKey !== route.projectKey),
    { ...route, channelIds, allowedUsers }
  ]
}
