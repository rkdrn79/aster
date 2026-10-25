import { integerOption } from './research-cli-arguments.mjs'
import { runChecks } from './research-checks.mjs'
import { readExperimentBrief, updateExperimentBrief } from './research-experiment-brief.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { experimentSlug } from './research-layout.mjs'
import { researchPreflight } from './research-preflight.mjs'

const fieldOptions = {
  '--question': 'question',
  '--hypothesis': 'hypothesis',
  '--status': 'status',
  '--baseline': 'baseline',
  '--rubric': 'rubric',
  '--conclusion': 'conclusion'
}
const nestedOptions = {
  '--dataset-id': ['evaluation', 'datasetId'],
  '--dataset-revision': ['evaluation', 'datasetRevision'],
  '--eval-split': ['evaluation', 'split'],
  '--evaluator-revision': ['evaluation', 'evaluatorRevision'],
  '--triage': ['agentPolicy', 'triage'],
  '--proposals': ['agentPolicy', 'proposals']
}
// --clear names: brief fields in CLI spelling, plus the single values the set options write.
const clearable = {
  question: ['question'],
  hypothesis: ['hypothesis'],
  status: ['status'],
  'primary-metric': ['primaryMetric'],
  evaluation: ['evaluation'],
  'dataset-revision': ['evaluation', 'datasetRevision'],
  'eval-split': ['evaluation', 'split'],
  'evaluator-revision': ['evaluation', 'evaluatorRevision'],
  baseline: ['baseline'],
  'min-seeds': ['minSeeds'],
  rubric: ['rubric'],
  'agent-policy': ['agentPolicy'],
  triage: ['agentPolicy', 'triage'],
  proposals: ['agentPolicy', 'proposals'],
  conclusion: ['conclusion']
}
const setValues = [
  '--experiment',
  '--primary-metric',
  '--min-seeds',
  '--by',
  ...Object.keys(fieldOptions),
  ...Object.keys(nestedOptions)
]

/** `acc:maximize:val` → { name: 'acc', direction: 'maximize', split: 'val' }. */
function primaryMetricOption(spec) {
  const [name, direction, ...splitParts] = spec.split(':')
  if (!name || !['minimize', 'maximize'].includes(direction)) {
    throw new HarnessError(
      'invalid_argument',
      `Primary metric must look like NAME:minimize|maximize[:SPLIT]: ${spec}`
    )
  }
  return { name, direction, split: splitParts.join(':') || null }
}

function conflict(name) {
  return new HarnessError('usage', `Cannot set and clear ${name} at once`)
}

function briefPatch(options) {
  const patch = {}
  for (const [option, field] of Object.entries(fieldOptions)) {
    if (options[option] !== undefined) {
      patch[field] = options[option]
    }
  }
  if (options['--primary-metric'] !== undefined) {
    patch.primaryMetric = primaryMetricOption(options['--primary-metric'])
  }
  if (options['--min-seeds'] !== undefined) {
    patch.minSeeds = integerOption(options, '--min-seeds')
  }
  for (const [option, [field, key]] of Object.entries(nestedOptions)) {
    if (options[option] !== undefined) {
      patch[field] = { ...patch[field], [key]: options[option] }
    }
  }
  for (const name of options['--clear'] ?? []) {
    const target = clearable[name]
    if (!target) {
      throw new HarnessError(
        'invalid_argument',
        `Cannot clear ${name}; use one of: ${Object.keys(clearable).join(', ')}`
      )
    }
    const [field, key] = target
    if (key === undefined) {
      if (patch[field] !== undefined && patch[field] !== null) {
        throw conflict(name)
      }
      patch[field] = null
    } else if (patch[field] !== null) {
      if (patch[field]?.[key] !== undefined) {
        throw conflict(name)
      }
      patch[field] = { ...patch[field], [key]: null }
    }
  }
  if (!Object.keys(patch).length) {
    throw new HarnessError('usage', 'Pass at least one brief field to set or --clear')
  }
  return patch
}

export const commands = {
  preflight: {
    spec: { values: ['--experiment'], booleans: ['--loop'], required: ['--experiment'] },
    run: ({ project, options }) =>
      researchPreflight(project, options['--experiment'], { loop: Boolean(options['--loop']) }),
    failed: (result) => !result.ready
  },
  'brief show': {
    spec: { values: ['--experiment'], required: ['--experiment'] },
    run: async ({ project, options }) => ({
      experiment: experimentSlug(options['--experiment']),
      brief: await readExperimentBrief(project, options['--experiment'])
    })
  },
  'brief set': {
    spec: { values: setValues, repeatable: ['--clear'], required: ['--experiment'] },
    run: ({ project, options }) =>
      updateExperimentBrief(project, options['--experiment'], briefPatch(options), {
        by: options['--by']
      })
  },
  check: {
    spec: { values: ['--experiment', '--run'] },
    run: ({ project, options }) =>
      runChecks(project, {
        experiment: options['--experiment'] ?? null,
        run: options['--run'] ?? null
      }),
    failed: (result) => result.findings.some((finding) => finding.severity === 'fail')
  }
}

function metricLabel(metric) {
  return `${metric.split ? `${metric.split} ` : ''}${metric.name} (${metric.direction})`
}

