#!/usr/bin/env node
import { constants as osConstants } from 'node:os'
import { resolveProjectRoot } from './research-catalog.mjs'
import {
  addClaim,
  addClaimEvidence,
  auditClaims,
  listClaims,
  refreshClaim,
  removeClaim,
  scanUnbackedNumbers
} from './research-claims.mjs'
import {
  integerOption,
  jsonObjectOption,
  numberOption,
  parseCommandArguments,
  requestsJson,
  splitCommand
} from './research-cli-arguments.mjs'
import { textOutput } from './research-cli-text-output.mjs'
import * as analysisCli from './research-analysis-cli.mjs'
import * as briefCli from './research-brief-cli.mjs'
import * as proposalCli from './research-proposal-cli.mjs'
import * as qualityCli from './research-quality-cli.mjs'
import * as organizeCli from './research-organize-cli.mjs'
import * as ratingsCli from './research-ratings-cli.mjs'
import { HarnessError, harnessErrorCode } from './research-harness-error.mjs'
import { appendLoopNote, readLoopLedger } from './research-loop-ledger.mjs'
import { parseMetricValue } from './research-metric-events.mjs'
import { listRuns, projectContext, showRun } from './research-project-context.mjs'
import { migrateProjectLayout } from './research-migrate.mjs'
import { createExperiment, createRun, initializeResearchProject } from './research-project.mjs'
import { execRun } from './research-run-exec.mjs'
import { attachArtifact, finishRun, logMetric } from './research-run-updates.mjs'
import { validateResearchProject } from './research-validation.mjs'
import { verifyResearch } from './research-verification.mjs'

const coreUsage = `Aster research project harness

Usage: node cli.mjs <command> [options] [--project PATH] [--json]

--project defaults to the nearest ancestor of the current directory that contains
.aster/project.json (or a pre-ADR-004 research/project.json), else the current directory. --json prints one JSON object:
{"ok":true,...} on success or {"ok":false,"error":{"code","message"}} with exit 1.
Runs are referenced as <experiment>/<run> (a bare run ID works when unique).

Project
  init [--manuscript TEX] [--pdf PDF] [--bibliography BIB] [--papers DIR]
                                         Create missing .aster/ and paper/ files; keeps edited files.
                                         Path options point the catalog at existing files instead
  migrate [--paper-dir DIR] [--dry-run]  Move a pre-ADR-004 research/ tree to .aster/ and paper/
  experiment --name NAME                 Create or reuse .aster/experiments/<slug>
  validate                               Check catalog, Runs, metrics, and claims (exit 1 on issues)
  verify [--experiment SLUG] [--run EXPERIMENT/RUN] [--paper]
                                         Read-only evidence gate: catalog, open findings, Run
                                         state, and optional manuscript claims/numbers. Exit 1
                                         when blocked; checks_clear is not scientific proof.
  context [--experiment SLUG] [--limit N]
                                         Compact summary for an agent prompt: Runs with state and
                                         last/best metrics, loop budget, claims audit summary

Runs
  run exec --experiment SLUG [--name NAME] [--id ID] [--config PROJECT-JSON] [--cwd DIR]
           [--preflight|--loop-preflight]
           [--metric-def NAME:minimize|maximize[:UNIT]]... [--dataset-id ID ...] -- COMMAND [ARGS...]
                                         Create a Run, capture git HEAD/dirty/code.patch, host, argv,
                                         agent identity; run COMMAND with output tee'd to train.log;
                                         record ASTER_METRIC lines in metrics.jsonl and ASTER_MEDIA
                                         lines in media.jsonl; record the exit; write summary.json.
                                         Exit code mirrors COMMAND. With --json the command's output
                                         goes to stderr and stdout carries only the result.
  run list [--experiment SLUG] [--state STATE]
  run show EXPERIMENT/RUN [--log-lines N]
  run log-metric --run EXPERIMENT/RUN [--step N] [--split NAME] [--timestamp ISO] NAME=VALUE...
  run finish --run EXPERIMENT/RUN --status succeeded|failed|cancelled [--exit-code N] [--note TEXT] [--force]
  run attach-artifact --run EXPERIMENT/RUN --file PATH [--mode copy|reference] [--name NAME]
                      [--kind image|video|audio] [--step N] [--label TEXT] [--sample ID]
                                         Media files (by extension, or with --kind) inside the project
                                         also get a media.jsonl row with step, label, and sample
  new-run --experiment SLUG --name NAME [--id ID] [--config PROJECT-JSON] [--command TEXT]
          [--commit SHA --capture-phase PHASE --captured-at ISO] [--metric-def ...]
          [--dataset-id ID --dataset-revision REV --split SPLIT --evaluator-revision REV]
                                         Register a Run launched elsewhere; never executes anything

Metric and media line protocol (stdout or stderr of run exec):
  ASTER_METRIC {"step":100,"split":"val","metrics":{"loss":0.41,"acc":0.88}}
  A bare JSON object line with a "metrics" object on stdout is also recorded.
  ASTER_MEDIA {"path":"samples/step_1000.png","step":1000,"label":"samples"}
  records an image, video, or audio file (optional "kind", "sampleId"; path relative to the
  command's cwd or absolute) in the Run's media.jsonl. Files outside the project, missing files,
  and other extensions are refused with a notice. Extensions: png jpg jpeg gif webp ·
  mp4 m4v mov webm · mp3 wav m4a aac ogg oga flac opus.

Claims (.aster/claims.json)
  claim add --text TEXT --run EXPERIMENT/RUN --metric NAME [evidence options]
            [--file MANUSCRIPT-TEX] [--line N] [--anchor TEXT] [--id ID] [--created-by agent|user]
  claim add-evidence --id CLAIM --run EXPERIMENT/RUN --metric NAME [evidence options]
  claim list | claim audit [--id CLAIM] | claim refresh --id CLAIM | claim remove --id CLAIM
  claim scan [--file MANUSCRIPT-TEX]     List result-like numbers no claim backs
  evidence options: [--split NAME] [--select last|best|step] [--step N] [--direction minimize|maximize]
                    [--value V] [--tolerance T] [--format fixed:N|percent:N] [--supporting]
  Without --value the value is read from metrics.jsonl; a --value that disagrees is refused.
  audit exits 1 when a claim is mismatch or missing-evidence.

Autonomous loop ledger (.aster/experiments/<slug>/loop.jsonl)
  loop note --experiment SLUG --kind objective|hypothesis|run|result|decision|checkpoint --text TEXT
            [--run EXPERIMENT/RUN] [--hypothesis ENTRY-ID] [--data JSON-OBJECT]
  loop show --experiment SLUG [--limit N]
`

