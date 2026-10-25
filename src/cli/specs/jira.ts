import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
import { CLI_NAME } from '../../shared/product-brand'

const SITE_FLAGS = [...GLOBAL_FLAGS, 'site']

export const JIRA_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['jira', 'connection'],
    summary: 'List saved Jira site connections',
    usage: `${CLI_NAME} jira connection [--json]`,
    allowedFlags: [...GLOBAL_FLAGS],
    notes: ['Reports saved connections, not verified Jira access or agent MCP authentication.']
  },
  {
    path: ['jira', 'issue'],
    summary: 'Read a Jira issue',
    usage: `${CLI_NAME} jira issue <key> [--site <id>] [--json]`,
    allowedFlags: [...SITE_FLAGS, 'key'],
    positionalArgs: ['key'],
    examples: [`${CLI_NAME} jira issue ENG-123`, `${CLI_NAME} jira issue ENG-123 --json`]
  },
  {
    path: ['jira', 'list'],
    summary: 'List Jira issues for task triage',
    usage: `${CLI_NAME} jira list [--filter assigned|reported|all|done] [--limit <n>] [--site <id>] [--json]`,
    allowedFlags: [...SITE_FLAGS, 'filter', 'limit'],
    examples: [`${CLI_NAME} jira list --filter assigned --limit 10 --json`]
  },
  {
    path: ['jira', 'search'],
    summary: 'Search Jira issues with JQL',
    usage: `${CLI_NAME} jira search <jql> [--limit <n>] [--site <id>] [--json]`,
    allowedFlags: [...SITE_FLAGS, 'limit', 'jql'],
    positionalArgs: ['jql'],
    examples: [
      `${CLI_NAME} jira search "project = ENG AND status = 'In Progress'"`,
      `${CLI_NAME} jira search "assignee = currentUser() AND updated >= -1d" --json`
    ]
  },
  {
    path: ['jira', 'create'],
    summary: 'Create a Jira issue',
    usage: `${CLI_NAME} jira create --project <idOrKey> --type <issueTypeId> --title <text> [--body <text> | --body-file <path|->] [--fields-json <json>] [--user-field <key>...] [--site <id>] [--json]`,
    allowedFlags: [
      ...SITE_FLAGS,
      'project',
      'type',
      'title',
      'body',
      'body-file',
      'fields-json',
      'user-field'
    ],
    repeatableFlags: ['user-field'],
    examples: [
      `${CLI_NAME} jira create --project ENG --type 10001 --title "Fix login redirect" --json`
    ]
  },
  {
    path: ['jira', 'project', 'list'],
    summary: 'List Jira projects',
    usage: `${CLI_NAME} jira project list [--site <id>] [--json]`,
    allowedFlags: SITE_FLAGS,
    examples: [`${CLI_NAME} jira project list --json`]
  },
  {
    path: ['jira', 'project', 'types'],
    summary: 'List Jira issue types for a project',
    usage: `${CLI_NAME} jira project types --project <idOrKey> [--site <id>] [--json]`,
    allowedFlags: [...SITE_FLAGS, 'project'],
    examples: [`${CLI_NAME} jira project types --project ENG --json`]
  },
  {
    path: ['jira', 'project', 'fields'],
    summary: 'List create fields for a Jira project and issue type',
    usage: `${CLI_NAME} jira project fields --project <idOrKey> --type <id> [--site <id>] [--json]`,
    allowedFlags: [...SITE_FLAGS, 'project', 'type'],
    examples: [`${CLI_NAME} jira project fields --project ENG --type 10001 --json`]
  },
  {
    path: ['jira', 'comment', 'list'],
    summary: 'List comments on a Jira issue',
    usage: `${CLI_NAME} jira comment list <key> [--site <id>] [--json]`,
    allowedFlags: [...SITE_FLAGS, 'key'],
    positionalArgs: ['key'],
    examples: [`${CLI_NAME} jira comment list ENG-123 --json`]
  },
  {
    path: ['jira', 'comment', 'add'],
    summary: 'Comment on a Jira issue',
    usage: `${CLI_NAME} jira comment add <key> (--body <text> | --body-file <path|->) [--site <id>] [--json]`,
    allowedFlags: [...SITE_FLAGS, 'key', 'body', 'body-file'],
    positionalArgs: ['key'],
    examples: [`${CLI_NAME} jira comment add ENG-123 --body "Fix is on staging"`]
  },
  {
    path: ['jira', 'status', 'list'],
    summary: 'List available transitions for a Jira issue',
    usage: `${CLI_NAME} jira status list <key> [--site <id>] [--json]`,
    allowedFlags: [...SITE_FLAGS, 'key'],
    positionalArgs: ['key'],
    examples: [`${CLI_NAME} jira status list ENG-123 --json`]
  },
  {
    path: ['jira', 'status', 'set'],
    summary: 'Transition a Jira issue',
    usage: `${CLI_NAME} jira status set <key> (--to <name> | --to-id <transitionId>) [--site <id>] [--json]`,
    allowedFlags: [...SITE_FLAGS, 'key', 'to', 'to-id'],
    positionalArgs: ['key'],
    examples: [
      `${CLI_NAME} jira status set ENG-123 --to "In Review"`,
      `${CLI_NAME} jira status set ENG-123 --to-id 31 --json`
    ]
  },
  {
    path: ['jira', 'assignee', 'list'],
    summary: 'List assignable users for a Jira issue',
    usage: `${CLI_NAME} jira assignee list <key> [--query <text>] [--site <id>] [--json]`,
    allowedFlags: [...SITE_FLAGS, 'key', 'query'],
    positionalArgs: ['key'],
    examples: [`${CLI_NAME} jira assignee list ENG-123 --query alex --json`]
  },
  {
    path: ['jira', 'assignee', 'set'],
    summary: 'Assign a Jira issue',
    usage: `${CLI_NAME} jira assignee set <key> --to-id <accountId> [--site <id>] [--json]`,
    allowedFlags: [...SITE_FLAGS, 'key', 'to-id'],
    positionalArgs: ['key'],
    examples: [`${CLI_NAME} jira assignee set ENG-123 --to-id 5b10a2844c20165700ede21g --json`]
  },
  {
    path: ['jira', 'assignee', 'clear'],
    summary: 'Clear a Jira issue assignee',
    usage: `${CLI_NAME} jira assignee clear <key> [--site <id>] [--json]`,
    allowedFlags: [...SITE_FLAGS, 'key'],
    positionalArgs: ['key'],
    examples: [`${CLI_NAME} jira assignee clear ENG-123 --json`]
  },
  {
    path: ['jira', 'priority', 'list'],
    summary: 'List Jira priorities',
    usage: `${CLI_NAME} jira priority list [--site <id>] [--json]`,
    allowedFlags: SITE_FLAGS,
    examples: [`${CLI_NAME} jira priority list --json`]
  },
  {
    path: ['jira', 'priority', 'set'],
    summary: 'Set a Jira issue priority',
    usage: `${CLI_NAME} jira priority set <key> --to-id <priorityId> [--site <id>] [--json]`,
    allowedFlags: [...SITE_FLAGS, 'key', 'to-id'],
    positionalArgs: ['key'],
    examples: [`${CLI_NAME} jira priority set ENG-123 --to-id 2 --json`]
  },
  {
    path: ['jira', 'priority', 'clear'],
    summary: 'Clear a Jira issue priority',
    usage: `${CLI_NAME} jira priority clear <key> [--site <id>] [--json]`,
    allowedFlags: [...SITE_FLAGS, 'key'],
    positionalArgs: ['key'],
    examples: [`${CLI_NAME} jira priority clear ENG-123 --json`]
  },
  {
    path: ['jira', 'label', 'set'],
    summary: 'Replace the labels on a Jira issue',
    usage: `${CLI_NAME} jira label set <key> --label <name> [--label <name>...] [--site <id>] [--json]`,
    allowedFlags: [...SITE_FLAGS, 'key', 'label'],
    positionalArgs: ['key'],
    repeatableFlags: ['label'],
    examples: [`${CLI_NAME} jira label set ENG-123 --label backend --label p1 --json`]
  },
  ...(['add', 'rm'] as const).map((verb) => ({
    path: ['jira', 'label', verb],
    summary: verb === 'add' ? 'Add labels to a Jira issue' : 'Remove labels from a Jira issue',
    usage: `${CLI_NAME} jira label ${verb} <key> --label <name>... [--site <id>] [--json]`,
    allowedFlags: [...SITE_FLAGS, 'key', 'label'],
    positionalArgs: ['key'],
    repeatableFlags: ['label'],
    examples: [`${CLI_NAME} jira label ${verb} ENG-123 --label backend --json`]
  }))
]
