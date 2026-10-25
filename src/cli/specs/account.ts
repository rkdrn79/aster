import { GLOBAL_FLAGS, type CommandSpec } from '../args'
import { CLI_NAME, PRODUCT_NAME } from '../../shared/product-brand'

// Why: the desktop "Add account" button is disabled when the UI drives a remote
// runtime (a headless server). These commands run the interactive agent login
// (`claude login` / `codex login`) in the caller's own terminal on the host and
// register the captured account with the local runtime, giving headless hosts a
// way to manage Claude and Codex accounts.
export const ACCOUNT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['account', 'add'],
    summary: `Add a managed agent account by signing in on this ${PRODUCT_NAME} host`,
    usage: `${CLI_NAME} account add [--agent claude|codex|opencode|devin] [--label <name>] [--integration <id>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'agent', 'label', 'integration'],
    notes: [
      `Runs the agent login (\`claude login\` / \`codex login\`) in this terminal, then registers the account with the local ${PRODUCT_NAME} runtime.`,
      'Codex uses device authorization so the browser can complete sign-in from a different machine.',
      'OpenCode 2 uses `opencode auth login --standalone` in private XDG directories. Devin uses `devin auth login --force-manual-token-flow`.',
      'Use --integration <id> to skip the OpenCode integration picker; --label names the saved OpenCode or Devin profile.',
      `OpenCode and Devin profiles apply to new explicit host agent launches. Direct SSH relay and Windows-hosted WSL selection are not supported; run the command on a headless ${PRODUCT_NAME} runtime on that host.`,
      'Sign in with the account you want to add (e.g. use a private/incognito browser window for a second account).',
      `--agent defaults to claude. Requires the ${PRODUCT_NAME} runtime to be running on this machine.`
    ],
    examples: [`${CLI_NAME} account add`, `${CLI_NAME} account add --agent codex`]
  },
  {
    path: ['account', 'list'],
    summary: `List managed agent accounts on this ${PRODUCT_NAME} host`,
    usage: `${CLI_NAME} account list [--agent opencode|devin] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'agent'],
    notes: [
      'Lists the accounts on this machine. `--environment` / `--pairing-code` are rejected rather than ignored; run it on the host whose accounts you want to see.'
    ],
    examples: [`${CLI_NAME} account list`]
  },
  {
    path: ['account', 'select'],
    summary: 'Select an OpenCode or Devin profile for new agent launches',
    usage: `${CLI_NAME} account select --agent opencode|devin --account <id|system> [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'agent', 'account']
  },
  {
    path: ['account', 'rm'],
    aliases: [['account', 'remove']],
    destructive: true,
    summary: 'Remove a managed OpenCode or Devin profile and its private data',
    usage: `${CLI_NAME} account rm --agent opencode|devin --account <id> [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'agent', 'account'],
    notes: [
      'Deletes credentials and conversation data in the managed profile. Stop its running agents first. System credentials are never removed.'
    ]
  }
]
