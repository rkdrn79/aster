import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
import { CLI_NAME, PRODUCT_NAME } from '../../shared/product-brand'

export const AGENT_HOOK_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'hooks', 'prepare-codex'],
    summary: `Prepare a WSL pane's ${PRODUCT_NAME}-managed Codex home before a shell launch`,
    usage: `${CLI_NAME} agent hooks prepare-codex`,
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['agent', 'hooks', 'status'],
    summary: `Show whether ${PRODUCT_NAME}-managed agent status hooks are enabled`,
    usage: `${CLI_NAME} agent hooks status [--json]`,
    allowedFlags: [...GLOBAL_FLAGS],
    examples: [`${CLI_NAME} agent hooks status`, `${CLI_NAME} agent hooks status --json`]
  },
  {
    path: ['agent', 'hooks', 'off'],
    summary: `Disable ${PRODUCT_NAME}-managed agent status hooks and remove local hook entries`,
    usage: `${CLI_NAME} agent hooks off [--json]`,
    allowedFlags: [...GLOBAL_FLAGS],
    examples: [`${CLI_NAME} agent hooks off`]
  },
  {
    path: ['agent', 'hooks', 'on'],
    summary: `Enable ${PRODUCT_NAME}-managed agent status hooks`,
    usage: `${CLI_NAME} agent hooks on [--json]`,
    allowedFlags: [...GLOBAL_FLAGS],
    examples: [`${CLI_NAME} agent hooks on`]
  }
]
