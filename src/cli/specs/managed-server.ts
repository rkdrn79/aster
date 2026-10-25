import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
import { CLI_NAME, PRODUCT_NAME } from '../../shared/product-brand'

const SELECTOR_NOTE = `--environment names a managed ${PRODUCT_NAME} server this machine deployed over SSH (see \`${CLI_NAME} environment list\`); it is a selector here, not a routing flag.`
const DESKTOP_NOTE = `Runs on this machine’s ${PRODUCT_NAME} desktop app, the same action as Settings > ${PRODUCT_NAME} on your SSH hosts. A runtime without the SSH registry (headless \`${CLI_NAME} serve\`) refuses it.`

export const MANAGED_SERVER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['environment', 'status'],
    summary: `Show a managed ${PRODUCT_NAME} server’s active version, terminals and pending work`,
    usage: `${CLI_NAME} environment status --environment <selector> [--json]`,
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [SELECTOR_NOTE, DESKTOP_NOTE],
    examples: [`${CLI_NAME} environment status --environment build-box`]
  },
  {
    path: ['environment', 'update'],
    summary: `Update a managed ${PRODUCT_NAME} server to this build’s version`,
    usage: `${CLI_NAME} environment update --environment <selector> [--force] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'force'],
    notes: [
      'Without --force, an update that would restart over running terminals is deferred and reported, not applied.',
      SELECTOR_NOTE,
      DESKTOP_NOTE
    ],
    examples: [`${CLI_NAME} environment update --environment build-box`]
  },
  {
    path: ['environment', 'rollback'],
    destructive: true,
    summary: `Roll a managed ${PRODUCT_NAME} server back to its previous version`,
    usage: `${CLI_NAME} environment rollback --environment <selector> [--json]`,
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [SELECTOR_NOTE, DESKTOP_NOTE]
  },
  {
    path: ['environment', 'recover'],
    summary: `Finish or undo a managed ${PRODUCT_NAME} server’s interrupted update, rollback or stop`,
    usage: `${CLI_NAME} environment recover --environment <selector> [--accept-changed-state --yes] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'accept-changed-state', 'yes'],
    notes: [
      `When a rejected build changed profile state, recover refuses rather than restart the previous build over it. --accept-changed-state --yes restores the prelaunch snapshot instead, the same as Restore in Settings > ${PRODUCT_NAME} on your SSH hosts; what the rejected build changed is discarded.`,
      SELECTOR_NOTE,
      DESKTOP_NOTE
    ],
    examples: [
      `${CLI_NAME} environment recover --environment build-box`,
      `${CLI_NAME} environment recover --environment build-box --accept-changed-state --yes`
    ]
  },
  {
    path: ['environment', 'stop'],
    destructive: true,
    summary: `Stop a managed ${PRODUCT_NAME} server and unlink it from this machine (decommission)`,
    usage: `${CLI_NAME} environment stop --environment <selector> --yes [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'yes'],
    notes: [
      'Stops orcad on the SSH host and, once the host proves it exited, removes the server from this machine. Its terminals end. Requires --yes.',
      `If the host cannot prove orcad exited, the server stays linked and the refusal says why; nothing is removed on a guess. For a host that is gone for good, use \`${CLI_NAME} environment forget\`.`,
      `If this server is the default host for new projects, choose another one first. \`${CLI_NAME} environment cancel-stop\` withdraws a stop orcad has not acted on yet.`,
      SELECTOR_NOTE,
      DESKTOP_NOTE
    ],
    examples: [`${CLI_NAME} environment stop --environment build-box --yes`]
  },
  {
    path: ['environment', 'forget'],
    destructive: true,
    summary: `Unlink a managed ${PRODUCT_NAME} server whose SSH host is gone, without stopping it`,
    usage: `${CLI_NAME} environment forget --environment <selector> --yes [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'yes'],
    notes: [
      'Removes the server from this machine without contacting its host, so the SSH host can then be removed. Use it when the host was deleted or can never be reached again. Requires --yes.',
      'Nothing on the host is stopped: if it comes back, orcad may still be running there, and connecting to it again relinks it.',
      SELECTOR_NOTE,
      DESKTOP_NOTE
    ],
    examples: [`${CLI_NAME} environment forget --environment build-box --yes`]
  },
  {
    path: ['environment', 'cancel-stop'],
    summary: `Withdraw a managed ${PRODUCT_NAME} server stop that orcad has not acted on yet`,
    usage: `${CLI_NAME} environment cancel-stop --environment <selector> [--json]`,
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [SELECTOR_NOTE, DESKTOP_NOTE]
  }
]
