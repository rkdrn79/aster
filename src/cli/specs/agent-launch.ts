import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
import { CLI_NAME, PRODUCT_NAME } from '../../shared/product-brand'

export const AGENT_LAUNCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'list'],
    summary: 'List open agent chats and their orchestration addresses on this host',
    usage: `${CLI_NAME} agent list [--environment <id>|--pairing-code <code>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Lists open structured chats on the selected host, including their workspace, title, state, and exact session address.',
      'An open chat may still be busy or unreachable. The list does not read the conversation or prove that a question was answered.',
      'Use the exact address with orchestration send; do not guess a session ID or start a new agent just to answer a question.'
    ],
    examples: [`${CLI_NAME} agent list --json`]
  },
  {
    path: ['agent', 'launch'],
    summary: 'Start an agent in an existing workspace, as a chat or a terminal',
    usage: `${CLI_NAME} agent launch --agent <id> [--worktree <selector>] [--prompt <text>] [--model <id>] [--effort <level>] [--surface chat|terminal] [--focus] [--retry-launch <operationId>] [--json]`,
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'agent',
      'worktree',
      'prompt',
      'model',
      'effort',
      'surface',
      'focus',
      'retry-launch'
    ],
    notes: [
      'Starts the agent the way a new agent tab does: as a chat when your Chat UI setting is on and the agent and host support it, otherwise as a terminal. The result says which (`outcome.kind`) and why (`receipt.detail`).',
      `--surface chat|terminal picks for this launch instead of your setting. --surface terminal always runs the agent CLI; --surface chat is refused when ${PRODUCT_NAME} can establish before starting anything that this agent cannot open as a chat there. If support cannot be checked, the launch can fall back to a terminal. If chat becomes unavailable after creating a workspace, ${PRODUCT_NAME} keeps the workspace, setup and default tabs, then opens a terminal; the receipt explains the fallback.`,
      `--worktree defaults to the native folder workspace or worktree containing the current directory. For a new checkout with its agent, use \`${CLI_NAME} worktree create --agent\`.`,
      '--model takes a provider model id and --effort a reasoning effort for that model; --effort requires --model. They apply to either surface.',
      'The tab opens without switching focus; pass --focus to switch to it.',
      'If the launch reply is lost, re-issue the same command from the same directory on the same host with --retry-launch <operationId> from the error. Never retry as a fresh launch; older hosts require inspecting the workspace first.'
    ],
    examples: [
      `${CLI_NAME} agent launch --agent codex --json`,
      `${CLI_NAME} agent launch --agent codex --model gpt-6-astra --effort high --prompt "Write the design doc" --json`,
      `${CLI_NAME} agent launch --agent claude --worktree path:/projects/myapp --focus`
    ]
  }
]
