import { GLOBAL_FLAGS, type CommandSpec } from '../args'
import { CLI_NAME } from '../../shared/product-brand'

// Run namespace commands: create, bind and inspect a coordinator's home inbox.
export const ORCHESTRATION_RUN_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['orchestration', 'run-create'],
    summary: 'Create and bind a lightweight orchestration Run',
    usage: `${CLI_NAME} orchestration run-create --objective <text> [--from <handle>] [--retry-request <id>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'objective', 'from', 'retry-request'],
    identityFlagRoles: { from: 'caller' },
    notes: [
      'A Run is a namespace and home inbox. It never schedules or places workers.',
      '--retry-request is only for exact recovery after an unknown mutation result.'
    ]
  },
  {
    path: ['orchestration', 'run-use'],
    summary: 'Bind this coordinator to an existing Run',
    usage: `${CLI_NAME} orchestration run-use --id <run_id> [--from <handle>] [--takeover-legacy] [--retry-request <id>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'id', 'from', 'takeover-legacy', 'retry-request'],
    identityFlagRoles: { from: 'caller' },
    notes: [
      '--takeover-legacy must run in the live coordinator agent terminal it binds; it preserves existing worker assignments.'
    ]
  },
  {
    path: ['orchestration', 'run-current'],
    summary: 'Show the Run bound to this coordinator',
    usage: `${CLI_NAME} orchestration run-current [--from <handle>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'from'],
    identityFlagRoles: { from: 'caller' }
  },
  {
    path: ['orchestration', 'run-list'],
    summary: 'List lightweight orchestration Runs',
    usage: `${CLI_NAME} orchestration run-list [--limit <n>] [--cursor <cursor>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'limit', 'cursor']
  },
  {
    path: ['orchestration', 'run-show'],
    summary: 'Show one lightweight orchestration Run',
    usage: `${CLI_NAME} orchestration run-show --id <run_id> [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'id']
  }
]
