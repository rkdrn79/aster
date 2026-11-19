import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { agentIdentityFromEnvironment } from './research-agent-identity.mjs'
import { integerOption, numberOption } from './research-cli-arguments.mjs'
import { HarnessError } from './research-harness-error.mjs'
import {
  approvePlan,
  planOverview,
  proposePlanStage,
  submitPlan
} from './research-plan-approval.mjs'
import { checkPlan } from './research-plan-checks.mjs'
import { estimateGpuHours, runCostHistory } from './research-plan-cost.mjs'
import { lossText } from './research-plan-fit.mjs'
import { premortemBrief, recordPremortem, resolvePremortem } from './research-plan-premortem.mjs'
import { createPlan, listPlans, setPlanBudget, showPlan, updatePlan } from './research-plan.mjs'

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** `--file PATH` or `--file -` for stdin, parsed as JSON. */
async function inputJson(options) {
  const file = options['--file']
  const text = file === '-' ? await readStdin() : await readFile(path.resolve(file), 'utf8')
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new HarnessError('invalid_json', `--file is not valid JSON: ${error.message}`)
  }
}

// Why: approving, cutting and stating the budget are the person's decisions, made in Aster.
function refuseAgentEnvironment(action) {
  if (agentIdentityFromEnvironment()?.provider) {
    throw new HarnessError(
      'not_allowed',
      `An agent cannot ${action}; the person does that in Aster`
    )
  }
}

function pairs(values, label) {
  return (values ?? []).map((value) => {
    const equals = value.indexOf('=')
    if (equals <= 0) {
      throw new HarnessError('usage', `${label} must look like ID=TEXT, got: ${value}`)
    }
    return [value.slice(0, equals), value.slice(equals + 1)]
  })
}

function decisionOption(value) {
  const [request, text] = value
  const [decision, ...reason] = text.split(':')
  return { request, decision, reason: reason.join(':') || null }
}

export const commands = {
  'plan new': {
    spec: { values: ['--title', '--id', '--file', '--by'] },
    run: async ({ project, options }) =>
      createPlan(project, {
        title: options['--title'],
        id: options['--id'],
        content: options['--file'] ? await inputJson(options) : undefined,
        by: options['--by']
      })
  },
  'plan list': { spec: {}, run: ({ project }) => listPlans(project) },
  'plan show': {
    spec: { values: ['--plan'] },
    run: ({ project, options }) => showPlan(project, options['--plan'])
  },
  'plan set': {
    spec: { values: ['--plan', '--file', '--by'], booleans: ['--merge'], required: ['--file'] },
    run: async ({ project, options }) =>
      updatePlan(project, options['--plan'], await inputJson(options), {
        merge: Boolean(options['--merge']),
        by: options['--by']
      })
  },
  'plan check': {
    spec: { values: ['--plan'] },
    run: ({ project, options }) => checkPlan(project, options['--plan']),
    failed: (result) => result.summary.fail > 0
  },
  'plan premortem': {
    spec: { values: ['--plan', '--reviewer', '--file', '--cli'], positionals: 1 },
    run: async ({ project, options, positionals }) => {
      const [action] = positionals
      if (action === 'brief') {
        return premortemBrief(project, options['--plan'], {
          reviewer: options['--reviewer'] ?? null,
          cli: options['--cli']
        })
      }
      if (action === 'record') {
        return recordPremortem(project, options['--plan'], await inputJson(requireFile(options)))
      }
      if (action === 'resolve') {
        return resolvePremortem(project, options['--plan'], await inputJson(requireFile(options)))
      }
      throw new HarnessError('usage', 'plan premortem takes brief|record|resolve')
    }
  },
  'plan submit': {
    spec: { values: ['--plan'] },
    run: ({ project, options }) => submitPlan(project, options['--plan'])
  },
  'plan overview': {
    spec: { values: ['--plan'] },
    run: ({ project, options }) => planOverview(project, options['--plan'])
  },
  'plan costs': { spec: {}, run: ({ project }) => runCostHistory(project) },
  'plan estimate': {
    spec: {
      values: [
        '--params',
        '--tokens',
        '--gpu',
        '--kind',
        '--mfu',
        '--step-seconds',
        '--steps',
        '--gpus'
      ]
    },
    run: ({ options }) =>
      estimateGpuHours({
        params: options['--params'],
        tokens: options['--tokens'],
        gpu: options['--gpu'],
        kind: options['--kind'],
        mfu: options['--mfu'] === undefined ? undefined : numberOption(options, '--mfu'),
        stepSeconds: options['--step-seconds'],
        steps: options['--steps'],
        gpus: options['--gpus']
      })
  },
  'plan budget': {
    spec: {
      values: ['--plan', '--gpu-hours', '--hardware', '--by'],
      required: ['--gpu-hours', '--by']
    },
    run: ({ project, options }) => {
      refuseAgentEnvironment('state the budget')
      return setPlanBudget(project, options['--plan'], {
        gpuHours: numberOption(options, '--gpu-hours'),
        hardware: options['--hardware'],
        by: options['--by']
      })
    }
  },
  'plan approve': {
    spec: {
      values: ['--plan', '--revision', '--by'],
      repeatable: ['--cut', '--decide'],
      required: ['--revision', '--by']
    },
    run: ({ project, options }) => {
      refuseAgentEnvironment('approve a plan')
      return approvePlan(project, options['--plan'], {
        revision: integerOption(options, '--revision'),
        cuts: pairs(options['--cut'], '--cut').map(([cell, reason]) => ({ cell, reason })),
        decisions: pairs(options['--decide'], '--decide').map(decisionOption),
        by: options['--by']
      })
    }
  },
  'plan propose-stage': {
    spec: { values: ['--plan', '--stage', '--by'], required: ['--stage', '--by'] },
    run: ({ project, options }) => {
      refuseAgentEnvironment('propose a stage')
      return proposePlanStage(project, options['--plan'], {
        stage: options['--stage'],
        by: options['--by']
      })
    }
  }
}

