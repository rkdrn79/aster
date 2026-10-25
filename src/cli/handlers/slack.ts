import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { slackProjectRouteId } from '../../shared/slack-project-route-binding'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { parseCliAgent } from '../agent-launch-request'
import { getRequiredWorktreeSelector } from '../selectors'
import { RuntimeClientError } from '../runtime-client'
import { runSlackBridge, type SlackBridgeRoute } from '../slack-bridge'
import { postSlackMessage } from '../slack-api'

const routesSchema = z.object({
  version: z.literal(1),
  routes: z.array(
    z
      .object({
        projectKey: z.string().min(1),
        projectName: z.string().min(1),
        workspacePath: z.string().min(1),
        channelIds: z.array(z.string().regex(/^[CG][A-Z0-9]+$/)).min(1),
        allowedUsers: z
          .array(z.union([z.literal('*'), z.string().regex(/^[UW][A-Z0-9]+$/)]))
          .min(1),
        agent: z.enum(['codex', 'claude'])
      })
      .strict()
  )
})

export function readProjectRoutes(path: string): SlackBridgeRoute[] {
  const config = routesSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  const channels = new Set<string>()
  return config.routes.map((route) => {
    if (route.allowedUsers.includes('*') && route.allowedUsers.length !== 1) {
      throw new Error('A Slack route must use either * or a list of user IDs')
    }
    for (const channel of route.channelIds) {
      if (channels.has(channel)) {
        throw new Error(`Slack channel ${channel} has multiple project routes`)
      }
      channels.add(channel)
    }
    return {
      id: slackProjectRouteId(route),
      projectName: route.projectName,
      worktree: `path:${route.workspacePath}`,
      agent: route.agent,
      allowedUsers: new Set(route.allowedUsers),
      allowedChannels: new Set(route.channelIds)
    }
  })
}

function requiredToken(name: string): string {
  const token = process.env[name]?.trim()
  if (!token) {
    throw new RuntimeClientError('invalid_argument', `${name} is required in the environment`)
  }
  return token
}

export const SLACK_HANDLERS: Record<string, CommandHandler> = {
  'slack bridge': async ({ flags, client, cwd }) => {
    if (client.isRemote) {
      throw new RuntimeClientError('invalid_argument', 'Run the Slack bridge on the execution host')
    }
    let routes: SlackBridgeRoute[]
    if (flags.has('routes-file')) {
      if (
        ['worktree', 'agent', 'allowed-users', 'allowed-channels'].some((flag) => flags.has(flag))
      ) {
        throw new RuntimeClientError(
          'invalid_argument',
          '--routes-file cannot be combined with single-workspace flags'
        )
      }
      routes = readProjectRoutes(getRequiredStringFlag(flags, 'routes-file'))
    } else {
      const allowedUsers = new Set(
        getRequiredStringFlag(flags, 'allowed-users')
          .split(',')
          .map((id) => id.trim())
      )
      const channelFlag = flags.get('allowed-channels')
      const allowedChannels =
        typeof channelFlag === 'string'
          ? new Set(channelFlag.split(',').map((id) => id.trim()))
          : undefined
      if (
        allowedUsers.size === 0 ||
        [...allowedUsers].some((id) => !/^[UW][A-Z0-9]+$/.test(id) && id !== '*') ||
        (allowedUsers.has('*') && (!allowedChannels || allowedUsers.size !== 1))
      ) {
        throw new RuntimeClientError(
          'invalid_argument',
          '--allowed-users must contain Slack user IDs, e.g. U123,U456; * is allowed only with --allowed-channels'
        )
      }
      if (
        channelFlag !== undefined &&
        (!allowedChannels ||
          allowedChannels.size === 0 ||
          [...allowedChannels].some((id) => !/^[CG][A-Z0-9]+$/.test(id)))
      ) {
        throw new RuntimeClientError(
          'invalid_argument',
          '--allowed-channels must contain Slack channel IDs, e.g. C123,G456'
        )
      }
      const worktree = await getRequiredWorktreeSelector(flags, 'worktree', cwd, client)
      routes = [
        {
          id: 'cli-default',
          projectName: worktree,
          worktree,
          agent: parseCliAgent(getRequiredStringFlag(flags, 'agent')),
          allowedUsers,
          allowedChannels
        }
      ]
    }
    await runSlackBridge({
      client,
      routes: () => routes,
      appToken: requiredToken('SLACK_APP_TOKEN'),
      botToken: requiredToken('SLACK_BOT_TOKEN'),
      onStatus: (status) => process.stdout.write(`ASTER_SLACK_STATUS:${status}\n`)
    })
  },
  'slack send': async ({ flags }) => {
    await postSlackMessage({
      token: requiredToken('SLACK_BOT_TOKEN'),
      channel: getRequiredStringFlag(flags, 'channel'),
      text: getRequiredStringFlag(flags, 'text'),
      ...(typeof flags.get('thread-ts') === 'string'
        ? { threadTs: flags.get('thread-ts') as string }
        : {})
    })
    process.stdout.write('Slack message sent.\n')
  }
}