const evidenceValues = [
  '--run',
  '--metric',
  '--split',
  '--select',
  '--step',
  '--direction',
  '--value',
  '--tolerance',
  '--format'
]
const runCreationValues = [
  '--experiment',
  '--name',
  '--id',
  '--config',
  '--dataset-id',
  '--dataset-revision',
  '--split',
  '--evaluator-revision'
]

function runCreationOptions(options) {
  return {
    experiment: options['--experiment'],
    name: options['--name'],
    id: options['--id'],
    config: options['--config'],
    metricDefinitions: options['--metric-def'],
    datasetId: options['--dataset-id'],
    datasetRevision: options['--dataset-revision'],
    split: options['--split'],
    evaluatorRevision: options['--evaluator-revision']
  }
}

function evidenceInput(options) {
  return {
    run: options['--run'],
    metric: options['--metric'],
    split: options['--split'] ?? null,
    select: options['--select'],
    step: numberOption(options, '--step'),
    direction: options['--direction'],
    value: numberOption(options, '--value'),
    tolerance: numberOption(options, '--tolerance'),
    format: options['--format'],
    role: options['--supporting'] ? 'supporting' : 'stated'
  }
}

function metricAssignments(positionals) {
  const metrics = {}
  for (const assignment of positionals) {
    const equals = assignment.indexOf('=')
    if (equals <= 0) {
      throw new HarnessError('usage', `Expected NAME=VALUE, got: ${assignment}`)
    }
    metrics[assignment.slice(0, equals)] = parseMetricValue(assignment.slice(equals + 1))
  }
  return metrics
}

