import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
import { CLI_NAME } from '../../shared/product-brand'

const RUN_TARGET_FLAGS = ['run', 'project', 'server']

export const RESEARCH_RUN_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['research', 'harness-path'],
    summary: 'Print the version-matched local research harness CLI path',
    usage: `${CLI_NAME} research harness-path [--json]`,
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Use this path with Node to initialize research folders and record or verify Experiments and Runs.',
      'The path belongs to this Aster installation. Resolve it again after an app update or on another host.'
    ]
  },
  {
    path: ['research', 'status'],
    summary: 'Read one Run: execution, SLURM job, last and best metrics, log tail, watches',
    usage: `${CLI_NAME} research status --run <experiment>/<run-id> [--project <path>] [--server <name>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, ...RUN_TARGET_FLAGS],
    notes: [
      'The Run is .aster/experiments/<experiment>/runs/<run-id>/ under the project root (research/experiments/... in projects set up before .aster).',
      '--project defaults to the folder above the current directory that holds .aster/project.json (or research/project.json), or to the project of a job linked with gpu submit --link-run.',
      'Run execution is what run.json records; an agent finishing its turn never makes a Run succeed.'
    ],
    examples: [
      `${CLI_NAME} research status --run lora-r16/seed-42 --json`,
      `${CLI_NAME} research status --run lora-r16/seed-42 --server my-cluster --project /scratch/me/my-paper`
    ]
  },
  {
    path: ['research', 'watch'],
    summary: 'Wake this agent when a Run ends, fails, crosses a metric, stalls, or logs a pattern',
    usage: `${CLI_NAME} research watch --run <experiment>/<run-id> --on <condition>[,<condition>...] [--project <path>] [--server <name>] [--notify self|none] [--message <text>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, ...RUN_TARGET_FLAGS, 'on', 'notify', 'message'],
    repeatableFlags: ['on'],
    notes: [
      'Conditions: exit (any end), failed, succeeded, nan, stall:<minutes>, metric:<name><op><value> with op < <= > >=, log:<regex>.',
      'Quote metric and log conditions for the shell. log:<regex> takes the rest of its value, so put it last or in its own --on.',
      'Each condition fires once. When the Run ends without a terminal condition being asked for, the watch still reports the end and closes.',
      'Aster checks local Runs every 15 s and SSH Runs every 60 s, and types the evidence into this agent once its turn is over. End your turn after creating the watch instead of polling.',
      '--notify none sends only a desktop and phone notification.'
    ],
    examples: [
      `${CLI_NAME} research watch --run lora-r16/seed-42 --on failed,nan,stall:30 --on 'log:OOM|Traceback'`,
      `${CLI_NAME} research watch --run lora-r16/seed-42 --on 'metric:val_loss<0.3,exit' --message 'compare against baseline-r8'`
    ]
  },
  {
    path: ['research', 'watch', 'list'],
    summary: 'List Run watches, what they wait for, and what fired',
    usage: `${CLI_NAME} research watch list [--run <experiment>/<run-id>] [--all] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'run', 'all'],
    notes: ['Active watches by default; --all adds finished and cancelled ones from the last week.']
  },
  {
    path: ['research', 'watch', 'cancel'],
    summary: 'Cancel a Run watch',
    usage: `${CLI_NAME} research watch cancel <id> [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'id'],
    positionalArgs: ['id'],
    examples: [`${CLI_NAME} research watch cancel w-1a2b3c4d5e`]
  }
]