function requireFile(options) {
  if (!options['--file']) {
    throw new HarnessError('usage', '--file is required (a path, or - for stdin)')
  }
  return options
}

function findingLines(findings) {
  return findings.map(
    (finding) => `${finding.severity.padEnd(4)} ${finding.check} ${finding.target}: ${finding.text}`
  )
}

function checkText(result) {
  const { fail, warn, info } = result.summary
  return [
    ...findingLines(result.findings),
    result.findings.length
      ? `Plan ${result.plan} revision ${result.revision}: ${fail} fail, ${warn} warn, ${info} info`
      : `Plan ${result.plan} revision ${result.revision}: no findings.`
  ].join('\n')
}

function hours(value) {
  return value === null || value === undefined ? '?' : `${Number(Number(value).toFixed(1))}`
}

function fitLines(fit) {
  if (!fit || fit.plannableGpuHours === null) {
    return []
  }
  return [
    `Fit: cells ${hours(fit.keptGpuHours)} of ${hours(fit.plannableGpuHours)} plannable GPU-h (${Math.round(fit.budget.reserve * 100)}% spare)${fit.suggestions.length ? '; cut first:' : '; fits'}`,
    ...fit.suggestions.map(
      (entry) =>
        `  ${entry.cell} ${entry.tier} ${hours(entry.gpuHours)} GPU-h, priority ${entry.score}: ${lossText(entry.loses) ?? 'nothing lost'}`
    )
  ]
}

function overviewText(result) {
  const { tiers, coverage, order, premortem, summary } = result
  return [
    `${result.plan.title} (${result.plan.id}) · revision ${result.plan.revision} · ${result.plan.status}`,
    `Compute: ${tiers.budget.gpuHours === null ? 'not stated (ask the person)' : `${hours(tiers.budget.gpuHours)} GPU-h, ${tiers.budget.source}`}`,
    ...fitLines(result.fit),
    ...tiers.tiers.map(
      (tier) =>
        `  ${tier.tier.padEnd(6)} ${String(tier.cells.length).padStart(3)} cells ${hours(tier.gpuHours).padStart(7)} GPU-h  cumulative ${hours(tier.cumulativeGpuHours)}${tier.fits === null ? '' : tier.fits ? ' fits' : ' over'}`
    ),
    'Claims:',
    ...coverage.claims.map(
      (claim) =>
        `  ${claim.id} ${claim.status.padEnd(13)} ${claim.entries.map((entry) => `${entry.question}:${entry.included.length}`).join(' ') || '—'}  ${claim.text}`
    ),
    'Run order:',
    ...order.stages.map(
      (stage) =>
        `  ${stage.id} ${stage.name}: ${stage.cells.length} cells, ${hours(stage.gpuHours)} GPU-h; gate: ${stage.gate ?? 'none'}`
    ),
    `Pre-mortem: ${premortem.requests.length} requests, ${premortem.open.length} open, ${premortem.asks.length} for the person`,
    `Checks: ${summary.fail} fail, ${summary.warn} warn, ${summary.info} info`
  ].join('\n')
}

function planLine(plan) {
  return `${plan.id} · ${plan.status} · revision ${plan.revision}  "${plan.title}"`
}

