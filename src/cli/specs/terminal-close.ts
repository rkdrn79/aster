import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
import { CLI_NAME } from '../../shared/product-brand'

export const TERMINAL_CLOSE_COMMAND_SPEC: CommandSpec = {
  path: ['terminal', 'close'],
  destructive: true,
  summary: 'Close one terminal, its whole tab, or every terminal in a workspace',
  usage: `${CLI_NAME} terminal close ([--terminal <handle>] [--tab] | --worktree <selector> --all) [--json]`,
  allowedFlags: [...GLOBAL_FLAGS, 'terminal', 'tab', 'worktree', 'all'],
  notes: [
    'Without --all, closes one terminal pane/session; add --tab to close its whole tab.',
    'With --worktree <selector> --all, stops every terminal process owned by that workspace and durably removes its terminal tabs, layouts, and resume records.',
    'Use workspace Sleep when the terminals and agent sessions should resume later.'
  ],
  examples: [
    `${CLI_NAME} terminal close --terminal term_abc123`,
    `${CLI_NAME} terminal close --terminal term_abc123 --tab --json`,
    `${CLI_NAME} terminal close --worktree active --all --json`
  ]
}
