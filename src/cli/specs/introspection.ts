import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
import { CLI_NAME, PRODUCT_NAME } from '../../shared/product-brand'

export const INTROSPECTION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent-context'],
    summary: 'Print the machine-readable command schema for agents',
    usage: `${CLI_NAME} agent-context [--json]`,
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      `Pure local read of the command registry — works without a running ${PRODUCT_NAME} app, so it is safe over SSH and in headless contexts.`
    ],
    examples: [`${CLI_NAME} agent-context --json`]
  }
]
