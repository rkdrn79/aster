import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
import { CLI_NAME, PRODUCT_NAME } from '../../shared/product-brand'

export const SKILL_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['skills', 'installed'],
    summary: 'List installed skill selectors',
    usage: `${CLI_NAME} skills installed [--json]`,
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Lists discovery IDs and names without reading skill contents into the CLI.',
      'Package metadata is validated when the selected skills are shared.',
      `Use an exact ID or an unambiguous name with \`${CLI_NAME} skills share --skill <selector>\`.`
    ]
  },
  {
    path: ['skills', 'share'],
    summary: 'Publish explicitly selected installed skills behind one unlisted link',
    usage:
      `${CLI_NAME} skills share --skill <selector> [--skill <selector> ...] --bundle-name <name> ` +
      '[--release-notes <text>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'skill', 'bundle-name', 'release-notes'],
    notes: [
      'Requires the default-off permission in Settings → Share Skills.',
      `The bundle name may be human-readable; ${PRODUCT_NAME} converts it to a portable lowercase package name.`,
      `Selectors are exact discovery IDs or unambiguous names from \`${CLI_NAME} skills installed\`.`,
      'Only discovered skill directories can be selected; arbitrary paths and --all are not supported.',
      'The resulting link is unlisted. Anyone with it can inspect and install the bundle.'
    ],
    examples: [
      `${CLI_NAME} skills share --skill frontend --bundle-name "Frontend Skills"`,
      `${CLI_NAME} skills share --skill frontend --skill testing --bundle-name "Team Toolkit" --json`
    ]
  },
  {
    path: ['skills', 'list'],
    summary: `List version-matched skill guides bundled with this ${PRODUCT_NAME} CLI`,
    usage: `${CLI_NAME} skills list [--json]`,
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      `Reads bundled guide metadata locally without contacting the ${PRODUCT_NAME} runtime.`,
      'With --json, prints a topics array of canonical names and one-line descriptions.',
      `Use \`${CLI_NAME} skills get <name>\` for the compact guide, \`--full\` for its full reference package, or \`${CLI_NAME} skills install\` to install skills.`
    ]
  },
  {
    path: ['skills', 'get'],
    aliases: [['skills', 'show']],
    summary: 'Print a version-matched skill guide as Markdown',
    usage: `${CLI_NAME} skills get <topic> [--full | --reference <name>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'topic', 'full', 'reference', 'references'],
    positionalArgs: ['topic'],
    notes: [
      `Reads bundled guide content locally without contacting the ${PRODUCT_NAME} runtime.`,
      'Prints the compact guide by default. Use --full to print the full guide with bundled references when provided.',
      'Use --reference <name> to print one bundled reference alone, which is what an action gate in the compact guide needs; --references lists the available names.',
      'A reference name may be given bare (recovery-and-cleanup) or as the guide spells it (references/recovery-and-cleanup.md).',
      'Use --json for a deterministic object containing canonical topic metadata and content.'
    ],
    examples: [
      `${CLI_NAME} skills get aster-cli`,
      `${CLI_NAME} skills get aster-orchestration --full`,
      `${CLI_NAME} skills get aster-orchestration --references`,
      `${CLI_NAME} skills get aster-orchestration --reference recovery-and-cleanup`
    ]
  },
  {
    path: ['skills', 'install'],
    summary: `Install bundled ${PRODUCT_NAME} skills via the community skills CLI`,
    usage:
      `${CLI_NAME} skills install [--skill <name>]... [--all] [--agent <name>[,<name>]] ` +
      '[--local] [--dry-run] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'skill', 'all', 'agent', 'local', 'dry-run'],
    notes: [
      `Reads the bundled skill registry locally without contacting the ${PRODUCT_NAME} runtime.`,
      'Resolves to the same `npx skills@<pinned> add <repo>/tree/<commit> --skill <name> ...` ' +
        `command used by ${PRODUCT_NAME} Settings, pinned to the commit this ${PRODUCT_NAME} build was made from, ` +
        'plus the non-interactive flags an unattended host needs (`npx --yes` and `-y`), ' +
        'then runs it and forwards its output and exit code.',
      'Installs globally (all projects, adds --global) by default. Use --local to install ' +
        'into the current project instead.',
      `Targets the coding agents ${PRODUCT_NAME} detects on this host, plus the shared ` +
        '.agents/skills directory. Without an explicit target the skills CLI installs ' +
        'into every agent it knows about, which litters a host with config ' +
        'directories for agents it does not have.',
      'Use --agent <name>[,<name>...] to choose targets yourself, or --agent universal ' +
        `for the shared directory alone. Required when ${PRODUCT_NAME} detects no agent.`,
      'Use --dry-run to print the resolved command without running it.',
      'With --json, the skill listing and --dry-run emit JSON; a real install streams ' +
        "npx's own non-JSON output live and rejects --json.",
      'Omit --skill and --all to list installable skill names.',
      'Intended for headless hosts (SSH, containers, CI) with no desktop Settings UI to copy the install command from.'
    ],
    examples: [
      `${CLI_NAME} skills install`,
      `${CLI_NAME} skills install --skill aster-cli --skill aster-orchestration`,
      `${CLI_NAME} skills install --skill aster-cli --local`,
      `${CLI_NAME} skills install --skill aster-cli --agent claude-code,codex`,
      `${CLI_NAME} skills install --all --dry-run`
    ]
  },
  {
    path: ['skills', 'update'],
    summary: `Update ${PRODUCT_NAME} skills to the version this ${PRODUCT_NAME} build ships`,
    usage:
      `${CLI_NAME} skills update [--skill <name>]... [--all] [--agent <name>[,<name>]] ` +
      '[--local] [--dry-run] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'skill', 'all', 'agent', 'local', 'dry-run'],
    notes: [
      `Reads the bundled skill registry locally without contacting the ${PRODUCT_NAME} runtime.`,
      `Runs the same pinned \`npx skills add\` command as \`${CLI_NAME} skills install\`, which ` +
        `replaces each selected skill with the copy this ${PRODUCT_NAME} build ships.`,
      'Updates the global install (all projects, adds --global) by default. Use --local to ' +
        'update the current project instead.',
      `Targets the same agents as \`${CLI_NAME} skills install\`, or only the shared ` +
        '.agents/skills directory when none is detected; use --agent to choose them yourself.',
      'Use --dry-run to print the resolved command without running it.',
      'With --json, the skill listing and --dry-run emit JSON; a real update streams ' +
        "npx's own non-JSON output live and rejects --json.",
      'Omit --skill and --all to list updatable skill names.',
      'Intended for headless hosts (SSH, containers, CI) with no desktop Settings UI to copy the update command from.'
    ],
    examples: [
      `${CLI_NAME} skills update`,
      `${CLI_NAME} skills update --skill aster-cli --skill aster-orchestration`,
      `${CLI_NAME} skills update --skill aster-cli --local`,
      `${CLI_NAME} skills update --all --dry-run`
    ]
  }
]