const commands = {
  init: {
    spec: { values: ['--manuscript', '--pdf', '--bibliography', '--papers'] },
    run: ({ project, options }) =>
      initializeResearchProject(project, {
        manuscript: options['--manuscript'],
        pdf: options['--pdf'],
        bibliography: options['--bibliography'],
        papers: options['--papers']
      })
  },
  migrate: {
    spec: { values: ['--paper-dir'], booleans: ['--dry-run'] },
    run: ({ project, options }) =>
      migrateProjectLayout(project, {
        paperDirectory: options['--paper-dir'],
        dryRun: Boolean(options['--dry-run'])
      })
  },
  experiment: {
    spec: { values: ['--name'], required: ['--name'] },
    run: ({ project, options }) => createExperiment(project, options['--name'])
  },
  'new-run': {
    spec: {
      values: [...runCreationValues, '--command', '--commit', '--capture-phase', '--captured-at'],
      repeatable: ['--metric-def'],
      required: ['--experiment', '--name']
    },
    run: ({ project, options }) =>
      createRun(project, {
        ...runCreationOptions(options),
        command: options['--command'],
        commit: options['--commit'],
        capturePhase: options['--capture-phase'],
        capturedAt: options['--captured-at']
      })
  },
  validate: {
    spec: {},
    run: ({ project }) => validateResearchProject(project),
    failed: (result) => result.issues.length > 0
  },
  verify: {
    spec: { values: ['--experiment', '--run'], booleans: ['--paper'] },
    run: ({ project, options }) =>
      verifyResearch(project, {
        experiment: options['--experiment'] ?? null,
        run: options['--run'] ?? null,
        paper: Boolean(options['--paper'])
      }),
    failed: (result) => result.verdict === 'blocked'
  },
  context: {
    spec: { values: ['--experiment', '--limit'] },
    run: ({ project, options }) =>
      projectContext(project, {
        experiment: options['--experiment'] ?? null,
        limit: integerOption(options, '--limit') ?? 10
      })
  },
  'run list': {
    spec: { values: ['--experiment', '--state'] },
    run: ({ project, options }) =>
      listRuns(project, {
        experiment: options['--experiment'] ?? null,
        state: options['--state'] ?? null
      })
  },
  'run show': {
    spec: { values: ['--log-lines'], positionals: 1 },
    run: ({ project, options, positionals }) =>
      showRun(project, positionals[0], { logLines: integerOption(options, '--log-lines') ?? 20 })
  },
  'run exec': {
    spec: {
      values: [...runCreationValues, '--cwd'],
      booleans: ['--preflight', '--loop-preflight'],
      repeatable: ['--metric-def'],
      required: ['--experiment'],
      passthrough: true
    },
    run: ({ project, options, passthrough, json, io }) =>
      execRun(
        project,
        {
          ...runCreationOptions(options),
          argv: passthrough ?? [],
          cwd: options['--cwd'],
          preflight: options['--loop-preflight'] ? 'loop' : options['--preflight'] ? 'single' : null
        },
        {
          stdout: json ? process.stderr : process.stdout,
          stderr: process.stderr,
          notice: io.notice
        }
      ),
    exitCode: (result) => {
      if (result.spawnError) {
        return 127
      }
      if (result.signal) {
        return 128 + (osConstants.signals[result.signal] ?? 0)
      }
      return result.exitCode ?? 1
    }
  },
  'run log-metric': {
    spec: {
      values: ['--run', '--step', '--split', '--timestamp'],
      positionals: Infinity,
      required: ['--run']
    },
    run: ({ project, options, positionals }) =>
      logMetric(project, options['--run'], {
        step: numberOption(options, '--step'),
        split: options['--split'],
        timestamp: options['--timestamp'],
        metrics: metricAssignments(positionals)
      })
  },
  'run finish': {
    spec: {
      values: ['--run', '--status', '--exit-code', '--note'],
      booleans: ['--force'],
      required: ['--run', '--status']
    },
    run: ({ project, options }) =>
      finishRun(project, options['--run'], {
        status: options['--status'],
        exitCode: integerOption(options, '--exit-code'),
        note: options['--note'],
        force: Boolean(options['--force'])
      })
  },
  'run attach-artifact': {
    spec: {
      values: ['--run', '--file', '--mode', '--name', '--kind', '--step', '--label', '--sample'],
      required: ['--run', '--file']
    },
    run: ({ project, options }) =>
      attachArtifact(project, options['--run'], {
        file: options['--file'],
        mode: options['--mode'],
        name: options['--name'],
        kind: options['--kind'],
        step: numberOption(options, '--step'),
        label: options['--label'],
        sampleId: options['--sample']
      })
  },
  'claim add': {
    spec: {
      values: [...evidenceValues, '--text', '--file', '--line', '--anchor', '--id', '--created-by'],
      booleans: ['--supporting'],
      required: ['--text', '--run', '--metric']
    },
    run: ({ project, options }) =>
      addClaim(project, {
        id: options['--id'],
        text: options['--text'],
        createdBy: options['--created-by'],
        evidence: evidenceInput(options),
        manuscript: {
          file: options['--file'],
          line: integerOption(options, '--line'),
          anchor: options['--anchor']
        }
      })
  },
  'claim add-evidence': {
    spec: {
      values: [...evidenceValues, '--id'],
      booleans: ['--supporting'],
      required: ['--id', '--run', '--metric']
    },
    run: ({ project, options }) =>
      addClaimEvidence(project, options['--id'], evidenceInput(options))
  },
  'claim list': { spec: {}, run: ({ project }) => listClaims(project) },
  'claim audit': {
    spec: { values: ['--id'] },
    run: ({ project, options }) => auditClaims(project, { id: options['--id'] ?? null }),
    failed: (result) => result.summary.mismatch + result.summary.missingEvidence > 0
  },
  'claim refresh': {
    spec: { values: ['--id'], required: ['--id'] },
    run: ({ project, options }) => refreshClaim(project, options['--id'])
  },
  'claim remove': {
    spec: { values: ['--id'], required: ['--id'] },
    run: ({ project, options }) => removeClaim(project, options['--id'])
  },
  'claim scan': {
    spec: { values: ['--file'] },
    run: ({ project, options }) => scanUnbackedNumbers(project, { file: options['--file'] ?? null })
  },
  'loop note': {
    spec: {
      values: ['--experiment', '--kind', '--text', '--run', '--hypothesis', '--data'],
      required: ['--experiment', '--kind', '--text']
    },
    run: ({ project, options }) =>
      appendLoopNote(project, {
        experiment: options['--experiment'],
        kind: options['--kind'],
        text: options['--text'],
        run: options['--run'],
        hypothesis: options['--hypothesis'],
        data: jsonObjectOption(options, '--data')
      })
  },
  'loop show': {
    spec: { values: ['--experiment', '--limit'], required: ['--experiment'] },
    run: ({ project, options }) =>
      readLoopLedger(project, options['--experiment'], {
        limit: integerOption(options, '--limit') ?? 20
      })
  }
}

