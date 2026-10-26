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
      'routes-file',
      'service'
    ],
    notes: [
      'Requires SLACK_APP_TOKEN (connections:write) and SLACK_BOT_TOKEN in the process environment.',
      'Without --allowed-channels, only DMs from listed users start work (message.im, im:history).',
      'With --allowed-channels, only app_mention events from those channels start work (app_mentions:read). * allows any member there. The Slack bot display name can be Aster-username.',
      'Each Slack thread keeps its own Aster chat. Replies require chat:write.',
      '--routes-file reads validated channel-to-project bindings from an Aster profile; it cannot be combined with --worktree.',
      'The bridge must remain running to receive messages and deliver replies. No public HTTP endpoint is opened.',
      'On each (re)connect it reads allowed channels since it was last connected (at most 24 h and 200 messages per channel) and answers missed mentions, marked as received while offline. This needs channels:history and groups:history; without them catch-up is skipped.',
      "--service reads the tokens from the login Keychain (macOS) or the profile's owner-only token file (Linux) instead of the environment. Only one bridge per app token connects; others wait."
    ]
  },
  {
    path: ['slack', 'service', 'install'],
    summary: 'Keep the Slack bridge running as a per-user background service',
    usage: `${CLI_NAME} slack service install (--routes-file <path> | --worktree path:<dir> --agent <codex|claude> --allowed-users <U123|*> [--allowed-channels <C123>]) [--command <path>] [--dry-run] [--json]`,
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'worktree',
      'agent',
      'allowed-users',
      'allowed-channels',
      'routes-file',
      'command',
      'dry-run'
    ],
    notes: [
      'macOS writes a LaunchAgent and stores SLACK_APP_TOKEN and SLACK_BOT_TOKEN from the environment in the login Keychain; Linux writes a systemd user unit and a 0600 token file in the profile. Tokens never go into the unit or its arguments.',
      `The service restarts on failure. Agents answer only while a runtime serves the profile: the app, or \`${CLI_NAME} serve service install\`.`,
      'Not available on Windows yet.'
    ]
  },
  {
    path: ['slack', 'service', 'status'],
    summary: 'Show whether the Slack bridge service is running',
    usage: `${CLI_NAME} slack service status [--json]`,
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['slack', 'service', 'uninstall'],
    summary: 'Stop the Slack bridge service and remove its stored tokens',
    usage: `${CLI_NAME} slack service uninstall [--json]`,
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['slack', 'project', 'setup'],
    summary: 'Configure a project-owned Slack bridge on this server from a trusted desktop',
    usage: `${CLI_NAME} slack project setup`,
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['slack', 'project', 'status'],
    summary: 'Read this server’s Slack connection for one project',
    usage: `${CLI_NAME} slack project status --project-key <key>`,
    allowedFlags: [...GLOBAL_FLAGS, 'project-key']
  },
  {
    path: ['slack', 'project', 'remove'],
    summary: 'Remove a project from this server’s Slack connection',
    usage: `${CLI_NAME} slack project remove --project-key <key>`,
    allowedFlags: [...GLOBAL_FLAGS, 'project-key']
  },
  {
    path: ['slack', 'send'],
    summary: 'Post a message to a Slack conversation',
    usage: `${CLI_NAME} slack send --channel <channel-id> --text <message> [--thread-ts <timestamp>]`,
    allowedFlags: [...GLOBAL_FLAGS, 'channel', 'text', 'thread-ts'],
    notes: ['Requires SLACK_BOT_TOKEN in the process environment. No agent is started.']
  }
]
