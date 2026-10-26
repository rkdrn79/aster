import type { SlackProjectRoute } from './slack-project-connection'

export const SSH_SLACK_BACKGROUND_BLOCKER =
  'This SSH-hosted Slack project needs Aster open because the app owns its SSH tunnel.'

export function slackBackgroundRouteBlocker(
  routes: readonly SlackProjectRoute[],
  connectionDependency: (environmentId: string) => string | undefined
): string | null {
  try {
    return routes.some(
      (route) => route.environmentId && connectionDependency(route.environmentId) === 'ssh-tunnel'
    )
      ? SSH_SLACK_BACKGROUND_BLOCKER
      : null
  } catch {
    return 'A remote Slack host must be reconnected before background delivery can be enabled.'
  }
}

/** One rule in both directions: no service handoff with an SSH route, no SSH route with a service. */
export function assertSlackRouteLifetimeCompatible(
  routes: readonly SlackProjectRoute[],
  backgroundEnabled: boolean,
  connectionDependency: (environmentId: string) => string | undefined
): void {
  if (!backgroundEnabled) {
    return
  }
  const blocker = slackBackgroundRouteBlocker(routes, connectionDependency)
  if (blocker) {
    throw new Error(blocker)
  }
}