export const textOutput = {
  'plan new': (result) =>
    `Created plan ${result.id} (${result.path}). Fill it with plan set --plan ${result.id} --file plan.json, then plan check.`,
  'plan list': (result) =>
    result.plans.length
      ? result.plans.map(planLine).join('\n')
      : `No plans in ${result.directory}.`,
  'plan show': (result) => result.markdown,
  'plan set': (result) =>
    `Plan ${result.id} is revision ${result.revision} (${result.status}). Run plan check.`,
  'plan check': checkText,
  'plan premortem': (result) =>
    result.briefs
      ? result.briefs
          .map((brief) => `=== Simulated reviewer ${brief.reviewer} ===\n${brief.prompt}`)
          .join('\n\n')
      : `Plan ${result.id} is revision ${result.revision}.${result.added ? ` Recorded ${result.added.join(', ')}; resolve each with plan premortem resolve.` : ''}`,
  'plan submit': (result) =>
    [
      `Plan ${result.plan} revision ${result.revision} submitted (${result.findings.warn} warn, ${result.findings.info} info open). The person approves it in Aster; end your turn.`,
      result.library?.requested.length
        ? `Asked Aster to add ${result.library.requested.length} closest prior paper${result.library.requested.length === 1 ? '' : 's'} to the project Library (library add); the person's setting decides.`
        : null,
      ...(result.library?.failed ?? []).map(
        (entry) => `Could not ask for "${entry.title}" in the Library: ${entry.error}`
      )
    ]
      .filter(Boolean)
      .join('\n'),
  'plan overview': overviewText,
  'plan costs': (result) =>
    [
      result.runs.length
        ? "This project's timed Runs (GPU-h = hours × GPUs; GPUs from the command, else 1):"
        : 'No timed Runs in this project yet: estimate with plan estimate, and add an S0 timing cell.',
      ...result.runs.map(
        (run) =>
          `  ${run.ref} ${run.state} ${run.hours} h × ${run.gpus} GPU${run.gpusFrom === 'assumed' ? ' (assumed)' : ''} = ${run.gpuHours} GPU-h${run.name ? `  ${run.name}` : ''}`
      ),
      ...result.experiments.map(
        (entry) =>
          `  ${entry.experiment}: ${entry.runs} Runs, median ${entry.medianGpuHours} GPU-h, max ${entry.maxGpuHours}`
      )
    ].join('\n'),
  'plan estimate': (result) =>
    `${result.gpuHours} GPU-h per run: ${result.basis}. Quote this basis in plan.costBasis.`,
  'plan budget': (result) =>
    `Plan ${result.id} budget: ${result.plan.scope.compute.gpuHours} GPU-h (stated by the person).`,
  'plan approve': (result) =>
    `Plan ${result.plan} revision ${result.revision} approved; ${result.proposals.length} proposals created: ${result.proposals.map((item) => `${item.experiment}/${item.proposal} (${item.cell})`).join(', ') || 'none'}.`,
  'plan propose-stage': (result) =>
    `Stage ${result.stage}: ${result.proposals.length} proposals created.`
}

export const usage = `
Experiment plan, above Experiments (.aster/plans/<id>/plan.json, plan.md, decisions.jsonl)
  plan new --title TEXT [--id ID] [--file PLAN-JSON|-]
                                         Create a draft plan (format: the aster-research-track
                                         skill, section "Experiment design")
  plan list | plan show [--plan ID]      show prints plan.md; --json gives the plan object
  plan set [--plan ID] --file PLAN-JSON|- [--merge]
                                         Replace the plan's content (--merge: only the top-level
                                         fields given). Bumps the revision; back to draft
  plan check [--plan ID]                 Checklist findings (plan.*): fail blocks submitting.
                                         Exit 1 on any fail
  plan premortem brief [--plan ID] [--reviewer R1|R2|R3]
                                         Briefs for the simulated reviewers; run each in a fresh
                                         context when you can
  plan premortem record [--plan ID] --file JSON|-
                                         {"reviewer":"R1","requests":[{"category","request","why",
                                         "likelihood","names"}]}
  plan premortem resolve [--plan ID] --file JSON|-
                                         {"resolutions":[{"id":"PM3","as":"plan|out-of-scope|ask",
                                         "items":["cell or item IDs"],"reason","costGpuHours"}]}
  plan submit [--plan ID]                Hand the plan to the person; refused while fails remain
  plan overview [--plan ID]              Tiers, fit to the compute (cuts by priority), coverage,
                                         run order, pre-mortem and checks
  plan costs                             This project's timed Runs as cost evidence (GPU-hours)
  plan estimate --params N --tokens N [--gpu a100] [--kind train|infer] [--mfu 0.35]
  plan estimate --step-seconds S --steps N [--gpus G]
                                         GPU-hours for one run: 6·N·D (train) or 2·N·D (infer) at
                                         an MFU, or a measured step time; prints the basis to quote
  The person's commands (refused inside an agent session; Aster's Plan view runs them):
  plan budget [--plan ID] --gpu-hours N [--hardware TEXT] --by user
  plan approve [--plan ID] --revision N [--cut CELL=REASON]... [--decide PM3=include|out-of-scope:REASON]... --by user
                                         Pins the revision and proposes the first stage's cells
  plan propose-stage [--plan ID] --stage S1 --by user
`
