import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
import { CLI_NAME } from '../../shared/product-brand'

export const SLACK_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['slack', 'bridge'],
    summary: 'Connect authorized Slack DMs or channel mentions to one Aster workspace and agent',
    usage: `${CLI_NAME} slack bridge --worktree <selector> --agent <codex|claude> --allowed-users <U123,U456|*> [--allowed-channels <C123,G456>]`,
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'worktree',
      'agent',
      'allowed-users',
      'allowed-channels',
      'routes-file'
    ],
    notes: [
      'Requires SLACK_APP_TOKEN (connections:write) and SLACK_BOT_TOKEN in the process environment.',
      'Without --allowed-channels, only DMs from listed users start work (message.im, im:history).',
      'With --allowed-channels, only app_mention events from those channels start work (app_mentions:read). * allows any member there. The Slack bot display name can be Aster-username.',
      'Each Slack thread keeps its own Aster chat. Replies require chat:write.',
      '--routes-file reads validated channel-to-project bindings from an Aster profile; it cannot be combined with --worktree.',
      'The bridge must remain running to receive messages and deliver replies. No public HTTP endpoint is opened.'
    ]
  },
  {
    path: ['slack', 'send'],
    summary: 'Post a message to a Slack conversation',
    usage: `${CLI_NAME} slack send --channel <channel-id> --text <message> [--thread-ts <timestamp>]`,
    allowedFlags: [...GLOBAL_FLAGS, 'channel', 'text', 'thread-ts'],
    notes: ['Requires SLACK_BOT_TOKEN in the process environment. No agent is started.']
  }
]