function evaluationLabel(evaluation) {
  return [
    evaluation.datasetId,
    evaluation.datasetRevision && `revision ${evaluation.datasetRevision}`,
    evaluation.split && `split ${evaluation.split}`,
    evaluation.evaluatorRevision && `evaluator ${evaluation.evaluatorRevision}`
  ]
    .filter(Boolean)
    .join(' · ')
}

/** A brief as compact `key: value` lines; the `context` text output reuses them. */
export function briefTextLines(brief, indent = '') {
  const rows = [
    ['status', brief.status],
    ['question', brief.question],
    ['hypothesis', brief.hypothesis],
    ['primary metric', brief.primaryMetric && metricLabel(brief.primaryMetric)],
    ['evaluation', brief.evaluation && evaluationLabel(brief.evaluation)],
    ['baseline', brief.baseline],
    ['min seeds', brief.minSeeds],
    ['rubric', brief.rubric],
    [
      'agent policy',
      `triage ${brief.agentPolicy.triage} · proposals ${brief.agentPolicy.proposals}`
    ],
    ['conclusion', brief.conclusion]
  ]
  return rows
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([label, value]) => `${indent}${label}: ${value}`)
}

function briefText(result) {
  if (!result.brief) {
    return `Experiment ${result.experiment} has no brief yet. Add one with: brief set --experiment ${result.experiment} --question TEXT --primary-metric NAME:maximize --baseline EXPERIMENT/RUN`
  }
  const { updatedAt, updatedBy } = result.brief
  return [
    `Experiment ${result.experiment} brief`,
    ...briefTextLines(result.brief, '  '),
    ...(updatedAt ? [`  updated ${updatedAt}${updatedBy ? ` by ${updatedBy}` : ''}`] : [])
  ].join('\n')
}

function evidenceText(item) {
  if (item.kind === 'manifest') {
    return `${item.run} run.json ${item.field} = ${JSON.stringify(item.value ?? null)}`
  }
  if (item.kind === 'log') {
    return `${item.run} train.log lines ${item.fromLine}–${item.toLine}`
  }
  if (item.kind === 'metric') {
    const step = item.step === null ? '' : ` @${item.step}`
    return `${item.run} ${item.split ? `${item.split} ` : ''}${item.metric}${step} = ${item.value}`
  }
  if (item.kind === 'file') {
    return `${item.path}${item.line ? `:${item.line}` : ''}`
  }
  if (item.kind === 'sample') {
    return `${item.run} sample ${item.sampleId}`
  }
  return `claim ${item.claim}`
}

function checkText(result) {
  const counts = { fail: 0, warn: 0, info: 0 }
  const lines = []
  for (const finding of result.findings) {
    counts[finding.severity] += 1
    const target = finding.runs[0] ?? finding.experiment
    lines.push(`${finding.severity.padEnd(4)} ${finding.check} ${target}: ${finding.text}`)
    for (const item of finding.evidence) {
      lines.push(`       ${evidenceText(item)}`)
    }
  }
  lines.push(
    result.findings.length
      ? `Findings: ${counts.fail} fail, ${counts.warn} warn, ${counts.info} info`
      : 'No rule findings.'
  )
  return lines.join('\n')
}

export const textOutput = {
  preflight: (result) =>
    [
      `${result.experiment} ${result.mode} preflight: ${result.ready ? 'contract ready' : 'not ready'}`,
      ...result.blockers.map((item) => `BLOCK ${item.id}: ${item.message} — ${item.action}`),
      ...result.warnings.map((item) => `WARN  ${item.id}: ${item.message} — ${item.action}`),
      ...(result.loop?.budget
        ? [
            `Loop budget: ${result.loop.budget.runsUsed}/${result.loop.budget.maxRuns ?? '?'} Runs; ${result.loop.activeRuns.length} marked running; proposal policy ${result.loop.proposalPolicy}`
          ]
        : []),
      'Read-only check: no command was launched and no compute was reserved.'
    ].join('\n'),
  'brief show': briefText,
  'brief set': briefText,
  check: checkText
}

export const usage = `
Experiment brief and rule checks (brief lives in .aster/experiments/<slug>/experiment.json)
  preflight --experiment SLUG [--loop]        Read-only launch readiness: research contract,
                                         evaluation gaps, and optional loop budget/capacity.
                                         Exit 1 on blockers; warnings remain visible.
  brief show --experiment SLUG
  brief set --experiment SLUG [--question T] [--hypothesis T]
            [--status planned|running|analyzing|concluded|abandoned]
            [--primary-metric NAME:minimize|maximize[:SPLIT]] [--dataset-id ID]
            [--dataset-revision R] [--eval-split S] [--evaluator-revision R]
            [--baseline EXPERIMENT/RUN] [--min-seeds 1-20] [--rubric PROJECT-PATH]
            [--triage off|suggest|auto] [--proposals off|approval|budgeted] [--conclusion T]
            [--clear FIELD]... [--by user|agent]
                                         Omitted fields stay; --clear resets one, e.g. baseline,
                                         min-seeds, eval-split. --by defaults to agent inside an
                                         agent CLI, else user.
  check [--experiment SLUG] [--run EXPERIMENT/RUN]
                                         Rule findings on Run health, reproducibility, baseline
                                         comparability, seeds, outputs, and claims, with evidence
                                         read from the files. Exit 1 when any is a fail.
`