// Why: each quality lane owns its command module; this file only merges them.
const laneClis = [briefCli, qualityCli, ratingsCli, proposalCli, organizeCli, analysisCli]
const usage = coreUsage + laneClis.map((cli) => cli.usage).join('')
const allCommands = Object.assign({}, ...laneClis.map((cli) => cli.commands), commands)
const allTextOutput = Object.assign({}, ...laneClis.map((cli) => cli.textOutput), textOutput)

async function main(argv) {
  const json = requestsJson(argv)
  const io = { notice: (message) => process.stderr.write(`[aster] ${message}\n`) }
  try {
    const { name, rest } = splitCommand(argv)
    if (!name || name === '--help' || name === 'help' || name === '-h') {
      process.stdout.write(usage)
      return
    }
    const command = allCommands[name]
    if (!command) {
      throw new HarnessError('usage', `Unknown command: ${name}. Run with --help for usage.`)
    }
    const { options, positionals, passthrough } = parseCommandArguments(rest, command.spec)
    if (options['--help']) {
      process.stdout.write(usage)
      return
    }
    const project = await resolveProjectRoot(options['--project'])
    const result = await command.run({ project, options, positionals, passthrough, json, io })
    if (json) {
      process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`)
    } else {
      const text = allTextOutput[name](result)
      ;(name === 'run exec' ? process.stderr : process.stdout).write(`${text}\n`)
    }
    if (command.exitCode) {
      process.exitCode = command.exitCode(result)
    } else if (command.failed?.(result)) {
      process.exitCode = 1
    }
  } catch (error) {
    const code = harnessErrorCode(error)
    if (json) {
      process.stdout.write(
        `${JSON.stringify({ ok: false, error: { code, message: error.message } })}\n`
      )
    } else {
      process.stderr.write(
        `${error.message}${code === 'usage' ? '\n\nRun with --help for usage.' : ''}\n`
      )
    }
    process.exitCode = 1
  }
}

await main(process.argv.slice(2))
