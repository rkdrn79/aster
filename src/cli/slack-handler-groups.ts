import type { HandlerGroup } from './handler-group-manifest'

export const SLACK_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'slack',
    keys: ['slack bridge', 'slack send'],
    load: async () => (await import('./handlers/slack.js')).SLACK_HANDLERS
  },
  {
    name: 'slack-service',
    keys: ['slack service install', 'slack service status', 'slack service uninstall'],
    load: async () => (await import('./handlers/slack-service.js')).SLACK_SERVICE_HANDLERS
  }
]
