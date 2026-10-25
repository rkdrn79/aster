import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
import { CLI_NAME, PRODUCT_NAME } from '../../shared/product-brand'

export const PROJECT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['project', 'list'],
    summary: `List durable projects known to ${PRODUCT_NAME}`,
    usage: `${CLI_NAME} project list [--json]`,
    allowedFlags: [...GLOBAL_FLAGS],
    examples: [`${CLI_NAME} project list`, `${CLI_NAME} project list --json`]
  },
  {
    path: ['project', 'setups'],
    summary: 'List project host setups',
    usage: `${CLI_NAME} project setups [--project <id>] [--host <host>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'project', 'host'],
    notes: [
      'A setup means a project is available on a host at a concrete filesystem path.',
      `--host runtime:<environment-id> runs the command on that paired ${PRODUCT_NAME} server instead of filtering this runtime; unknown environment ids are rejected rather than answered with an empty list.`,
      `Run \`${CLI_NAME} environment list\` to see the environment ids that runtime:<environment-id> accepts. It matches ids only, never environment names.`,
      "A routed --host runtime:<id> also lists that server's own local-stamped setups, because both spellings name the machine the command reached."
    ],
    examples: [
      `${CLI_NAME} project setups`,
      `${CLI_NAME} project setups --project github:acme/project`,
      `${CLI_NAME} project setups --host local`,
      `${CLI_NAME} project setups --host runtime:03ef704c-b180-4b10-998d-e28fbd5de9a3`
    ]
  },
  {
    path: ['project', 'setup-existing-folder'],
    summary: 'Make a project available on a host by importing an existing folder',
    usage: `${CLI_NAME} project setup-existing-folder --project <id> --host <host> --path <path> [--kind git|folder] [--display-name <name>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'project', 'host', 'path', 'kind', 'display-name'],
    notes: [
      'For remote runtimes, --path must be an absolute path on the remote server.',
      `--host takes local, ssh:<target-id>, runtime:<environment-id>, or the bare host name \`${CLI_NAME} host list\` prints for any of them.`,
      'SSH targets are set up through the desktop UI because the desktop client owns SSH connections.'
    ],
    examples: [
      `${CLI_NAME} project setup-existing-folder --project github:acme/project --host local --path ~/projects/demo`,
      `${CLI_NAME} project setup-existing-folder --project github:acme/project --host runtime:03ef704c-b180-4b10-998d-e28fbd5de9a3 --path /home/me/projects/demo --kind git --json`
    ]
  },
  {
    path: ['project', 'setup-clone'],
    summary: 'Make a project available on a host by cloning a repository',
    usage: `${CLI_NAME} project setup-clone --project <id> --host <host> --url <clone-url> --destination <path> [--display-name <name>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'project', 'host', 'url', 'destination', 'display-name'],
    notes: [
      'For remote runtimes, --destination must be an absolute parent directory on the remote server.',
      `--host takes local, ssh:<target-id>, runtime:<environment-id>, or the bare host name \`${CLI_NAME} host list\` prints for any of them.`,
      'SSH targets are cloned through the desktop UI because the desktop client owns SSH connections.'
    ],
    examples: [
      `${CLI_NAME} project setup-clone --project github:acme/project --host local --url https://github.com/acme/project.git --destination ~/src`,
      `${CLI_NAME} project setup-clone --project github:acme/project --host runtime:03ef704c-b180-4b10-998d-e28fbd5de9a3 --url https://github.com/acme/project.git --destination /srv --json`
    ]
  },
  {
    path: ['project', 'setup-create'],
    summary: 'Create independent project host setup metadata',
    usage: `${CLI_NAME} project setup-create --project <id> --host <host> [--setup-id <id>] [--path <path>] [--kind git|folder] [--display-name <name>] [--worktree-base-path <path>] [--git-username <name>] [--state ready|not-set-up|setting-up|error|unsupported] [--method imported-existing-folder|cloned|provisioned] [--json]`,
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'project',
      'host',
      'setup-id',
      'path',
      'kind',
      'display-name',
      'worktree-base-path',
      'git-username',
      'state',
      'method'
    ],
    notes: [
      'Creates setup metadata without registering a repo compatibility record.',
      `--host takes local, ssh:<target-id>, runtime:<environment-id>, or the bare host name \`${CLI_NAME} host list\` prints for any of them.`,
      `Use setup-existing-folder when ${PRODUCT_NAME} should import and manage an actual checkout path now.`
    ],
    examples: [
      `${CLI_NAME} project setup-create --project github:acme/project --host runtime:03ef704c-b180-4b10-998d-e28fbd5de9a3 --state setting-up --method provisioned --json`
    ]
  },
  {
    path: ['project', 'setup-update'],
    summary: 'Update project host setup metadata',
    usage: `${CLI_NAME} project setup-update --setup <setup-id> [--host <host>] [--display-name <name>] [--path <path>] [--worktree-base-path <path>] [--git-username <name>] [--kind git|folder] [--state ready|not-set-up|setting-up|error|unsupported] [--method legacy-repo|imported-existing-folder|cloned|provisioned] [--json]`,
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'setup',
      'host',
      'display-name',
      'path',
      'worktree-base-path',
      'git-username',
      'kind',
      'state',
      'method'
    ],
    notes: [
      'Repo-backed setups mirror safe fields onto the repo record.',
      '--host picks the setup when the project is set up on more than one host under the same setup id.',
      'Path and availability state changes are only supported for independent setup records.'
    ],
    examples: [
      `${CLI_NAME} project setup-update --setup github:acme/project::gpu --display-name "GPU VM"`,
      `${CLI_NAME} project setup-update --setup github:acme/project::gpu --path /srv/project --state ready --json`
    ]
  },
  {
    path: ['project', 'setup-delete'],
    destructive: true,
    summary: 'Remove a project host setup',
    usage: `${CLI_NAME} project setup-delete --setup <setup-id> [--host <host>] [--force] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'setup', 'host', 'force'],
    notes: [
      'Independent setups are removed directly.',
      'Repo-backed setups remove the registered repo compatibility record.',
      'Refuses while the project has open terminals or saved workspace details; --force removes it anyway.'
    ],
    examples: [`${CLI_NAME} project setup-delete --setup github:acme/project::gpu --json`]
  }
]
